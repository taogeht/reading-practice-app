// Live check of the Gemini image profiles: that the model ids resolve, the
// response shape is unchanged, and — the point of the exercise — that the
// requested resolution is actually honoured.
//
// Google's docs disagree on where resolution lives for generateContent
// (generationConfig.responseFormat.image vs generationConfig.imageConfig), and
// there are open reports of the parameter being silently ignored. Silently
// ignored means paying 1K prices for panels, so this measures the returned
// pixels instead of trusting the request.
//
// Costs about $0.08. Usage:
//   npm run smoke:images

import './_bootstrap-env';
import sharp from 'sharp';
import { geminiImageClient } from '../src/lib/image/gemini-client';

async function report(label: string, run: () => Promise<{ success: boolean; imageBuffer?: Buffer; error?: string }>) {
  const startedAt = Date.now();
  const result = await run();
  const ms = Date.now() - startedAt;
  if (!result.success || !result.imageBuffer) {
    console.log(`  ${label.padEnd(28)} FAILED after ${ms}ms — ${result.error}`);
    return null;
  }
  const meta = await sharp(result.imageBuffer).metadata();
  const kb = (result.imageBuffer.length / 1024).toFixed(0);
  console.log(`  ${label.padEnd(28)} ${meta.width}x${meta.height}  ${kb}KB  ${ms}ms`);
  return meta;
}

async function main(): Promise<void> {
  if (!geminiImageClient.isConfigured()) throw new Error('GEMINI_API_KEY is not set');

  console.log('Catalog path — gemini-3.1-flash-lite-image, 1K only (spelling, scenes):');
  await report('generateImage("apple")', () => geminiImageClient.generateImage('apple'));

  console.log('\nPanel path — gemini-3.1-flash-image, imageSize 512 (story pages):');
  const panel = await report('generateImagePanel', () =>
    geminiImageClient.generateImagePanel({
      prompt: 'A simple cartoon illustration of a child flying a red kite in a green park, bright and friendly, for a picture book.',
      label: 'smoke-panel',
    }),
  );

  // "512" is a pixel BUDGET, not a width: the model picks the aspect ratio, so
  // the 512 tier came back as 704x384 rather than 512x512. Compare total pixels
  // against the ~1MP the 1K tier produces, not either dimension.
  if (panel?.width && panel.height) {
    const megapixels = (panel.width * panel.height) / 1_000_000;
    const honoured = megapixels < 0.6;
    console.log(
      `\nPanel is ${megapixels.toFixed(2)}MP — 512 tier ${honoured ? 'HONOURED' : 'IGNORED'} (1K tier is ~1.0MP).`,
    );
    if (!honoured) {
      console.log('  imageSize is not taking effect, so panels are billed at the larger tier.');
      console.log('  Check generationConfig.imageConfig in gemini-client.ts.');
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('SMOKE FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
