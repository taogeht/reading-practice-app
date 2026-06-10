/**
 * Process the static icon PNGs under public/images/icons/ in place:
 *   1. strip Gemini's chroma-green / checkerboard background → real alpha
 *      (flood-fill from the edges, so green that's part of the subject —
 *       a frog, tree, dino — is preserved),
 *   2. downscale to a retina-safe cap,
 *   3. re-encode with palette compression.
 *
 * AI tools (nano-banana / Gemini 2.5 Flash Image) emit ~1024px PNGs on a solid
 * green background, often 1MB+. This turns them into transparent ~30KB icons.
 *
 * Safe to re-run after adding icons (stripping a transparent image is a no-op;
 * output converges to a stable small PNG).
 *
 *   npx tsx scripts/optimize-icons.ts            # strip + cap at 256px
 *   npx tsx scripts/optimize-icons.ts 192        # custom max dimension
 *   npx tsx scripts/optimize-icons.ts --no-strip # skip background removal
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripGeminiBackground } from '../src/lib/generation/strip-background';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'images', 'icons');
const STRIP = !process.argv.includes('--no-strip');
const MAX = Number(process.argv.find((a) => /^\d+$/.test(a))) || 256;

function walk(d: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.png$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  const files = walk(DIR);
  if (files.length === 0) {
    console.log('No PNGs under public/images/icons/ yet — nothing to do.');
    return;
  }

  let before = 0, after = 0;
  const kb = (n: number) => `${(n / 1024).toFixed(0).padStart(5)}KB`;

  for (const f of files) {
    const input = readFileSync(f);
    before += input.length;

    let buf: Buffer = input;
    if (STRIP) buf = await stripGeminiBackground(buf); // green/checkerboard → alpha

    const out = await sharp(buf)
      .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
      .toBuffer();

    writeFileSync(f, out);
    after += out.length;
    console.log(`${kb(input.length)} -> ${kb(out.length)}  ${f.replace(ROOT + '/', '')}`);
  }

  console.log(`\nTotal: ${(before / 1048576).toFixed(2)}MB -> ${(after / 1048576).toFixed(2)}MB across ${files.length} files`);
  console.log(`${STRIP ? 'Stripped background + ' : ''}capped ${MAX}px. Watch above for any "removed 0 pixels" warnings (means no clean green border).`);
}

main().catch((err) => {
  console.error('optimize-icons failed:', err);
  process.exit(1);
});
