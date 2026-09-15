import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  validatePagesProse,
  type GenerateOverrides,
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
    const overrides = generationMeta.overridesUsed as GenerateOverrides | undefined;
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
        // Narration is derived from page text. Clearing it prevents a
        // successfully edited page from serving audio for the old prose.
        ttsAudioKey: null,
        ttsVoice: null,
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
      targetRowsFull.map((r) => ({
        id: r.id,
        word: r.word,
        afFLevel: r.afFLevel,
        afFUnit: r.afFUnit,
      })),
      overrides,
    );

    // 5. Track staleness and hashes across dependent assets:
    //    - Compute text hash for change tracking.
    //    - Detect questions on this page whose evidence quotes no longer match the edited text.
    //    - Mark the page illustration as stale (text changed since image was generated).
    //    - Force passageReady to false: text edits invalidate audio and require teacher re-approval.
    const sourceTextHash = crypto
      .createHash('sha256')
      .update(text)
      .digest('hex')
      .slice(0, 16);

    const passageQuestions = await db
      .select({
        id: readingQuestions.id,
        evidenceQuote: readingQuestions.evidenceQuote,
        evidencePageNumber: readingQuestions.evidencePageNumber,
      })
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, passageId));

    const staleQuestionIdsSet = new Set<string>(generationMeta.staleQuestionIds ?? []);
    for (const q of passageQuestions) {
      if (q.evidencePageNumber === pageNumber && q.evidenceQuote) {
        if (!text.includes(q.evidenceQuote)) {
          staleQuestionIdsSet.add(q.id);
        } else {
          // If a prior edit broke it, but this edit restored the quote, clear staleness
          staleQuestionIdsSet.delete(q.id);
        }
      }
    }
    const staleQuestionIds = Array.from(staleQuestionIdsSet);

    const stalePageImagesSet = new Set<number>(generationMeta.stalePageImages ?? []);
    stalePageImagesSet.add(pageNumber);
    const stalePageImages = Array.from(stalePageImagesSet).sort((a, b) => a - b);

    const pageTextHashes: Record<number, string> = {
      ...(generationMeta.pageTextHashes ?? {}),
      [pageNumber]: sourceTextHash,
    };

    const existingQuality = generationMeta.qualityReport ?? {
      proseScore: 0,
      questionsScore: 0,
      imagesValid: false,
      passageReady: false,
    };

    const newGenerationMeta: PassageGenerationMeta = {
      ...generationMeta,
      stalePageImages,
      staleQuestionIds,
      pageTextHashes,
      qualityReport: {
        ...existingQuality,
        proseScore: validation.qualityScore,
        // Teacher edits invalidate audio, may desync illustrations/questions,
        // and require re-approval before the passage can be assigned/published.
        passageReady: false,
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
      `api/teacher/reading/passages/edit-page passage_id=${passageId} page=${pageNumber} edited_by=${user.id} prose_score=${validation.qualityScore.toFixed(2)} page_issues=${pageIssues.length} broken_evidence_count=${staleQuestionIds.length}`,
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
        stalePageImages,
        staleQuestionIds,
        passageReady: false,
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
