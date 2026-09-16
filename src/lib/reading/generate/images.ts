// Stage 5 of the reading-passage generation pipeline: produce one
// illustration per page using the panel image model (see src/lib/image).
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

import { imageClient, PANEL_IMAGE_MODEL } from '@/lib/image';
import { logInfo } from '@/lib/logger';
import {
  getReadingArtStyle,
  toImageStyle,
  type ReadingArtStyleId,
} from '@/lib/reading/art-styles';
import type {
  GeneratedPageImage,
  GeneratedPageProse,
  GeneratePassageImagesInput,
  GeneratePassageImagesResult,
  IllustrationDensity,
  ImageStyle,
  ImageValidationIssue,
  ImageValidationResult,
  PageIllustrationPlan,
  PassagePagePlan,
  PassagePlan,
} from './types';

// Reported in logs and generationMeta; sourced from the image module so a
// model change cannot leave this pointing at a retired id.
const MODEL = PANEL_IMAGE_MODEL;

/** Default house style applied when the caller doesn't override. */
export const DEFAULT_IMAGE_STYLE: ImageStyle = toImageStyle(getReadingArtStyle('watercolor'));

/** Resolves an ImageStyle from either an explicit ImageStyle object or an artStyleId. */
export function resolveImageStyle(
  styleOrId?: ImageStyle | ReadingArtStyleId | string | null,
): ImageStyle {
  if (!styleOrId) return DEFAULT_IMAGE_STYLE;
  if (typeof styleOrId === 'object' && 'promptSuffix' in styleOrId) {
    return styleOrId;
  }
  return toImageStyle(getReadingArtStyle(styleOrId));
}

/** Minimum / maximum bytes for a "looks-plausible" image. Outside this
 *  range the validator emits a warning. The minimum filters out the
 *  occasional truncated response (corrupt PNG ~5KB); the maximum
 *  catches over-eager 4K renders that'd blow R2 storage costs. */
const IMAGE_MIN_BYTES = 10_000;
const IMAGE_MAX_BYTES = 5_000_000;
const ACCEPTABLE_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

// ---------- Illustration Plan Resolver ----------

/**
 * Resolves the illustration plan for a set of story page numbers and a given density.
 * In 'every_page' mode, every page has an illustration role 'required'.
 * In 'half_pages' mode (two-page spreads), the first page of each pair (e.g. 1, 3, 5)
 * is 'required', and the second page (e.g. 2, 4, 6) is 'paired_text' sharing that illustration.
 */
export function resolvePageIllustrationPlan(
  pageNumbers: number[],
  density: IllustrationDensity = 'every_page',
): PageIllustrationPlan[] {
  const sorted = [...pageNumbers].sort((a, b) => a - b);
  if (density === 'half_pages') {
    return sorted.map((pageNumber, idx) => {
      const spreadIndex = Math.floor(idx / 2) + 1;
      const isFirstInSpread = idx % 2 === 0;
      const illustrationPageNumber = isFirstInSpread
        ? pageNumber
        : sorted[idx - 1] ?? pageNumber;
      return {
        pageNumber,
        spreadIndex,
        illustrationRole: isFirstInSpread ? 'required' : 'paired_text',
        illustrationPageNumber,
      };
    });
  }
  return sorted.map((pageNumber, idx) => ({
    pageNumber,
    spreadIndex: idx + 1,
    illustrationRole: 'required',
    illustrationPageNumber: pageNumber,
  }));
}

// ---------- Prompt construction ----------

/** Compose the prompt sent to Gemini for a given page. Character
 *  descriptions from the plan are repeated in EVERY prompt — the
 *  reference image gives visual anchoring, the text descriptions give
 *  semantic anchoring; both together carry character consistency
 *  across panels far better than either alone.
 *
 *  Layer priority:
 *  1. [MOMENT TO ILLUSTRATE] from final prose (authoritative action).
 *  2. [PHYSICAL OBJECT STATES] derived cues (e.g. open door, held items).
 *  3. [CHARACTERS] with permanent identity anchors.
 *  4. [SETTING & COMPOSITION] background & environment.
 *  5. Style suffix.
 */
export function buildImagePrompt(
  page: PassagePagePlan,
  plan: PassagePlan,
  style: ImageStyle = DEFAULT_IMAGE_STYLE,
  proseText?: string,
): string {
  const promptParts: string[] = [];

  // Layer 1: Final prose moment and action (authoritative over earlier plan draft)
  if (proseText?.trim()) {
    promptParts.push(`[MOMENT TO ILLUSTRATE]: "${proseText.trim()}"`);

    // Physical state cues derived from prose
    const lowerProse = proseText.toLowerCase();
    const stateRules: string[] = [];
    if (/\b(open|opens|opened|opening)\b/.test(lowerProse)) {
      stateRules.push('Any door, window, or container described as being opened must be shown visibly wide open');
    }
    if (/\b(close|closes|closed|shut)\b/.test(lowerProse)) {
      stateRules.push('Any door, window, or container described as closed/shut must be shown visibly closed');
    }
    if (/\b(hold|holds|holding|held|carry|carries|carrying|pick up|picks up|picked up)\b/.test(lowerProse)) {
      stateRules.push('Items being held or carried must be shown visibly in the character\'s hands');
    }
    if (/\b(sit|sits|sitting|sat)\b/.test(lowerProse)) {
      stateRules.push('Character must be visibly seated');
    }
    if (/\b(run|runs|running|ran|jump|jumps|jumping|jumped)\b/.test(lowerProse)) {
      stateRules.push('Character must be in dynamic active motion');
    }

    if (stateRules.length > 0) {
      promptParts.push(`[PHYSICAL OBJECT STATES]: ${stateRules.join('; ')}`);
    }
  }

  // Layer 2: Characters with permanent identity anchors
  const characterDescriptions = plan.characters
    .map((c) => `${c.name} (${c.description})`)
    .join('; ');
  promptParts.push(
    `[CHARACTERS]: ${characterDescriptions}. Keep facial features, hair style, skin tone, and signature clothing colors strictly consistent`,
  );

  // Layer 3: Setting & environment (with scene framing from plan)
  promptParts.push(`[SETTING & COMPOSITION]: ${plan.setting}. Framing details: ${page.sceneDescription}`);

  // Layer 4: Action directive
  if (proseText?.trim()) {
    promptParts.push(
      'DIRECTIVE: Illustrate the exact moment described in [MOMENT TO ILLUSTRATE]. Do not show a previous or subsequent state (for example, if an action was completed, show the finished result)',
    );
  }

  // Layer 5: Visual style
  if (style.promptSuffix) {
    promptParts.push(style.promptSuffix.trimStart());
  }

  return promptParts.filter(Boolean).join('. ');
}

// ---------- Main entry point ----------

/** Generate illustrations for pages in the plan.
 *  In 'every_page' mode, 1 image per page.
 *  In 'half_pages' mode, 1 image per 2-page spread.
 *  Page 1 cold, subsequent required pages with page 1 as reference. Sequential.
 */
export async function generatePassageImages(
  input: GeneratePassageImagesInput,
): Promise<GeneratePassageImagesResult> {
  if (!(await imageClient.isConfigured())) {
    throw new Error('Image generation is not configured. Set GEMINI_API_KEY (or OPENAI_API_KEY if using GPT Image), or check the image.generationModel setting.');
  }
  if (input.pages.length === 0) {
    throw new Error('generatePassageImages: pages[] is empty');
  }

  const density = input.illustrationDensity ?? 'every_page';
  const style = input.style ?? DEFAULT_IMAGE_STYLE;
  const planByPageNumber = new Map(input.plan.pages.map((p) => [p.pageNumber, p]));
  const proseByPageNumber = new Map(input.pages.map((p) => [p.pageNumber, p.text]));

  // Calculate page illustration plan
  const illustrationPlans = resolvePageIllustrationPlan(
    input.pages.map((p) => p.pageNumber),
    density,
  );
  // Only pages with illustrationRole === 'required' need an image
  const requiredPlans = illustrationPlans.filter((ip) => ip.illustrationRole === 'required');

  const generated: GeneratedPageImage[] = [];
  const perPageDurationMs: number[] = [];
  const startedAt = Date.now();

  let pageOneImage: GeneratedPageImage | null = null;
  for (let idx = 0; idx < requiredPlans.length; idx++) {
    const item = requiredPlans[idx];
    const planPage = planByPageNumber.get(item.pageNumber);
    if (!planPage) {
      console.error(
        `[generatePassageImages] page ${item.pageNumber} has required illustration plan but no plan entry — skipping`,
      );
      perPageDurationMs.push(0);
      continue;
    }

    // If half_pages, find all prose pages belonging to this spread so the prompt reflects the full spread
    const spreadPages = illustrationPlans.filter((ip) => ip.spreadIndex === item.spreadIndex);
    const combinedProse = spreadPages
      .map((sp) => proseByPageNumber.get(sp.pageNumber))
      .filter(Boolean)
      .join(' ');

    const isFirstPage = pageOneImage === null;
    const prompt = buildImagePrompt(planPage, input.plan, style, combinedProse);
    const t0 = Date.now();

    const result = await imageClient.generateImagePanel({
      prompt,
      referenceImage: isFirstPage
        ? undefined
        : { buffer: pageOneImage!.buffer, mimeType: pageOneImage!.mimeType },
      label: `passage page ${item.pageNumber}${density === 'half_pages' ? ` (spread ${item.spreadIndex})` : ''}`,
    });

    const durationMs = Date.now() - t0;
    perPageDurationMs.push(durationMs);

    if (!result.success || !result.imageBuffer) {
      const msg =
        result.error ?? `unknown error from ${MODEL}`;
      if (isFirstPage) {
        // Without a page-1 reference, every subsequent page would drift
        // visually. Bail loudly.
        throw new Error(
          `generatePassageImages: page 1 generation failed (${msg}). Cannot proceed without a reference image.`,
        );
      }
      console.error(
        `[generatePassageImages] page ${item.pageNumber} failed: ${msg} — continuing without it`,
      );
      continue;
    }

    const image: GeneratedPageImage = {
      pageNumber: item.pageNumber,
      buffer: result.imageBuffer,
      mimeType: result.contentType ?? 'image/png',
      promptUsed: prompt,
      referenceImageUsed: !isFirstPage,
    };
    generated.push(image);
    if (isFirstPage) pageOneImage = image;
    input.onPageGenerated?.(item.pageNumber, requiredPlans.length);
  }

  const totalDurationMs = Date.now() - startedAt;

  logInfo(
    `passage images generated (${generated.length}/${requiredPlans.length} required images, density=${density})`,
    `lib/reading/generate/images model=${MODEL} pages_generated=${generated.length} pages_required=${requiredPlans.length} total_duration_ms=${totalDurationMs}`,
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
  density: IllustrationDensity = 'every_page',
): ImageValidationResult {
  const issues: ImageValidationIssue[] = [];

  const plans = resolvePageIllustrationPlan(
    pages.map((p) => p.pageNumber),
    density,
  );
  const requiredCount = plans.filter((p) => p.illustrationRole === 'required').length;

  // Count mismatch — every required illustration should have a corresponding image.
  if (images.length !== requiredCount) {
    issues.push({
      type: 'image_count_mismatch',
      severity: 'error',
      expected: requiredCount,
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
