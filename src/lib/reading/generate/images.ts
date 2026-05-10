// Stage 5 of the reading-passage generation pipeline: produce one
// illustration per page using gemini-2.5-flash-image (Nano-Banana).
//
// The hard problem is character consistency — the same girl in
// pigtails on every page, not a different girl every panel. We solve
// it the same way Nano-Banana works best: generate page 1 cold, then
// pass page 1's buffer as a REFERENCE IMAGE for pages 2..N. Sequential,
// not parallel — there's a model-side warmup effect when reusing the
// reference, and it also keeps us under per-second rate limits.
//
// validatePassageImages is a synchronous companion that flags
// missing/empty/oversized images. It does NOT verify the image
// matches the scene — that requires a vision model and is overkill
// for v1; the teacher review queue catches semantic mistakes.

import { geminiImageClient } from '@/lib/image/gemini-client';
import { logInfo } from '@/lib/logger';
import type {
  GeneratedPageImage,
  GeneratedPageProse,
  GeneratePassageImagesInput,
  GeneratePassageImagesResult,
  ImageStyle,
  ImageValidationIssue,
  ImageValidationResult,
  PassagePagePlan,
  PassagePlan,
} from './types';

const MODEL = 'gemini-2.5-flash-image';

/** Default house style applied when the caller doesn't override.
 *  The "no text / no words / no letters" repetition is intentional —
 *  image models notoriously generate garbled text otherwise, and ESL
 *  kids should not see misspelled English in an illustration. */
export const DEFAULT_IMAGE_STYLE: ImageStyle = {
  promptSuffix:
    ', soft watercolor illustration style, warm pastel colors, ' +
    'simple shapes, friendly faces, white background, no text in image, ' +
    "no words, no letters, children's book illustration, age 6-10",
  aspectRatio: '1:1',
};

/** Minimum / maximum bytes for a "looks-plausible" image. Outside this
 *  range the validator emits a warning. The minimum filters out the
 *  occasional truncated response (corrupt PNG ~5KB); the maximum
 *  catches over-eager 4K renders that'd blow R2 storage costs. */
const IMAGE_MIN_BYTES = 10_000;
const IMAGE_MAX_BYTES = 5_000_000;
const ACCEPTABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

// ---------- Prompt construction ----------

/** Compose the prompt sent to Gemini for a given page. Character
 *  descriptions from the plan are repeated in EVERY prompt — the
 *  reference image gives visual anchoring, the text descriptions give
 *  semantic anchoring; both together carry character consistency
 *  across panels far better than either alone. */
export function buildImagePrompt(
  page: PassagePagePlan,
  plan: PassagePlan,
  style: ImageStyle = DEFAULT_IMAGE_STYLE,
): string {
  const characterDescriptions = plan.characters
    .map((c) => `${c.name} (${c.description})`)
    .join('; ');

  return [
    page.sceneDescription,
    `Characters in this scene: ${characterDescriptions}`,
    `Setting: ${plan.setting}`,
    style.promptSuffix.trimStart(),
  ]
    .filter(Boolean)
    .join('. ');
}

// ---------- Main entry point ----------

/** Generate one image per page in the plan. Page 1 cold, pages 2..N
 *  with page 1 as reference. Sequential. If page 1 fails we throw —
 *  without a reference, the rest can't preserve character consistency
 *  and partial output isn't useful. If a later page fails we log,
 *  skip it (so it's missing from result.pages), and let the validator
 *  catch the count mismatch.
 *
 *  v1 reuses page 1 as the library cover (coverImage = pages[0]).
 *  Easy to upgrade to a dedicated cover-shot generation later. */
export async function generatePassageImages(
  input: GeneratePassageImagesInput,
): Promise<GeneratePassageImagesResult> {
  if (!geminiImageClient.isConfigured()) {
    throw new Error('Gemini is not configured. Set GEMINI_API_KEY.');
  }
  if (input.pages.length === 0) {
    throw new Error('generatePassageImages: pages[] is empty');
  }

  const style = input.style ?? DEFAULT_IMAGE_STYLE;
  const planByPageNumber = new Map(input.plan.pages.map((p) => [p.pageNumber, p]));

  const generated: GeneratedPageImage[] = [];
  const perPageDurationMs: number[] = [];
  const startedAt = Date.now();

  // Walk pages in pageNumber order — the reference-image trick depends
  // on page 1 going first.
  const ordered = [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber);

  let pageOneImage: GeneratedPageImage | null = null;
  for (const proseRow of ordered) {
    const planPage = planByPageNumber.get(proseRow.pageNumber);
    if (!planPage) {
      console.error(
        `[generatePassageImages] page ${proseRow.pageNumber} has prose but no plan entry — skipping`,
      );
      perPageDurationMs.push(0);
      continue;
    }

    const isFirstPage = pageOneImage === null;
    const prompt = buildImagePrompt(planPage, input.plan, style);
    const t0 = Date.now();

    const result = await geminiImageClient.generateImagePanel({
      prompt,
      referenceImage: isFirstPage
        ? undefined
        : { buffer: pageOneImage!.buffer, mimeType: pageOneImage!.mimeType },
      label: `passage page ${proseRow.pageNumber}`,
    });

    const durationMs = Date.now() - t0;
    perPageDurationMs.push(durationMs);

    if (!result.success || !result.imageBuffer) {
      const msg =
        result.error ?? 'unknown error from gemini-2.5-flash-image';
      if (isFirstPage) {
        // Without a page-1 reference, every subsequent page would drift
        // visually. Bail loudly.
        throw new Error(
          `generatePassageImages: page 1 generation failed (${msg}). Cannot proceed without a reference image.`,
        );
      }
      console.error(
        `[generatePassageImages] page ${proseRow.pageNumber} failed: ${msg} — continuing without it`,
      );
      continue;
    }

    const image: GeneratedPageImage = {
      pageNumber: proseRow.pageNumber,
      buffer: result.imageBuffer,
      mimeType: result.contentType ?? 'image/png',
      promptUsed: prompt,
      referenceImageUsed: !isFirstPage,
    };
    generated.push(image);
    if (isFirstPage) pageOneImage = image;
  }

  const totalDurationMs = Date.now() - startedAt;

  logInfo(
    `passage images generated (${generated.length}/${input.pages.length} pages)`,
    `lib/reading/generate/images model=${MODEL} pages_generated=${generated.length} pages_expected=${input.pages.length} total_duration_ms=${totalDurationMs}`,
  );

  return {
    pages: generated,
    coverImage: pageOneImage ?? undefined,
    meta: { model: MODEL, totalDurationMs, perPageDurationMs },
  };
}

// ---------- Validation ----------

export function validatePassageImages(
  images: GeneratedPageImage[],
  pages: GeneratedPageProse[],
): ImageValidationResult {
  const issues: ImageValidationIssue[] = [];

  // Count mismatch — every prose page should have a corresponding image.
  if (images.length !== pages.length) {
    issues.push({
      type: 'image_count_mismatch',
      severity: 'error',
      expected: pages.length,
      actual: images.length,
    });
  }

  for (const img of images) {
    if (!img.buffer || img.buffer.length === 0) {
      issues.push({
        type: 'image_buffer_empty',
        severity: 'error',
        pageNumber: img.pageNumber,
      });
      continue;
    }
    if (img.buffer.length < IMAGE_MIN_BYTES) {
      issues.push({
        type: 'image_too_small',
        severity: 'warning',
        pageNumber: img.pageNumber,
        sizeBytes: img.buffer.length,
      });
    } else if (img.buffer.length > IMAGE_MAX_BYTES) {
      issues.push({
        type: 'image_too_large',
        severity: 'warning',
        pageNumber: img.pageNumber,
        sizeBytes: img.buffer.length,
      });
    }
    if (!ACCEPTABLE_MIME_TYPES.has(img.mimeType)) {
      issues.push({
        type: 'mime_type_unexpected',
        severity: 'warning',
        pageNumber: img.pageNumber,
        mimeType: img.mimeType,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const qualityScore = Math.max(
    0,
    1.0 - errorCount * 0.2 - warningCount * 0.05,
  );

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    qualityScore,
    issues,
  };
}
