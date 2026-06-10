import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';
import { generateTest } from '@/lib/practice/generate-test';
import { generateTestImages } from '@/lib/practice/test-images';
import {
  DEFAULT_COMPOSITION,
  isTestExerciseType,
  type TestComposition,
} from '@/lib/practice/test-types';
import {
  DEFAULT_BOOK_SLUG,
  getBook,
  isUnitAvailableForBook,
  isValidBookSlug,
} from '@/lib/practice/books';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
// The synchronous part (LLM generation of all sections) runs before the
// response; image generation is fire-and-forget after. Give the handler room.
export const maxDuration = 60;

const MAX_UNITS = 8;
const MAX_ITEMS_PER_SECTION = 20;
const MAX_TOTAL_ITEMS = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canGeneratePracticeQuestions(user))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Lightweight projection — the library list doesn't need the full document.
  const rows = await db
    .select({
      id: generatedTests.id,
      title: generatedTests.title,
      bookSlug: generatedTests.bookSlug,
      units: generatedTests.units,
      active: generatedTests.active,
      createdAt: generatedTests.createdAt,
    })
    .from(generatedTests)
    .where(and(eq(generatedTests.generatedBy, user.id), eq(generatedTests.active, true)))
    .orderBy(desc(generatedTests.createdAt));

  return NextResponse.json({ tests: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canGeneratePracticeQuestions(user))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  let body: {
    bookSlug?: unknown;
    units?: unknown;
    composition?: unknown;
    title?: unknown;
    cloneFrom?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ----- Clone path: copy an existing test's document verbatim -----
  if (typeof body.cloneFrom === 'string' && body.cloneFrom) {
    const src = await db
      .select()
      .from(generatedTests)
      .where(and(eq(generatedTests.id, body.cloneFrom), eq(generatedTests.generatedBy, user.id)))
      .limit(1);
    if (src.length === 0) {
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    }
    const s = src[0];
    const [inserted] = await db
      .insert(generatedTests)
      .values({
        generatedBy: user.id,
        schoolId: s.schoolId,
        bookSlug: s.bookSlug,
        units: s.units,
        title: `${s.title} (copy)`,
        document: s.document,
      })
      .returning();
    return NextResponse.json({ test: inserted });
  }

  // ----- Generate path -----
  const rawBookSlug = typeof body.bookSlug === 'string' ? body.bookSlug : DEFAULT_BOOK_SLUG;
  if (!isValidBookSlug(rawBookSlug)) {
    return NextResponse.json({ error: 'Invalid bookSlug' }, { status: 400 });
  }
  const bookSlug = rawBookSlug;
  const book = getBook(bookSlug);

  if (!Array.isArray(body.units) || body.units.length === 0) {
    return NextResponse.json({ error: 'Pick at least one unit.' }, { status: 400 });
  }
  const units = [...new Set(body.units.map((u) => Number(u)).filter((u) => Number.isInteger(u)))];
  if (units.length === 0) {
    return NextResponse.json({ error: 'Pick at least one unit.' }, { status: 400 });
  }
  if (units.length > MAX_UNITS) {
    return NextResponse.json({ error: `Pick at most ${MAX_UNITS} units.` }, { status: 400 });
  }
  const badUnit = units.find((u) => !isUnitAvailableForBook(bookSlug, u));
  if (badUnit !== undefined) {
    return NextResponse.json(
      { error: `No curriculum for ${bookSlug} unit ${badUnit}.` },
      { status: 400 },
    );
  }

  // Composition: default if omitted; otherwise validate + clamp each entry.
  let composition: TestComposition = DEFAULT_COMPOSITION;
  if (body.composition !== undefined) {
    if (!Array.isArray(body.composition)) {
      return NextResponse.json({ error: 'composition must be an array' }, { status: 400 });
    }
    composition = body.composition
      .map((c) => {
        const obj = c as { type?: unknown; count?: unknown };
        return { type: obj.type, count: Math.min(Number(obj.count) || 0, MAX_ITEMS_PER_SECTION) };
      })
      .filter((c): c is TestComposition[number] => isTestExerciseType(c.type) && c.count > 0);
  }
  if (composition.length === 0) {
    return NextResponse.json(
      { error: 'Choose at least one exercise type with a count above zero.' },
      { status: 400 },
    );
  }
  const totalItems = composition.reduce((sum, c) => sum + c.count, 0);
  if (totalItems > MAX_TOTAL_ITEMS) {
    return NextResponse.json(
      { error: `That's ${totalItems} questions — keep a test under ${MAX_TOTAL_ITEMS}.` },
      { status: 400 },
    );
  }

  const sortedUnits = [...units].sort((a, b) => a - b);
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : `${book?.shortLabel ?? 'Test'} · Unit${sortedUnits.length > 1 ? 's' : ''} ${sortedUnits.join(', ')}`;

  try {
    const { document, sectionStats } = await generateTest({
      bookSlug,
      units: sortedUnits,
      composition,
    });

    const [inserted] = await db
      .insert(generatedTests)
      .values({
        generatedBy: user.id,
        bookSlug,
        units: sortedUnits,
        title,
        document,
      })
      .returning();

    // Fire-and-forget image generation (same pattern as practice-questions):
    // the row is returned immediately; the print page polls until images land.
    void generateTestImages(inserted.id, document).catch((err) =>
      logError(err, 'tests.generateImages'),
    );

    const imagesPending = document.sections
      .flatMap((s) => s.items)
      .filter((it) => it.imagePrompt).length;

    return NextResponse.json({ test: inserted, sectionStats, imagesPending });
  } catch (error) {
    logError(error, 'tests.generate');
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
