import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classes,
  classBooks,
  books,
  classSyllabusWeeks,
  classSyllabusAssignments,
  classWeeklyRecaps,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { type ParsedWeek } from '@/lib/syllabus/types';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// Builds the "pages covered" string the teacher will see pre-filled in the
// recap. Format: "Family and Friends 1: 12-15\nFamily and Friends 2: 4-6".
// One book per line. We produce this server-side rather than trusting the
// client so the recap reads consistently.
function formatPagesCovered(
  assignments: ParsedWeek['assignments'],
  bookTitleById: Map<string, string>,
): string | null {
  const lines = assignments
    .map((a) => {
      const title = bookTitleById.get(a.bookId);
      if (!title) return null;
      return `${title}: ${a.pages}`;
    })
    .filter((s): s is string => s !== null);
  return lines.length > 0 ? lines.join('\n') : null;
}

// POST /api/teacher/classes/[classId]/syllabus/import
// Body: { weeks: ParsedWeek[] }
//
// Replaces the class's entire syllabus + weekly-recap state. Per the user's
// design call: this is a once-per-semester action, so we wipe existing weeks
// and recaps for the class and rebuild from the sheet. Single transaction.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const classRow = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!classRow.length) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const body = (await request.json()) as { weeks?: ParsedWeek[] };
    if (!Array.isArray(body.weeks) || body.weeks.length === 0) {
      return NextResponse.json({ error: 'weeks[] required' }, { status: 400 });
    }

    // Validate that every bookId in the payload actually belongs to this class.
    // We accept any book in class_books; the importer never invents new books.
    const allowedBooks = await db
      .select({ id: books.id, title: books.title })
      .from(classBooks)
      .innerJoin(books, eq(classBooks.bookId, books.id))
      .where(eq(classBooks.classId, classId));
    const allowedBookIds = new Set(allowedBooks.map((b) => b.id));
    const bookTitleById = new Map(allowedBooks.map((b) => [b.id, b.title]));
    for (const w of body.weeks) {
      for (const a of w.assignments) {
        if (!allowedBookIds.has(a.bookId)) {
          return NextResponse.json(
            {
              error: `Book ${a.bookId} is not assigned to this class. Add it via the class's books before importing.`,
            },
            { status: 400 },
          );
        }
      }
    }

    let weeksCreated = 0;
    let recapsCreated = 0;

    await db.transaction(async (tx) => {
      // Wipe syllabus side. class_syllabus_assignments cascades on weekId.
      await tx.delete(classSyllabusWeeks).where(eq(classSyllabusWeeks.classId, classId));
      // Wipe recap side too — destructive by design (semester reset).
      await tx.delete(classWeeklyRecaps).where(eq(classWeeklyRecaps.classId, classId));

      for (const w of body.weeks) {
        const startDate = new Date(w.startDate);
        const endDate = new Date(w.endDate);

        const [insertedWeek] = await tx
          .insert(classSyllabusWeeks)
          .values({
            classId,
            weekNumber: w.weekNumber,
            title: w.title,
            startDate,
            endDate,
          })
          .returning({ id: classSyllabusWeeks.id });
        weeksCreated += 1;

        if (w.assignments.length > 0) {
          await tx.insert(classSyllabusAssignments).values(
            w.assignments.map((a) => ({
              weekId: insertedWeek.id,
              bookId: a.bookId,
              pages: a.pages,
            })),
          );
        }

        // Pre-create the draft recap for this week with everything the sheet
        // told us. Homework is only set if the teacher filled it in the sheet
        // — otherwise it's null and the teacher fills it weekly.
        await tx.insert(classWeeklyRecaps).values({
          classId,
          weekNumber: w.weekNumber,
          startDate,
          endDate,
          pagesCovered: formatPagesCovered(w.assignments, bookTitleById),
          vocabulary: w.vocabulary,
          spellingTestInfo: w.spellingTestInfo,
          grammarTestInfo: w.grammarTestInfo,
          homework: w.homework,
          behaviorFormat: 'checklist',
          status: 'draft',
          createdBy: user.id,
        });
        recapsCreated += 1;
      }
    });

    return NextResponse.json({
      ok: true,
      weeksCreated,
      recapsCreated,
    });
  } catch (error) {
    logError(error, 'api/teacher/syllabus/import');
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
