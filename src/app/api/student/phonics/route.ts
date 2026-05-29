import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { logError } from '@/lib/logger';
import { DEFAULT_BOOK_SLUG, isValidBookSlug } from '@/lib/practice/books';
import { ensurePhonicsAudioBatch } from '@/lib/tts/phonics-audio';

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

interface AvailableUnit {
  unit: number;
  sound: string;
  topic: string;
}

const CURRICULUM_DIR = path.join(process.cwd(), 'src', 'lib', 'curriculum');

// Scans the book's curriculum directory and returns every unit with a phonics
// block — the picker pool the student sees in the deck UI.
async function listUnitsWithPhonics(bookSlug: string): Promise<AvailableUnit[]> {
  const dir = path.join(CURRICULUM_DIR, bookSlug);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: AvailableUnit[] = [];
  for (const name of entries) {
    const m = name.match(/^unit-(\d+)\.json$/);
    if (!m) continue;
    const unitNum = parseInt(m[1], 10);
    try {
      const contents = await readFile(path.join(dir, name), 'utf-8');
      const json = JSON.parse(contents) as {
        phonics?: PhonicsBlock;
        topic?: string;
      };
      if (json.phonics) {
        out.push({ unit: unitNum, sound: json.phonics.sound, topic: json.topic ?? '' });
      }
    } catch {
      // skip malformed
    }
  }
  out.sort((a, b) => a.unit - b.unit);
  return out;
}

// GET /api/student/phonics?unit=13
// Returns the phonics block for a specific unit plus the list of units that
// have phonics content available. With no ?unit, defaults to the student's
// enrolled class's currentUnit if that unit has phonics; otherwise falls back
// to the first available unit so the student sees something instead of an
// empty state.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const unitParam = url.searchParams.get('unit');
    const requestedUnit = unitParam ? parseInt(unitParam, 10) : NaN;

    // Book comes from ?book=; defaults to FAF1. The phonics deck is currently
    // single-book in the UI, but the route honors the param so a book-aware
    // deck can pass it without a route change.
    const bookSlugParam = url.searchParams.get('book');
    const bookSlug =
      bookSlugParam && isValidBookSlug(bookSlugParam) ? bookSlugParam : DEFAULT_BOOK_SLUG;

    const availableUnits = await listUnitsWithPhonics(bookSlug);

    let unit: number;
    if (Number.isFinite(requestedUnit)) {
      unit = requestedUnit;
    } else {
      const enrollment = await db
        .select({ currentUnit: classes.currentUnit })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(eq(classEnrollments.studentId, user.id))
        .limit(1);
      const classUnit = enrollment[0]?.currentUnit ?? 1;
      // If the class's current unit has phonics, use it. Otherwise fall back
      // to the first available unit so the student sees content immediately.
      const hasContent = availableUnits.some((u) => u.unit === classUnit);
      unit = hasContent
        ? classUnit
        : availableUnits[0]?.unit ?? classUnit;
    }

    const jsonPath = path.join(
      CURRICULUM_DIR,
      bookSlug,
      `unit-${unit}.json`,
    );

    let curriculum: { phonics?: PhonicsBlock };
    try {
      const contents = await readFile(jsonPath, 'utf-8');
      curriculum = JSON.parse(contents);
    } catch {
      return NextResponse.json({ unit, phonics: null, availableUnits, audioUrls: {} });
    }

    // Pre-generate (or fetch from R2 cache) the Google TTS audio for every
    // phonics word — and every chant line — in this unit. Cached entries
    // return in milliseconds; uncached ones add ~200–600ms each
    // (parallelized). Failures silently drop from the map and the client
    // falls back to Web Speech.
    const wordsInUnit = (curriculum.phonics?.word_families ?? []).flatMap((f) =>
      f.words.map((w) => w.word),
    );
    const chantLines = curriculum.phonics?.chant ?? [];
    const audioUrls = await ensurePhonicsAudioBatch([...wordsInUnit, ...chantLines]);

    return NextResponse.json({
      unit,
      phonics: curriculum.phonics ?? null,
      availableUnits,
      audioUrls,
    });
  } catch (error) {
    logError(error, 'api/student/phonics');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
