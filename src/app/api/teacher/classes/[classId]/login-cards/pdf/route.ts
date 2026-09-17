import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { userCanManageClass } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classes, classEnrollments, students, users } from '@/lib/db/schema';
import { renderPdfFromHtml } from '@/lib/pdf/browser';
import {
  renderLoginCardsHtml,
  type LoginCardLayout,
  type StudentCardData,
} from '@/lib/pdf/login-cards-html';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_LAYOUTS = new Set<LoginCardLayout>(['double_sided', 'qr', 'passcode']);

function safeFilename(className: string, layout: string): string {
  const base =
    className
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'class';
  return `${base}-login-cards-${layout}.pdf`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { classId } = await params;
    if (user.role !== 'admin' && !(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const [classRow] = await db
      .select({
        id: classes.id,
        name: classes.name,
        slug: classes.slug,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRow) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const layoutParam = (searchParams.get('layout') ?? 'double_sided') as LoginCardLayout;
    const layout = VALID_LAYOUTS.has(layoutParam) ? layoutParam : 'double_sided';
    const studentsParam = searchParams.get('students');

    const studentRows = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        loginToken: users.loginToken,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    let targetStudents: StudentCardData[] = studentRows.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      loginToken: r.loginToken,
      visualPasswordType: r.visualPasswordType as 'animal' | 'object' | null,
      visualPasswordData: r.visualPasswordData as { animal?: string; object?: string } | null,
    }));

    if (studentsParam) {
      const allowedIds = new Set(studentsParam.split(',').map((s) => s.trim()));
      targetStudents = targetStudents.filter((s) => allowedIds.has(s.id));
    }

    if (targetStudents.length === 0) {
      return NextResponse.json({ error: 'No students selected to print' }, { status: 400 });
    }

    const baseUrl = request.nextUrl.origin;
    const html = renderLoginCardsHtml({
      classData: classRow,
      students: targetStudents,
      baseUrl,
      layout,
    });

    const pdf = await renderPdfFromHtml(html, { format: 'Letter' });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(classRow.name, layout)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logError(error, 'teacher.classes.login-cards.pdf');
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
