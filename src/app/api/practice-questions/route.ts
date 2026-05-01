import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceQuestions } from '@/lib/db/schema';
import { generateQuestions, type QuestionType } from '@/lib/practice/generate';
import { isAvailablePracticeUnit } from '@/lib/practice/units';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const MAX_GENERATE = 10;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const unitParam = url.searchParams.get('unit');
  const unit = unitParam ? Number(unitParam) : null;

  const conditions = unit ? [eq(practiceQuestions.unit, unit)] : [];

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

  let body: { unit?: unknown; count?: unknown; questionType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const unit = Number(body.unit);
  const count = Math.min(Number(body.count) || 5, MAX_GENERATE);
  const questionType: QuestionType =
    body.questionType === 'true_false' ? 'true_false' : 'fill_blank_mcq';
  if (!isAvailablePracticeUnit(unit)) {
    return NextResponse.json(
      { error: 'No curated curriculum for that unit yet.' },
      { status: 400 }
    );
  }
  if (count < 1) {
    return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
  }

  try {
    const generated = await generateQuestions({ unit, count, questionType });
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
          unit,
          questionType,
          prompt: q.prompt,
          correctAnswer: q.correctAnswer,
          distractors: q.distractors,
          imagePrompt: q.imagePrompt,
          generatedBy: user.id,
        }))
      )
      .returning();

    // Best-effort image generation: a question without an image is still
    // usable, so we don't fail the batch if Gemini hiccups on one.
    let imageSuccessCount = 0;
    for (const row of inserted) {
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
          result.contentType || 'image/png'
        );
        await db
          .update(practiceQuestions)
          .set({ imageUrl })
          .where(eq(practiceQuestions.id, row.id));
        row.imageUrl = imageUrl;
        imageSuccessCount += 1;
      } catch (err) {
        logError(err, `practice-questions.image[${row.id}]`);
      }
      // Light rate-limit (Gemini free tier: ~10 req/min)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return NextResponse.json({
      questions: inserted,
      requested: count,
      accepted: inserted.length,
      imagesGenerated: imageSuccessCount,
    });
  } catch (error) {
    logError(error, 'practice-questions.generate');
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
