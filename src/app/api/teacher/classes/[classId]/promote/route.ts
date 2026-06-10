import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, academicTerms } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';
import { findUniqueSlug, isSlugAvailable, isValidSlug, suggestSlug } from '@/lib/classes/slug';

export const runtime = 'nodejs';

// Promote a class into a new term: creates a fresh class in the target term and
// copies the current roster into it. This kills the manual "re-create the class
// + re-add every student each year" grind. Curriculum progress starts over
// (currentUnit resets to 1); assignments, attendance, recaps, spelling, and
// syllabus are intentionally NOT carried over — only the roster + class config.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { targetTermId, newName, newSlug } = body;

    if (!targetTermId) {
      return NextResponse.json({ error: 'A target term is required' }, { status: 400 });
    }

    const sourceRows = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);
    if (!sourceRows.length) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    const source = sourceRows[0];

    // The target term must belong to the same school as the class being promoted.
    const term = await db
      .select({ id: academicTerms.id, name: academicTerms.name, schoolId: academicTerms.schoolId })
      .from(academicTerms)
      .where(eq(academicTerms.id, targetTermId))
      .limit(1);
    if (!term.length) {
      return NextResponse.json({ error: 'Target term not found' }, { status: 404 });
    }
    if (term[0].schoolId !== source.schoolId) {
      return NextResponse.json(
        { error: 'Target term belongs to a different school.' },
        { status: 400 },
      );
    }

    const resolvedName = (typeof newName === 'string' && newName.trim()) || source.name;

    // Resolve the slug: validate a teacher-supplied one, else derive a unique
    // slug seeded from the new name + term name.
    let slug: string;
    if (typeof newSlug === 'string' && newSlug.trim()) {
      const trimmed = newSlug.trim().toLowerCase();
      if (!isValidSlug(trimmed)) {
        return NextResponse.json(
          { error: 'Invalid URL slug. Use lowercase letters, numbers, and hyphens.' },
          { status: 400 },
        );
      }
      if (!(await isSlugAvailable(trimmed))) {
        const suggestion = await findUniqueSlug(trimmed);
        return NextResponse.json(
          { error: `That URL is already taken. Try "${suggestion}" instead.`, suggestion },
          { status: 409 },
        );
      }
      slug = trimmed;
    } else {
      slug = await findUniqueSlug(suggestSlug(resolvedName, term[0].name));
    }

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(classes)
        .values({
          name: resolvedName,
          description: source.description,
          gradeLevel: source.gradeLevel,
          academicYear: source.academicYear,
          termId: targetTermId,
          teacherId: source.teacherId, // ownership stays with the primary teacher
          schoolId: source.schoolId,
          slug,
          // Carry the teacher's class config, but start curriculum fresh.
          showPracticeStories: source.showPracticeStories,
          trackLoginActivity: source.trackLoginActivity,
          weeklyRecapEnabled: source.weeklyRecapEnabled,
          leaderboardEnabled: source.leaderboardEnabled,
          currentUnit: 1,
        })
        .returning();
      const newClass = inserted[0];

      const roster = await tx
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .where(eq(classEnrollments.classId, classId));

      if (roster.length > 0) {
        await tx.insert(classEnrollments).values(
          roster.map((r) => ({ classId: newClass.id, studentId: r.studentId })),
        );
      }

      return { newClass, enrolledCount: roster.length };
    });

    return NextResponse.json(
      {
        class: result.newClass,
        enrolledCount: result.enrolledCount,
        message: `Promoted ${result.enrolledCount} student${result.enrolledCount === 1 ? '' : 's'} into the new class.`,
      },
      { status: 201 },
    );
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/promote');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
