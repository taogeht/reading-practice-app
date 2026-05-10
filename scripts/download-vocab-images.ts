import './_bootstrap-env';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { r2Client } from '../src/lib/storage/r2-client';

async function main() {
  const passageId = process.argv[2];
  const words = process.argv.slice(3);
  if (!passageId || words.length === 0) {
    console.error('Usage: tsx scripts/download-vocab-images.ts <passageId> <word:vocabId> ...');
    process.exit(1);
  }
  const outDir = path.join(homedir(), 'Desktop', 'test-images', 'vocab-v2');
  await mkdir(outDir, { recursive: true });
  for (const wv of words) {
    const [word, vocabId] = wv.split(':');
    if (!word || !vocabId) continue;
    const key = r2Client.generateStoryVocabImageKey(passageId, vocabId);
    const obj = await r2Client.getObject(key);
    if (!obj || !obj.body) {
      console.error(`✗ ${word} — not found at ${key}`);
      continue;
    }
    const reader = obj.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    const dest = path.join(outDir, `${word}.png`);
    await writeFile(dest, buf);
    console.log(`✓ ${word.padEnd(10)} ${(buf.length / 1024).toFixed(1).padStart(6)} KB → ${dest}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
