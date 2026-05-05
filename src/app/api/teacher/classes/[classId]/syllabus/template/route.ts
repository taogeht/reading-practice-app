import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classBooks, books } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { buildSyllabusTemplate } from '@/lib/syllabus/build-template';

export const runtime = 'nodejs';

// GET /api/teacher/classes/[classId]/syllabus/template
// Streams an .xlsx file the teacher can fill in. Headers include one column
// per book the class is assigned. Two example rows are pre-filled to make the
// expected format obvious.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { classId } = await params;

    const classRows = await db
      .select({ id: classes.id, name: classes.name, teacherId: classes.teacherId })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!classRows.length) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (user.role !== 'admin' && classRows[0].teacherId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const classBookRows = await db
      .select({ id: books.id, title: books.title })
      .from(classBooks)
      .innerJoin(books, eq(classBooks.bookId, books.id))
      .where(and(eq(classBooks.classId, classId), eq(books.active, true)));

    const buf = buildSyllabusTemplate({
      className: classRows[0].name,
      books: classBookRows,
    });

    const filename = `${classRows[0].name.replace(/[^a-z0-9]+/gi, '_')}_syllabus_template.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logError(error, 'api/teacher/syllabus/template');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
