import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readingPassages, storyPages } from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { logError, logInfo } from '@/lib/logger';
import {
  buildImagePrompt,
  generateSinglePage,
  type PassagePlan,
} from '@/lib/reading/generate';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string; pageNumber: string }>;
}

/** Per-page regeneration: rewrite ONE page's prose + image, leaving
 *  every other page and every question untouched. The image goes to a
 *  versioned R2 key so the proxy's 1-year cache header doesn't serve
 *  stale bytes. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { passageId, pageNumber: pageNumberRaw } = await params;
    const pageNumber = parseInt(pageNumberRaw, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json(
        { error: 'pageNumber must be a positive integer' },
        { status: 400 },
      );
    }

    // 1. Load the passage row + every page row.
    const [passage] = await db
      .select()
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    const planFromMeta = (passage.generationMeta as { plan?: unknown } | null)?.plan as
      | PassagePlan
      | undefined;
    if (!planFromMeta) {
      return NextResponse.json(
        {
          error:
            'Plan not available for this passage. Regenerate the entire passage to enable per-page regeneration.',
        },
        { status: 400 },
      );
    }

    const allPages = await db
      .select()
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    const targetPageRow = allPages.find((p) => p.pageNumber === pageNumber);
    if (!targetPageRow) {
      return NextResponse.json(
        { error: `Page ${pageNumber} not in this passage` },
        { status: 400 },
      );
    }

    // 2. Regenerate prose for the target page using the others as
    //    continuity context.
    const otherPagesText = allPages
      .filter((p) => p.pageNumber !== pageNumber)
      .map((p) => ({ pageNumber: p.pageNumber, text: p.text }));

    const proseResult = await generateSinglePage({
      plan: planFromMeta,
      pageNumber,
      otherPagesText,
      readingLevelId: passage.readingLevel,
    });

    // 3. Regenerate image. The character-consistency anchor is the
    //    EXISTING page-1 image — fetch it from R2 and pass as reference.
    const pageOneRow = allPages.find((p) => p.pageNumber === 1);
    if (!pageOneRow?.imageKey) {
      return NextResponse.json(
        {
          error:
            "Page 1 has no image_key on file; cannot anchor character consistency. Regenerate the entire passage instead.",
        },
        { status: 400 },
      );
    }

    let referenceImage: { buffer: Buffer; mimeType: string } | undefined;
    if (pageNumber !== 1) {
      const refObj = await r2Client.getObject(pageOneRow.imageKey);
      if (!refObj || !refObj.body) {
        return NextResponse.json(
          { error: 'Page 1 reference image missing from R2' },
          { status: 500 },
        );
      }
      // r2Client.getObject returns a Web ReadableStream; collect it
      // into a Node Buffer for the Gemini multi-part request.
      const reader = refObj.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      referenceImage = {
        buffer: Buffer.concat(chunks),
        mimeType: refObj.contentType ?? 'image/png',
      };
    }

    const planPage = planFromMeta.pages.find((p) => p.pageNumber === pageNumber);
    if (!planPage) {
      return NextResponse.json(
        { error: `Page ${pageNumber} not in plan` },
        { status: 400 },
      );
    }
    const imagePrompt = buildImagePrompt(planPage, planFromMeta);
    const imageResult = await geminiImageClient.generateImagePanel({
      prompt: imagePrompt,
      referenceImage,
      label: `regen page ${pageNumber} of ${passageId}`,
    });
    if (!imageResult.success || !imageResult.imageBuffer) {
      return NextResponse.json(
        { error: `Image generation failed: ${imageResult.error ?? 'unknown'}` },
        { status: 502 },
      );
    }

    // 4. Determine next version number for the image key. Existing key
    //    `page-N.png` → v2. `page-N.v2.png` → v3. Otherwise → v2.
    const nextVersion = nextImageVersion(targetPageRow.imageKey);
    const newKey = r2Client.generateStoryImageKeyVersioned(
      passageId,
      pageNumber,
      nextVersion,
    );
    await r2Client.uploadFile(newKey, imageResult.imageBuffer, imageResult.contentType ?? 'image/png', {
      'passage-id': passageId,
      'page-number': String(pageNumber),
      'regen-version': String(nextVersion),
      'regenerated-by': user.id,
    });

    // 5. Update the storyPages row in place.
    await db
      .update(storyPages)
      .set({
        text: proseResult.page.text,
        imageKey: newKey,
        imagePromptUsed: imagePrompt,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(storyPages.passageId, passageId),
          eq(storyPages.pageNumber, pageNumber),
        ),
      );

    // 6. Bump the passage's updatedAt so the review queue reflects the change.
    await db
      .update(readingPassages)
      .set({ updatedAt: sql`now()` })
      .where(eq(readingPassages.id, passageId));

    logInfo(
      `page regenerated`,
      `api/teacher/reading/passages/regenerate-page passage_id=${passageId} page=${pageNumber} new_key=${newKey} regenerated_by=${user.id}`,
    );

    return NextResponse.json(
      {
        page: {
          pageNumber,
          text: proseResult.page.text,
          imageKey: newKey,
          imagePromptUsed: imagePrompt,
        },
        meta: { proseTokens: proseResult.meta },
      },
      { status: 200 },
    );
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/regenerate-page');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/** Increment the version suffix on an existing image key. Recognises
 *  `page-N.png` (returns 2) and `page-N.v{K}.png` (returns K+1). */
function nextImageVersion(currentKey: string | null): number {
  if (!currentKey) return 2;
  const match = currentKey.match(/\.v(\d+)\.png$/);
  if (match) return parseInt(match[1]!, 10) + 1;
  return 2;
}
