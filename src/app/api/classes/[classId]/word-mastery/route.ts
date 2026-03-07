import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingGameResults, spellingWords, spellingLists, users, classEnrollments } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, sql, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/word-mastery - Get per-word mastery stats for a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const listId = searchParams.get('listId');

        // Build word filter
        let wordFilter;
        if (listId) {
            wordFilter = eq(spellingWords.spellingListId, listId);
        }

        // Get all game results for this class with word info
        const results = await db
            .select({
                wordId: spellingGameResults.spellingWordId,
                word: spellingWords.word,
                listId: spellingWords.spellingListId,
                listTitle: spellingLists.title,
                listWeek: spellingLists.weekNumber,
                studentId: spellingGameResults.studentId,
                studentFirstName: users.firstName,
                studentLastName: users.lastName,
                won: spellingGameResults.won,
                wrongGuesses: spellingGameResults.wrongGuesses,
                timeSeconds: spellingGameResults.timeSeconds,
                playedAt: spellingGameResults.createdAt,
            })
            .from(spellingGameResults)
            .innerJoin(spellingWords, eq(spellingGameResults.spellingWordId, spellingWords.id))
            .innerJoin(spellingLists, eq(spellingWords.spellingListId, spellingLists.id))
            .innerJoin(users, eq(spellingGameResults.studentId, users.id))
            .where(
                listId
                    ? and(eq(spellingGameResults.classId, classId), eq(spellingWords.spellingListId, listId))
                    : eq(spellingGameResults.classId, classId)
            )
            .orderBy(spellingWords.word, desc(spellingGameResults.createdAt));

        // Get enrolled students for participation tracking
        const enrolled = await db
            .select({
                studentId: classEnrollments.studentId,
                firstName: users.firstName,
                lastName: users.lastName,
            })
            .from(classEnrollments)
            .innerJoin(users, eq(classEnrollments.studentId, users.id))
            .where(eq(classEnrollments.classId, classId));

        // Get available spelling lists for this class (for the filter dropdown)
        const lists = await db
            .select({
                id: spellingLists.id,
                title: spellingLists.title,
                weekNumber: spellingLists.weekNumber,
            })
            .from(spellingLists)
            .where(eq(spellingLists.classId, classId))
            .orderBy(desc(spellingLists.createdAt));

        // Aggregate per-word stats
        const wordStatsMap = new Map<string, {
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
            students: Map<string, {
                studentId: string;
                firstName: string;
                lastName: string;
                attempts: number;
                wins: number;
                losses: number;
                avgWrongGuesses: number;
                totalWrongGuesses: number;
            }>;
        }>();

        for (const row of results) {
            if (!wordStatsMap.has(row.wordId)) {
                wordStatsMap.set(row.wordId, {
                    wordId: row.wordId,
                    word: row.word,
                    listTitle: row.listTitle,
                    listWeek: row.listWeek,
                    totalAttempts: 0,
                    wins: 0,
                    losses: 0,
                    totalWrongGuesses: 0,
                    totalTimeSeconds: 0,
                    timedAttempts: 0,
                    students: new Map(),
                });
            }

            const wordStats = wordStatsMap.get(row.wordId)!;
            wordStats.totalAttempts++;
            if (row.won) wordStats.wins++;
            else wordStats.losses++;
            wordStats.totalWrongGuesses += row.wrongGuesses;
            if (row.timeSeconds) {
                wordStats.totalTimeSeconds += row.timeSeconds;
                wordStats.timedAttempts++;
            }

            // Per-student stats
            if (!wordStats.students.has(row.studentId)) {
                wordStats.students.set(row.studentId, {
                    studentId: row.studentId,
                    firstName: row.studentFirstName,
                    lastName: row.studentLastName,
                    attempts: 0,
                    wins: 0,
                    losses: 0,
                    avgWrongGuesses: 0,
                    totalWrongGuesses: 0,
                });
            }

            const studentStats = wordStats.students.get(row.studentId)!;
            studentStats.attempts++;
            if (row.won) studentStats.wins++;
            else studentStats.losses++;
            studentStats.totalWrongGuesses += row.wrongGuesses;
        }

        // Convert to response format
        const wordMastery = Array.from(wordStatsMap.values()).map((ws) => {
            const studentBreakdown = Array.from(ws.students.values()).map((ss) => ({
                ...ss,
                avgWrongGuesses: ss.attempts > 0 ? Math.round((ss.totalWrongGuesses / ss.attempts) * 10) / 10 : 0,
                winRate: ss.attempts > 0 ? Math.round((ss.wins / ss.attempts) * 100) : 0,
            }));

            return {
                wordId: ws.wordId,
                word: ws.word,
                listTitle: ws.listTitle,
                listWeek: ws.listWeek,
                totalAttempts: ws.totalAttempts,
                wins: ws.wins,
                losses: ws.losses,
                winRate: ws.totalAttempts > 0 ? Math.round((ws.wins / ws.totalAttempts) * 100) : 0,
                avgWrongGuesses: ws.totalAttempts > 0 ? Math.round((ws.totalWrongGuesses / ws.totalAttempts) * 10) / 10 : 0,
                avgTimeSeconds: ws.timedAttempts > 0 ? Math.round(ws.totalTimeSeconds / ws.timedAttempts) : null,
                studentsAttempted: ws.students.size,
                students: studentBreakdown.sort((a, b) => a.winRate - b.winRate), // Weakest first
            };
        });

        // Sort by win rate (struggling words first)
        wordMastery.sort((a, b) => a.winRate - b.winRate);

        // Class-level summary
        const totalAttempts = wordMastery.reduce((sum, w) => sum + w.totalAttempts, 0);
        const totalWins = wordMastery.reduce((sum, w) => sum + w.wins, 0);

        return NextResponse.json({
            classId,
            totalStudents: enrolled.length,
            totalAttempts,
            overallWinRate: totalAttempts > 0 ? Math.round((totalWins / totalAttempts) * 100) : 0,
            spellingLists: lists,
            wordMastery,
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/word-mastery] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
