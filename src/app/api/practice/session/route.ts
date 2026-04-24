import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceQuestions } from '@/lib/db/schema';

export const runtime = 'nodejs';

const QUESTIONS_PER_SESSION = 5;

// Fisher-Yates for shuffling the 4 choices so the correct answer isn't always first
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const unit = Number(url.searchParams.get('unit'));
  if (!Number.isInteger(unit) || unit < 1 || unit > 5) {
    return NextResponse.json({ error: 'Invalid unit' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: practiceQuestions.id,
      prompt: practiceQuestions.prompt,
      correctAnswer: practiceQuestions.correctAnswer,
      distractors: practiceQuestions.distractors,
    })
    .from(practiceQuestions)
    .where(and(eq(practiceQuestions.unit, unit), eq(practiceQuestions.active, true)))
    .orderBy(sql`random()`)
    .limit(QUESTIONS_PER_SESSION);

  if (rows.length === 0) {
    return NextResponse.json(
      {
        unit,
        questions: [],
        message: 'No practice questions for this unit yet. Ask your teacher!',
      },
      { status: 200 }
    );
  }

  // Bump times_served for everything we served, in a single query
  const ids = rows.map((r) => r.id);
  await db
    .update(practiceQuestions)
    .set({ timesServed: sql`${practiceQuestions.timesServed} + 1` })
    .where(sql`${practiceQuestions.id} = ANY(${ids})`);

  // Do NOT return correctAnswer to the client — grading happens server-side.
  const questions = rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    choices: shuffle([r.correctAnswer, ...r.distractors]),
  }));

  return NextResponse.json({ unit, questions });
}
