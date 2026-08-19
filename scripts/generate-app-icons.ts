// Regenerates the app icons from the brand source image.
//
// Next.js App Router picks these up by filename convention from src/app/ and
// injects the <link> tags itself — there is no manifest to keep in sync:
//   favicon.ico   served at /favicon.ico for direct requests and old clients
//   icon.png      the modern <link rel="icon">
//   apple-icon.png  iOS home-screen icon
//
// The source lives in images/ rather than public/ because it is a build input,
// not something the site should serve at full size — it is ~430KB, which is
// two orders of magnitude too big for a favicon.
//
// Usage:
//   npm run icons:generate
//   npm run icons:generate -- --source=images/some-other-logo.png

import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

const ARGS = process.argv.slice(2);
const source = ARGS.find((a) => a.startsWith('--source='))?.slice('--source='.length)
  ?? 'images/starling-icon.png';

const APP_DIR = path.resolve(process.cwd(), 'src/app');

/** Wrap a PNG in a single-image .ico container.
 *
 *  Sharp cannot write ICO, and the format is small enough to assemble by hand:
 *  a 6-byte ICONDIR, one 16-byte ICONDIRENTRY, then the PNG bytes verbatim.
 *  PNG-compressed icons are understood by every browser since IE11, and are far
 *  smaller than the legacy BMP encoding. */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type 1 = icon
  header.writeUInt16LE(1, 4);          // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // 0 encodes 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);              // palette size (0 = no palette)
  entry.writeUInt8(0, 3);              // reserved
  entry.writeUInt16LE(1, 4);           // colour planes
  entry.writeUInt16LE(32, 6);          // bits per pixel
  entry.writeUInt32LE(png.length, 8);  // image byte length
  entry.writeUInt32LE(22, 12);         // offset: 6 header + 16 entry

  return Buffer.concat([header, entry, png]);
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.cwd(), source);
  if (!fs.existsSync(sourcePath)) throw new Error(`No source image at ${sourcePath}`);

  const meta = await sharp(sourcePath).metadata();
  console.log(`Source: ${source} (${meta.width}x${meta.height}, ${(fs.statSync(sourcePath).size / 1024).toFixed(0)}KB)`);

  // `cover` rather than `contain`: the source is 1073x1079, so squaring it
  // crops ~3px rather than letterboxing a near-square image.
  const square = (size: number) =>
    sharp(sourcePath).resize(size, size, { fit: 'cover', position: 'centre' }).png({ quality: 90 });

  const outputs: [string, number][] = [['icon.png', 512], ['apple-icon.png', 180]];
  for (const [name, size] of outputs) {
    const buf = await square(size).toBuffer();
    fs.writeFileSync(path.join(APP_DIR, name), buf);
    console.log(`  ${name.padEnd(16)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)}KB`);
  }

  const icoPng = await square(48).toBuffer();
  const ico = pngToIco(icoPng, 48);
  fs.writeFileSync(path.join(APP_DIR, 'favicon.ico'), ico);
  console.log(`  favicon.ico      48x48    ${(ico.length / 1024).toFixed(1)}KB`);

  console.log('\nDone. Next.js links these automatically from src/app/.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
