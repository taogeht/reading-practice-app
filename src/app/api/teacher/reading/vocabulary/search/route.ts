// GET /api/teacher/reading/vocabulary/search?q=…&level=…&picturableOnly=…
//
// Typeahead backing the "I'll pick the words" vocab picker on
// /teacher/reading/generate. Filters to curriculum words at the
// student's AF&F level (function words and scaffolds excluded — those
// are always available cumulatively and aren't legal target words).
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ilike, type SQL } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { vocabulary, type afFLevelEnum } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { getReadingLevel } from '@/lib/reading/levels';

export const runtime = 'nodejs';

const MAX_RESULTS = 20;

type AfFLevel = (typeof afFLevelEnum.enumValues)[number];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    const levelRaw = url.searchParams.get('level');
    const level = parseInt(levelRaw ?? '', 10);
    const picturableOnly = url.searchParams.get('picturableOnly') === 'true';

    if (!Number.isInteger(level) || level < 1 || level > 5) {
      return NextResponse.json(
        { error: 'level must be an integer 1-5' },
        { status: 400 },
      );
    }
    if (q.length < 1) {
      // Empty query → return empty list rather than the entire vocabulary.
      // The picker only fetches once the user types a character.
      return NextResponse.json({ items: [] });
    }

    const baseLevel = getReadingLevel(level);
    const afFLevel = baseLevel.targetAfFLevel as AfFLevel;

    const conditions: SQL[] = [
      eq(vocabulary.afFLevel, afFLevel),
      // Function + scaffold rows are always-available, not legal as
      // targets. Mirrors fetchTargetVocab's rejection.
      eq(vocabulary.isFunctionWord, false),
      eq(vocabulary.isScaffold, false),
      ilike(vocabulary.word, `${q}%`),
    ];
    if (picturableOnly) {
      conditions.push(eq(vocabulary.isPicturable, true));
    }

    const rows = await db
      .select({
        id: vocabulary.id,
        word: vocabulary.word,
        partOfSpeech: vocabulary.partOfSpeech,
        afFUnit: vocabulary.afFUnit,
        isPicturable: vocabulary.isPicturable,
      })
      .from(vocabulary)
      .where(and(...conditions))
      .orderBy(vocabulary.word)
      .limit(MAX_RESULTS);

    return NextResponse.json({ items: rows });
  } catch (err) {
    logError(err, 'api/teacher/reading/vocabulary/search');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
