import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import type { TestDocument, TestItem } from './test-types';

// Re-reads the test row, sets one item's imageUrl by id, writes the document
// back. Re-reading each call keeps the background image pass from clobbering a
// concurrent title/active edit, and (because image generation is sequential)
// there's no write/write race on the blob itself.
async function patchItemImage(testId: string, itemId: string, imageUrl: string): Promise<boolean> {
  const rows = await db
    .select({ document: generatedTests.document })
    .from(generatedTests)
    .where(eq(generatedTests.id, testId))
    .limit(1);
  const doc = rows[0]?.document;
  if (!doc) return false;

  let touched = false;
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.id === itemId) {
        item.imageUrl = imageUrl;
        touched = true;
      }
    }
  }
  if (!touched) return false;

  await db.update(generatedTests).set({ document: doc }).where(eq(generatedTests.id, testId));
  return true;
}

// Generates a Gemini scene for every item that has an imagePrompt but no image
// yet, patching each url in as it lands so the print page can poll progressively.
// Fire-and-forget: never throws, swallows per-item errors so one bad image
// doesn't poison the rest. Mirrors the practice-questions background pass.
export async function generateTestImages(testId: string, document: TestDocument): Promise<void> {
  const pending = document.sections
    .flatMap((s) => s.items)
    .filter((it) => it.imagePrompt && !it.imageUrl);

  for (const item of pending) {
    try {
      const result = await geminiImageClient.generateScene(item.imagePrompt as string);
      if (!result.success || !result.imageBuffer) {
        logError(new Error(result.error || 'Image generation failed'), `tests.image[${item.id}]`);
        continue;
      }
      const key = r2Client.generateTestImageKey(testId, item.id);
      const imageUrl = await r2Client.uploadFile(
        key,
        result.imageBuffer,
        result.contentType || 'image/png',
      );
      await patchItemImage(testId, item.id, imageUrl);
    } catch (err) {
      logError(err, `tests.image[${item.id}]`);
    }
    // Light rate-limit (Gemini free tier: ~10 req/min), same as practice.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

// Regenerates a single item's image (optionally from an overridden prompt) and
// returns the updated url, or null on failure. Used by the per-item regenerate
// endpoint, so this one DOES surface success/failure to the caller.
export async function regenerateTestItemImage(
  testId: string,
  itemId: string,
  overridePrompt?: string,
): Promise<{ imageUrl: string; imagePrompt: string } | null> {
  const rows = await db
    .select({ document: generatedTests.document })
    .from(generatedTests)
    .where(eq(generatedTests.id, testId))
    .limit(1);
  const doc = rows[0]?.document;
  if (!doc) return null;

  let target: TestItem | null = null;
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.id === itemId) target = item;
    }
  }
  if (!target) return null;

  const prompt = (overridePrompt ?? target.imagePrompt ?? '').trim();
  if (!prompt) return null;

  const result = await geminiImageClient.generateScene(prompt);
  if (!result.success || !result.imageBuffer) {
    throw new Error(result.error || 'Image generation failed');
  }
  const key = r2Client.generateTestImageKey(testId, itemId);
  const imageUrl = await r2Client.uploadFile(
    key,
    result.imageBuffer,
    result.contentType || 'image/png',
  );

  // Persist the new url + prompt back into the blob. This path is user-initiated
  // (not racing the background pass for the same item), so a single full write of
  // the doc we just mutated is fine.
  target.imageUrl = imageUrl;
  target.imagePrompt = prompt;
  await db.update(generatedTests).set({ document: doc }).where(eq(generatedTests.id, testId));
  return { imageUrl, imagePrompt: prompt };
}
