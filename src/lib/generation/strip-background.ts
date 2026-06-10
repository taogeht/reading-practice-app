import sharp from 'sharp';

// Strips Gemini's background and replaces it with real alpha transparency.
// Gemini's compliance with the lime-green prompt is inconsistent — sometimes
// it draws on green, sometimes a grey checkerboard, occasionally solid white.
// Instead of chroma-keying a specific color, we flood-fill from the image
// corners and propagate inward, sampling whatever colors are actually there.
// The fill stops at the character outline (saturated/colored pixels), so
// character interiors are preserved even if they happen to contain the same
// "background" color in isolated regions (e.g. white sparkles inside an eye,
// or a green frog whose body never touches the green border).
//
// Tolerance is sized to bridge the two near-grey shades of a typical checker-
// board (~20 brightness apart) but not so wide that an unrelated saturated
// character pixel gets caught. Anti-alias edges around the character end up
// either fully opaque (kept) or fully transparent (stripped) — no soft alpha,
// which is fine for chibi-style art with thick outlines.
//
// Shared by the avatar pipeline (src/lib/generation/avatars.ts) and the static
// icon optimizer (scripts/optimize-icons.ts).
export async function stripGeminiBackground(input: Buffer): Promise<Buffer> {
    const { data, info } = await sharp(input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) return input; // shouldn't happen after ensureAlpha
    const { width, height } = info;
    const buf = Buffer.from(data);

    // Sample 8 edge/corner pixels as our "background palette." More samples
    // than just the 4 corners catches the case where one corner happens to
    // sit on the rare alternate-shade square in a 2-color checkerboard.
    const seedCoords: Array<[number, number]> = [
        [0, 0],
        [width - 1, 0],
        [0, height - 1],
        [width - 1, height - 1],
        [Math.floor(width / 2), 0],
        [Math.floor(width / 2), height - 1],
        [0, Math.floor(height / 2)],
        [width - 1, Math.floor(height / 2)],
    ];
    const samples: Array<[number, number, number]> = seedCoords.map(([x, y]) => {
        const idx = (y * width + x) * 4;
        return [buf[idx], buf[idx + 1], buf[idx + 2]];
    });

    const TOLERANCE_SQ = 55 * 55; // per-channel Euclidean ~55
    const isBackground = (r: number, g: number, b: number): boolean => {
        for (const [sr, sg, sb] of samples) {
            const dr = r - sr;
            const dg = g - sg;
            const db = b - sb;
            if (dr * dr + dg * dg + db * db < TOLERANCE_SQ) return true;
        }
        return false;
    };

    // Iterative flood-fill. Stack stores packed pixel indices (y*width + x).
    const visited = new Uint8Array(width * height);
    const stack: number[] = [];
    for (const [x, y] of seedCoords) stack.push(y * width + x);

    let stripped = 0;
    while (stack.length) {
        const p = stack.pop()!;
        if (visited[p]) continue;
        const idx = p * 4;
        if (!isBackground(buf[idx], buf[idx + 1], buf[idx + 2])) continue;
        visited[p] = 1;
        buf[idx + 3] = 0;
        stripped++;
        const x = p % width;
        const y = (p - x) / width;
        if (x > 0) stack.push(p - 1);
        if (x < width - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - width);
        if (y < height - 1) stack.push(p + width);
    }

    const pct = ((stripped / (width * height)) * 100).toFixed(1);
    if (stripped === 0) {
        console.warn('[stripGeminiBackground] flood-fill removed 0 pixels — image may have been generated without a clean background border');
    } else if (stripped < width * height * 0.05) {
        console.warn(`[stripGeminiBackground] only stripped ${pct}% of pixels — background may not be flooding correctly`);
    }

    return sharp(buf, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
}
