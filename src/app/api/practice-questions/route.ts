import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceQuestions } from '@/lib/db/schema';
import { generateQuestions, type QuestionType } from '@/lib/practice/generate';
import { isAvailablePracticeUnit } from '@/lib/practice/units';
import { DEFAULT_BOOK_SLUG, isUnitAvailableForBook, isValidBookSlug } from '@/lib/practice/books';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_GENERATE = 20;

// Generates images for a batch of inserted practice questions and patches
// imageUrl onto each row. Designed to be called as a fire-and-forget
// background task — never throws, swallows per-question errors so one bad
// image doesn't poison the rest of the batch.
async function generateImagesInBackground(
  rows: { id: string; imagePrompt: string | null }[],
  unit: number,
) {
  for (const row of rows) {
    if (!row.imagePrompt) continue;
    try {
      const result = await geminiImageClient.generateScene(row.imagePrompt);
      if (!result.success || !result.imageBuffer) {
        logError(new Error(result.error || 'Image generation failed'), `practice-questions.image[${row.id}]`);
        continue;
      }
      const key = r2Client.generatePracticeImageKey(unit, row.id);
      const imageUrl = await r2Client.uploadFile(
        key,
        result.imageBuffer,
        result.contentType || 'image/png',
      );
      await db
        .update(practiceQuestions)
        .set({ imageUrl })
        .where(eq(practiceQuestions.id, row.id));
    } catch (err) {
      logError(err, `practice-questions.image[${row.id}]`);
    }
    // Light rate-limit (Gemini free tier: ~10 req/min)
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const unitParam = url.searchParams.get('unit');
  const unit = unitParam ? Number(unitParam) : null;
  const bookSlugParam = url.searchParams.get('bookSlug');
  const bookSlug = bookSlugParam && isValidBookSlug(bookSlugParam) ? bookSlugParam : null;

  const conditions = [];
  if (unit) conditions.push(eq(practiceQuestions.unit, unit));
  if (bookSlug) conditions.push(eq(practiceQuestions.bookSlug, bookSlug));

  const rows = await db
    .select()
    .from(practiceQuestions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(practiceQuestions.createdAt));

  return NextResponse.json({ questions: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    bookSlug?: unknown;
    unit?: unknown;
    count?: unknown;
    questionType?: unknown;
    currentUnitVocabRatio?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawBookSlug = typeof body.bookSlug === 'string' ? body.bookSlug : DEFAULT_BOOK_SLUG;
  if (!isValidBookSlug(rawBookSlug)) {
    return NextResponse.json({ error: 'Invalid bookSlug' }, { status: 400 });
  }
  const bookSlug = rawBookSlug;
  const unit = Number(body.unit);
  const count = Math.min(Number(body.count) || 5, MAX_GENERATE);
  const requestedType = body.questionType;
  const questionType: QuestionType =
    requestedType === 'true_false'
      ? 'true_false'
      : requestedType === 'sentence_builder'
        ? 'sentence_builder'
        : 'fill_blank_mcq';

  let currentUnitVocabRatio = 0.6;
  if (body.currentUnitVocabRatio !== undefined) {
    const r = Number(body.currentUnitVocabRatio);
    if (!Number.isFinite(r) || r < 0 || r > 1) {
      return NextResponse.json(
        { error: 'currentUnitVocabRatio must be a number between 0 and 1' },
        { status: 400 }
      );
    }
    currentUnitVocabRatio = r;
  }

  // For Family and Friends 1 we keep the legacy unit gate (units 12–15) so the
  // existing student practice flows aren't disturbed. For any other book the
  // book's own availableUnits list is the source of truth.
  const validUnit =
    bookSlug === DEFAULT_BOOK_SLUG
      ? isAvailablePracticeUnit(unit)
      : isUnitAvailableForBook(bookSlug, unit);
  if (!validUnit) {
    return NextResponse.json(
      { error: `No curated curriculum for ${bookSlug} unit ${unit} yet.` },
      { status: 400 }
    );
  }
  if (count < 1) {
    return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
  }

  try {
    const generated = await generateQuestions({ bookSlug, unit, count, questionType, currentUnitVocabRatio });
    if (generated.length === 0) {
      return NextResponse.json(
        { error: 'Generator returned no valid questions. Try again.' },
        { status: 502 }
      );
    }

    const inserted = await db
      .insert(practiceQuestions)
      .values(
        generated.map((q) => ({
          bookSlug,
          unit,
          questionType,
          prompt: q.prompt,
          correctAnswer: q.correctAnswer,
          distractors: q.distractors,
          payload: q.payload ?? null,
          imagePrompt: q.imagePrompt,
          generatedBy: user.id,
        }))
      )
      .returning();

    // Image generation runs as fire-and-forget so this endpoint returns before
    // Cloudflare's 100s upstream timeout. The Node process keeps the promise
    // alive (this server is dockerized, not serverless). Teachers see questions
    // immediately; images populate as Gemini finishes — the teacher page
    // auto-polls until imageUrl is filled in.
    const pending = inserted.filter((r) => r.imagePrompt).length;
    void generateImagesInBackground(inserted, unit);

    return NextResponse.json({
      questions: inserted,
      requested: count,
      accepted: inserted.length,
      imagesPending: pending,
    });
  } catch (error) {
    logError(error, 'practice-questions.generate');
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
