import { NextRequest, NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classEnrollments, classPracticeUnits } from '@/lib/db/schema';
import { BOOKS, isValidBookSlug } from '@/lib/practice/books';
import { getBookUnits } from '@/lib/practice/book-units';

export const runtime = 'nodejs';

// GET /api/student/practice/available-units
// Returns the practice picker entries for this student, grouped by book and
// restricted to (book, unit) pairs enabled on at least one of their enrolled
// classes.
// → { books: [{ slug, title, units: [{ unit, topic, emoji }] }] }
export async function GET(_request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enrollments = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .where(eq(classEnrollments.studentId, user.id));

    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) {
        return NextResponse.json({ books: [] });
    }

    const enabled = await db
        .select({ bookSlug: classPracticeUnits.bookSlug, unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(inArray(classPracticeUnits.classId, classIds));

    // Group enabled units by book slug.
    const enabledByBook = new Map<string, Set<number>>();
    for (const row of enabled) {
        if (!isValidBookSlug(row.bookSlug)) continue;
        const set = enabledByBook.get(row.bookSlug) ?? new Set<number>();
        set.add(row.unit);
        enabledByBook.set(row.bookSlug, set);
    }

    // Build book-grouped output in canonical BOOKS order, attaching each unit's
    // topic/emoji from the curriculum JSON. Skip books with nothing enabled.
    const books = [];
    for (const book of BOOKS) {
        const enabledUnits = enabledByBook.get(book.slug);
        if (!enabledUnits || enabledUnits.size === 0) continue;
        const catalog = await getBookUnits(book.slug);
        const units = catalog.filter((u) => enabledUnits.has(u.unit));
        if (units.length === 0) continue;
        books.push({ slug: book.slug, title: book.title, units });
    }

    return NextResponse.json({ books });
}
