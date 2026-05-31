import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import {
  readingPassages,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  validatePagesProse,
  type PassagePlan,
  type ValidationIssue,
} from '@/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '@/lib/reading/generate/vocab';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string; pageNumber: string }>;
}

const MAX_PAGE_TEXT_LENGTH = 500;

/** PATCH /api/teacher/reading/passages/[passageId]/pages/[pageNumber]
 *  Inline text edit for a single page. Updates the row, stamps
 *  editedAt/editedBy, then re-runs the prose validator against the
 *  whole passage with this page's new text swapped in. The passage's
 *  generationMeta.qualityReport.proseScore is refreshed so the review
 *  badge stays accurate.
 *
 *  Image regeneration is NOT triggered — the reviewer asked for a
 *  fast text fix; if the image needs to follow, the existing
 *  "Regenerate this page" button covers that. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { passageId, pageNumber: pageNumberRaw } = await params;
    const pageNumber = parseInt(pageNumberRaw, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json(
        { error: 'pageNumber must be a positive integer' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json(
        { error: 'text must be a non-empty string' },
        { status: 400 },
      );
    }
    if (text.length > MAX_PAGE_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `text exceeds max length (${MAX_PAGE_TEXT_LENGTH} chars)` },
        { status: 400 },
      );
    }

    // 1. Load passage + plan.
    const [passage] = await db
      .select()
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    const generationMeta = (passage.generationMeta as PassageGenerationMeta | null) ?? {};
    const planFromMeta = generationMeta.plan as PassagePlan | undefined;
    if (!planFromMeta) {
      return NextResponse.json(
        {
          error:
            'Plan not available for this passage. Cannot re-validate without it; reject and regenerate.',
        },
        { status: 400 },
      );
    }

    // 2. Load all pages so we can swap this one in for re-validation.
    const allPages = await db
      .select()
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    const targetPage = allPages.find((p) => p.pageNumber === pageNumber);
    if (!targetPage) {
      return NextResponse.json(
        { error: `Page ${pageNumber} not in this passage` },
        { status: 404 },
      );
    }

    // 3. Update the row (text + edit stamps). Persist before validation —
    //    if the validator throws for any reason, the edit still survives.
    await db
      .update(storyPages)
      .set({
        text,
        editedAt: new Date(),
        editedBy: user.id,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(storyPages.passageId, passageId),
          eq(storyPages.pageNumber, pageNumber),
        ),
      );

    // 4. Re-resolve the same vocab the prose validator used at
    //    generation time, then run validatePagesProse against the
    //    modified-in-memory page set.
    const targetIds = (passage.targetVocabIds as string[]) ?? [];
    const targetRowsFull = await fetchTargetVocab(targetIds);
    const cumulativeFull = await resolveCumulativeVocab(targetRowsFull, undefined);

    const pagesForValidation = allPages.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.pageNumber === pageNumber ? text : p.text,
    }));

    const validation = validatePagesProse(
      pagesForValidation,
      planFromMeta,
      passage.readingLevel,
      cumulativeFull.map((r) => ({ id: r.id, word: r.word })),
      targetRowsFull.map((r) => ({ id: r.id, word: r.word })),
    );

    // 5. Refresh proseScore on the passage's generationMeta. Other
    //    quality fields (questionsScore, imagesValid, passageReady)
    //    aren't recomputed here — the edit only affects prose.
    const existingQuality = generationMeta.qualityReport ?? {
      proseScore: 0,
      questionsScore: 0,
      imagesValid: false,
      passageReady: false,
    };
    const newGenerationMeta: PassageGenerationMeta = {
      ...generationMeta,
      qualityReport: {
        ...existingQuality,
        proseScore: validation.qualityScore,
        // Re-derive passageReady conservatively — keep the existing
        // gate logic but recompute only the prose half. If prose drops
        // below the threshold, ready flips false.
        passageReady:
          existingQuality.questionsScore > 0 &&
          existingQuality.imagesValid &&
          validation.qualityScore >= 0.7 &&
          existingQuality.questionsScore >= 0.5,
      },
    };

    await db
      .update(readingPassages)
      .set({ generationMeta: newGenerationMeta, updatedAt: sql`now()` })
      .where(eq(readingPassages.id, passageId));

    // 6. Filter issues to those affecting the edited page (plus any
    //    story-wide issues like target_word_missing that don't carry
    //    a pageNumber but might now apply to the whole story).
    const pageIssues = validation.issues.filter((i: ValidationIssue) => {
      if (i.type === 'target_word_missing') return true;
      return 'pageNumber' in i && i.pageNumber === pageNumber;
    });

    logInfo(
      `page text edited`,
      `api/teacher/reading/passages/edit-page passage_id=${passageId} page=${pageNumber} edited_by=${user.id} prose_score=${validation.qualityScore.toFixed(2)} page_issues=${pageIssues.length}`,
    );

    return NextResponse.json(
      {
        page: {
          pageNumber,
          text,
          editedAt: new Date().toISOString(),
          editedBy: user.id,
          editorName: `${user.firstName} ${user.lastName}`.trim(),
        },
        validation: {
          proseScore: validation.qualityScore,
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          pageIssues,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/edit-page');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
