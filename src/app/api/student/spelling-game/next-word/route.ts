import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { spellingGameResults } from '@/lib/db/schema';

export const runtime = 'nodejs';

// 5-box Leitner intervals (days). Box = consecutive wins from the latest result
// backwards (capped at 4); a single loss resets to 0. Word is "due" when
// (now - last_attempt) >= INTERVAL_DAYS[box].
const INTERVAL_DAYS = [0, 1, 3, 7, 16];
const DAY_MS = 24 * 60 * 60 * 1000;

interface RequestBody {
    wordIds: string[];
    excludeWordIds?: string[];
}

// POST /api/student/spelling-game/next-word
// Body: { wordIds: string[], excludeWordIds?: string[] }
//   wordIds       — the candidate pool (the loaded spelling list's word IDs)
//   excludeWordIds — words already played in this session (avoid same-round repeat)
// Returns: { wordId: string, source: 'overdue' | 'unseen' | 'wildcard' }
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: RequestBody;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const wordIds = Array.isArray(body.wordIds)
            ? body.wordIds.filter((id): id is string => typeof id === 'string')
            : [];
        const excludeIds = new Set(
            Array.isArray(body.excludeWordIds)
                ? body.excludeWordIds.filter((id): id is string => typeof id === 'string')
                : []
        );

        if (wordIds.length === 0) {
            return NextResponse.json({ error: 'wordIds is required' }, { status: 400 });
        }

        const candidates = wordIds.filter((id) => !excludeIds.has(id));
        if (candidates.length === 0) {
            // Session played the whole pool — fall back to the full set.
            return pickRandom(wordIds, 'wildcard');
        }

        // Pull this student's recent results for the candidate pool.
        const recentResults = await db
            .select({
                spellingWordId: spellingGameResults.spellingWordId,
                won: spellingGameResults.won,
                createdAt: spellingGameResults.createdAt,
            })
            .from(spellingGameResults)
            .where(
                and(
                    eq(spellingGameResults.studentId, user.id),
                    inArray(spellingGameResults.spellingWordId, candidates)
                )
            )
            .orderBy(desc(spellingGameResults.createdAt));

        // Group by word, newest-first within each
        const resultsByWord = new Map<string, typeof recentResults>();
        for (const r of recentResults) {
            const bucket = resultsByWord.get(r.spellingWordId);
            if (bucket) bucket.push(r);
            else resultsByWord.set(r.spellingWordId, [r]);
        }

        const now = Date.now();

        type Categorized = { wordId: string; box: number; hasHistory: boolean; dueAt: number };
        const categorized: Categorized[] = candidates.map((wordId) => {
            const history = resultsByWord.get(wordId) ?? [];
            if (history.length === 0) {
                return { wordId, box: 0, hasHistory: false, dueAt: 0 };
            }
            let box = 0;
            for (const r of history) {
                if (r.won && box < INTERVAL_DAYS.length - 1) box += 1;
                else break;
            }
            const last = history[0].createdAt ? new Date(history[0].createdAt).getTime() : now;
            const dueAt = last + INTERVAL_DAYS[box] * DAY_MS;
            return { wordId, box, hasHistory: true, dueAt };
        });

        const overdue = categorized
            .filter((c) => c.hasHistory && c.dueAt <= now)
            .sort((a, b) => a.box - b.box || a.dueAt - b.dueAt);
        const unseen = categorized.filter((c) => !c.hasHistory);
        const wildcard = categorized.filter((c) => c.hasHistory && c.dueAt > now);

        // 60% overdue, 25% unseen, 15% wildcard. If the chosen pool is empty,
        // cascade to the next available pool.
        const roll = Math.random();
        const order: Array<{ pool: Categorized[]; source: string }> =
            roll < 0.6
                ? [
                    { pool: overdue, source: 'overdue' },
                    { pool: unseen, source: 'unseen' },
                    { pool: wildcard, source: 'wildcard' },
                ]
                : roll < 0.85
                    ? [
                        { pool: unseen, source: 'unseen' },
                        { pool: overdue, source: 'overdue' },
                        { pool: wildcard, source: 'wildcard' },
                    ]
                    : [
                        { pool: wildcard, source: 'wildcard' },
                        { pool: unseen, source: 'unseen' },
                        { pool: overdue, source: 'overdue' },
                    ];

        for (const { pool, source } of order) {
            if (pool.length === 0) continue;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            return NextResponse.json({ wordId: pick.wordId, source });
        }

        // All pools empty (shouldn't happen since candidates.length > 0). Random fallback.
        return pickRandom(candidates, 'fallback');
    } catch (error) {
        console.error('[POST /api/student/spelling-game/next-word] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function pickRandom(ids: string[], source: string) {
    const wordId = ids[Math.floor(Math.random() * ids.length)];
    return NextResponse.json({ wordId, source });
}
