import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  spellingGameResults,
  spellingWords,
  spellingLists,
  classEnrollments,
  classes,
} from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');

    if (user.role === 'teacher') {
      const enrollment = await db
        .select({ id: classes.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(
          and(eq(classEnrollments.studentId, studentId), eq(classes.teacherId, user.id))
        )
        .limit(1);
      if (enrollment.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
    }

    const results = await db
      .select({
        wordId: spellingGameResults.spellingWordId,
        word: spellingWords.word,
        listId: spellingWords.spellingListId,
        listTitle: spellingLists.title,
        listWeek: spellingLists.weekNumber,
        won: spellingGameResults.won,
        wrongGuesses: spellingGameResults.wrongGuesses,
        timeSeconds: spellingGameResults.timeSeconds,
      })
      .from(spellingGameResults)
      .innerJoin(spellingWords, eq(spellingGameResults.spellingWordId, spellingWords.id))
      .innerJoin(spellingLists, eq(spellingWords.spellingListId, spellingLists.id))
      .where(
        listId
          ? and(
              eq(spellingGameResults.studentId, studentId),
              eq(spellingWords.spellingListId, listId)
            )
          : eq(spellingGameResults.studentId, studentId)
      )
      .orderBy(spellingWords.word, desc(spellingGameResults.createdAt));

    const listMap = new Map<string, { id: string; title: string; weekNumber: number | null }>();
    for (const r of results) {
      if (!listMap.has(r.listId)) {
        listMap.set(r.listId, { id: r.listId, title: r.listTitle, weekNumber: r.listWeek });
      }
    }
    const spellingListsResp = Array.from(listMap.values()).sort((a, b) => {
      if (a.weekNumber == null && b.weekNumber == null) return a.title.localeCompare(b.title);
      if (a.weekNumber == null) return 1;
      if (b.weekNumber == null) return -1;
      return a.weekNumber - b.weekNumber;
    });

    type WordAgg = {
      wordId: string;
      word: string;
      listTitle: string;
      listWeek: number | null;
      totalAttempts: number;
      wins: number;
      losses: number;
      totalWrongGuesses: number;
      totalTimeSeconds: number;
      timedAttempts: number;
    };
    const wordMap = new Map<string, WordAgg>();
    for (const r of results) {
      if (!wordMap.has(r.wordId)) {
        wordMap.set(r.wordId, {
          wordId: r.wordId,
          word: r.word,
          listTitle: r.listTitle,
          listWeek: r.listWeek,
          totalAttempts: 0,
          wins: 0,
          losses: 0,
          totalWrongGuesses: 0,
          totalTimeSeconds: 0,
          timedAttempts: 0,
        });
      }
      const w = wordMap.get(r.wordId)!;
      w.totalAttempts++;
      if (r.won) w.wins++;
      else w.losses++;
      w.totalWrongGuesses += r.wrongGuesses;
      if (r.timeSeconds) {
        w.totalTimeSeconds += r.timeSeconds;
        w.timedAttempts++;
      }
    }

    const wordMastery = Array.from(wordMap.values()).map((w) => ({
      wordId: w.wordId,
      word: w.word,
      listTitle: w.listTitle,
      listWeek: w.listWeek,
      totalAttempts: w.totalAttempts,
      wins: w.wins,
      losses: w.losses,
      winRate: w.totalAttempts > 0 ? Math.round((w.wins / w.totalAttempts) * 100) : 0,
      avgWrongGuesses:
        w.totalAttempts > 0 ? Math.round((w.totalWrongGuesses / w.totalAttempts) * 10) / 10 : 0,
      avgTimeSeconds: w.timedAttempts > 0 ? Math.round(w.totalTimeSeconds / w.timedAttempts) : null,
    }));

    wordMastery.sort((a, b) => a.winRate - b.winRate);

    const totalAttempts = wordMastery.reduce((sum, w) => sum + w.totalAttempts, 0);
    const totalWins = wordMastery.reduce((sum, w) => sum + w.wins, 0);

    return NextResponse.json({
      studentId,
      totalAttempts,
      overallWinRate: totalAttempts > 0 ? Math.round((totalWins / totalAttempts) * 100) : 0,
      spellingLists: spellingListsResp,
      wordMastery,
    });
  } catch (error) {
    console.error('[GET /api/teacher/students/[studentId]/word-mastery] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
