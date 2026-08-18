import { NextRequest, NextResponse } from 'next/server';
import { textClient, type TextMessage, type TextSegment } from '@/lib/llm';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canUseSunnyPreview } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import { classEnrollments, classes, spellingLists, spellingWords } from '@/lib/db/schema';
import { buildSystemPrompt } from '@/lib/curriculum/context';
import { isValidUnit } from '@/lib/practice/units';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_TURNS = 6;

async function resolveStudentContext(studentId: string): Promise<{
  currentUnit: number;
  spellingWords: string[];
}> {
  const enrollment = await db
    .select({ classId: classEnrollments.classId, currentUnit: classes.currentUnit })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(and(eq(classEnrollments.studentId, studentId), eq(classes.active, true)))
    .orderBy(desc(classes.updatedAt))
    .limit(1);

  if (enrollment.length === 0) {
    return { currentUnit: 1, spellingWords: [] };
  }

  const { classId, currentUnit } = enrollment[0];

  const list = await db
    .select({ id: spellingLists.id })
    .from(spellingLists)
    .where(and(eq(spellingLists.classId, classId), eq(spellingLists.active, true)))
    .orderBy(desc(spellingLists.weekNumber), desc(spellingLists.createdAt))
    .limit(1);

  if (list.length === 0) {
    return { currentUnit, spellingWords: [] };
  }

  const words = await db
    .select({ word: spellingWords.word })
    .from(spellingWords)
    .where(eq(spellingWords.spellingListId, list[0].id))
    .orderBy(spellingWords.orderIndex);

  return { currentUnit, spellingWords: words.map((w) => w.word) };
}

/** Rate limiting looks different per provider (Anthropic throws a typed
 *  error, Hetzner surfaces an HTTP 429), so match on the status rather than
 *  on any one vendor's error class. */
function isRateLimited(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 429
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'student' && user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await textClient.isConfigured())) {
    return NextResponse.json(
      { error: 'Homework helper is not configured on the server.' },
      { status: 503 }
    );
  }

  let body: { message?: unknown; conversationHistory?: unknown; unit?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!rawMessage) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
  }

  const history: HistoryTurn[] = Array.isArray(body.conversationHistory)
    ? (body.conversationHistory as unknown[])
        .filter(
          (t): t is HistoryTurn =>
            typeof t === 'object' &&
            t !== null &&
            ((t as { role?: unknown }).role === 'user' ||
              (t as { role?: unknown }).role === 'assistant') &&
            typeof (t as { content?: unknown }).content === 'string'
        )
        .slice(-MAX_HISTORY_TURNS)
    : [];

  // Teachers/admins pass unit explicitly (preview mode); students have it derived from session.
  let currentUnit: number;
  let spellingWords: string[];
  if (user.role === 'student') {
    ({ currentUnit, spellingWords } = await resolveStudentContext(user.id));
  } else {
    // Teacher/admin Sunny preview — gated capability (admins always pass).
    if (!(await canUseSunnyPreview(user))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const teacherUnit = Number(body.unit);
    currentUnit = isValidUnit(teacherUnit) ? teacherUnit : 1;
    spellingWords = [];
  }

  const systemBlocks: TextSegment[] = [
    { text: buildSystemPrompt(currentUnit), cacheable: true },
  ];

  if (spellingWords.length > 0) {
    systemBlocks.push({
      text: `THIS WEEK'S SPELLING WORDS: ${spellingWords.join(', ')}`,
    });
  }

  const messages: TextMessage[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: rawMessage },
  ];

  try {
    const response = await textClient.complete({
      system: systemBlocks,
      messages,
      // 280 rather than the original 200: Sonnet 5's tokenizer produces ~30%
      // more tokens for the same text, so the old ceiling clipped replies
      // that used to fit. Thinking is disabled inside the Claude client, so
      // reasoning can't eat this budget.
      maxTokens: 280,
    });

    const reply = response.text;

    return NextResponse.json({
      reply: reply || "Let's try that again! Can you ask me another way?",
    });
  } catch (error) {
    if (isRateLimited(error)) {
      return NextResponse.json(
        { error: "I'm a little busy right now — try again in a moment!" },
        { status: 429 }
      );
    }
    logError(error, 'homework-helper');
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
