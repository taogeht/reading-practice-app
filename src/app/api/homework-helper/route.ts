import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classEnrollments, classes, spellingLists, spellingWords } from '@/lib/db/schema';
import { buildSystemPrompt } from '@/lib/curriculum/context';
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

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Homework helper is not configured on the server.' },
      { status: 503 }
    );
  }

  let body: { message?: unknown; conversationHistory?: unknown };
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

  const { currentUnit, spellingWords } = await resolveStudentContext(user.id);

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: buildSystemPrompt(currentUnit),
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (spellingWords.length > 0) {
    systemBlocks.push({
      type: 'text',
      text: `THIS WEEK'S SPELLING WORDS: ${spellingWords.join(', ')}`,
    });
  }

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: rawMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: systemBlocks,
      messages,
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return NextResponse.json({
      reply: reply || "Let's try that again! Can you ask me another way?",
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
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
