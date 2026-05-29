import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { userCanManageClass, userIsClassPrimary } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classes, classPracticeUnits } from '@/lib/db/schema';
import { DEFAULT_BOOK_SLUG, isValidBookSlug, isUnitAvailableForBook } from '@/lib/practice/books';
import { getBookUnits } from '@/lib/practice/book-units';

export const runtime = 'nodejs';

// Resolves the ?book= query param to a valid BookSlug, defaulting to FAF1.
function resolveBook(request: NextRequest): string {
  const raw = new URL(request.url).searchParams.get('book');
  return raw && isValidBookSlug(raw) ? raw : DEFAULT_BOOK_SLUG;
}

// GET /api/teacher/classes/[classId]/practice-units?book=<slug>
// → { bookSlug, units: number[], availableUnits: BookUnitInfo[] }
// `units` are the enabled units for THIS book only; availableUnits is that
// book's catalog. The client iterates BOOKS itself to render the book selector.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { classId } = await params;
    const bookSlug = resolveBook(request);

    // Read is open to any class member (primary or co-teacher).
    if (!(await userCanManageClass(user.id, user.role, classId))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const classRow = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
        columns: { id: true },
    });
    if (!classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const rows = await db
        .select({ unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(
            and(
                eq(classPracticeUnits.classId, classId),
                eq(classPracticeUnits.bookSlug, bookSlug)
            )
        );

    return NextResponse.json({
        bookSlug,
        units: rows.map((r) => r.unit).sort((a, b) => a - b),
        availableUnits: await getBookUnits(bookSlug as Parameters<typeof getBookUnits>[0]),
    });
}

// PUT /api/teacher/classes/[classId]/practice-units
// Body: { bookSlug?: string, units: number[] } — replaces the enabled set for
// the given book only. Other books' enabled units are left untouched.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { classId } = await params;

    // Settings change → primary teacher (or admin) only.
    const allowed =
        user.role === 'admin' || (await userIsClassPrimary(user.id, classId));
    if (!allowed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const classRow = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
        columns: { id: true },
    });
    if (!classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    let body: { units?: unknown; bookSlug?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const bookSlug =
        typeof body.bookSlug === 'string' && isValidBookSlug(body.bookSlug)
            ? body.bookSlug
            : DEFAULT_BOOK_SLUG;

    if (!Array.isArray(body.units)) {
        return NextResponse.json({ error: 'units must be an array of numbers' }, { status: 400 });
    }

    const requested = body.units
        .map((u) => Number(u))
        .filter((u) => Number.isInteger(u));
    const invalid = requested.find((u) => !isUnitAvailableForBook(bookSlug, u));
    if (invalid !== undefined) {
        return NextResponse.json(
            { error: `Unit ${invalid} is not an available practice unit for ${bookSlug}` },
            { status: 400 }
        );
    }
    const desired = Array.from(new Set(requested));

    const existingRows = await db
        .select({ unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(
            and(
                eq(classPracticeUnits.classId, classId),
                eq(classPracticeUnits.bookSlug, bookSlug)
            )
        );
    const existing = new Set(existingRows.map((r) => r.unit));
    const desiredSet = new Set(desired);

    const toAdd = desired.filter((u) => !existing.has(u));
    const toRemove = Array.from(existing).filter((u) => !desiredSet.has(u));

    if (toAdd.length > 0) {
        await db
            .insert(classPracticeUnits)
            .values(toAdd.map((unit) => ({ classId, bookSlug, unit })))
            .onConflictDoNothing();
    }

    if (toRemove.length > 0) {
        await db
            .delete(classPracticeUnits)
            .where(
                and(
                    eq(classPracticeUnits.classId, classId),
                    eq(classPracticeUnits.bookSlug, bookSlug),
                    inArray(classPracticeUnits.unit, toRemove)
                )
            );
    }

    return NextResponse.json({ bookSlug, units: desired.sort((a, b) => a - b) });
}
