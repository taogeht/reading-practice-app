import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceQuestions } from '@/lib/db/schema';
import { generateQuestions } from '@/lib/practice/generate';
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

  let body: { unit?: unknown; count?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const unit = Number(body.unit);
  const count = Math.min(Number(body.count) || 5, MAX_GENERATE);
  if (!Number.isInteger(unit) || unit < 1 || unit > 5) {
    return NextResponse.json({ error: 'Invalid unit (must be 1-5)' }, { status: 400 });
  }
  if (count < 1) {
    return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
  }

  try {
    const generated = await generateQuestions({ unit, count });
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
          questionType: 'fill_blank_mcq',
          prompt: q.prompt,
          correctAnswer: q.correctAnswer,
          distractors: q.distractors,
          generatedBy: user.id,
        }))
      )
      .returning();

    return NextResponse.json({ questions: inserted, requested: count, accepted: inserted.length });
  } catch (error) {
    logError(error, 'practice-questions.generate');
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
