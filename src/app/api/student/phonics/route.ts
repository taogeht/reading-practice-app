import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { logError } from '@/lib/logger';
import { DEFAULT_BOOK_SLUG } from '@/lib/practice/books';

export const runtime = 'nodejs';

interface PhonicsWord {
  word: string;
  emoji?: string;
  image?: string;
}
interface PhonicsFamily {
  family: string;
  words: PhonicsWord[];
}
interface PhonicsBlock {
  sound: string;
  description?: string;
  word_families: PhonicsFamily[];
  chant?: string[];
}

// GET /api/student/phonics?unit=13
// Returns the phonics block for a unit. With no `unit` param, defaults to the
// student's enrolled class's currentUnit. Returns null if the unit's curriculum
// JSON has no phonics section yet (older units).
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const unitParam = url.searchParams.get('unit');
    let unit = unitParam ? parseInt(unitParam, 10) : NaN;

    if (!Number.isFinite(unit)) {
      // Pull the student's class current unit. Pick the first class — students
      // are typically only enrolled in one Family-and-Friends class at a time.
      const enrollment = await db
        .select({ currentUnit: classes.currentUnit })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(eq(classEnrollments.studentId, user.id))
        .limit(1);
      unit = enrollment[0]?.currentUnit ?? 1;
    }

    // Always FAF1 for now — when other books get curriculum, route by class's
    // currentBookSlug (not yet wired).
    const bookSlug = DEFAULT_BOOK_SLUG;
    const jsonPath = path.join(
      process.cwd(),
      'src',
      'lib',
      'curriculum',
      bookSlug,
      `unit-${unit}.json`,
    );

    let curriculum: { phonics?: PhonicsBlock };
    try {
      const contents = await readFile(jsonPath, 'utf-8');
      curriculum = JSON.parse(contents);
    } catch {
      return NextResponse.json({ unit, phonics: null });
    }

    return NextResponse.json({ unit, phonics: curriculum.phonics ?? null });
  } catch (error) {
    logError(error, 'api/student/phonics');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
