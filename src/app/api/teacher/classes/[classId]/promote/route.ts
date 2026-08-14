import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, academicTerms } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userIsClassPrimary } from '@/lib/auth/class-access';
import { findUniqueSlug, isSlugAvailable, isValidSlug, suggestSlug } from '@/lib/classes/slug';

export const runtime = 'nodejs';

class PromotionConflictError extends Error {}

// Promote a class into a new term: creates a fresh class in the target term and
// copies the current roster into it, then archives the source class. This kills
// the manual "re-create the class + re-add every student each year" grind.
// Curriculum progress starts over
// (currentUnit resets to 1); assignments, attendance, recaps, spelling, and
// syllabus are intentionally NOT carried over — only the roster + class config.
// The source points to its successor so all previously shared class links keep
// resolving. Student token QR codes remain stable because students are reused.
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
    // Promotion archives the source class and establishes its permanent
    // successor, so it remains an owner-level action rather than a normal
    // co-teacher class mutation. Administrators retain their global access.
    if (user.role !== 'admin' && !(await userIsClassPrimary(user.id, classId))) {
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
    if (!source.active || source.promotedToClassId) {
      return NextResponse.json(
        { error: 'This class has already been archived or promoted.' },
        { status: 409 },
      );
    }

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
    if (source.termId === targetTermId) {
      return NextResponse.json(
        { error: 'Choose a different term for the promoted class.' },
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

      // Archive and link the source in the same transaction as class creation.
      // The conditional update prevents two concurrent promotion requests from
      // creating separate successors for the same cohort.
      const archived = await tx
        .update(classes)
        .set({
          active: false,
          promotedToClassId: newClass.id,
          updatedAt: new Date(),
        })
        .where(and(
          eq(classes.id, classId),
          eq(classes.active, true),
          isNull(classes.promotedToClassId),
        ))
        .returning({ id: classes.id });

      if (!archived.length) {
        throw new PromotionConflictError('Class was promoted by another request.');
      }

      return { newClass, enrolledCount: roster.length };
    });

    return NextResponse.json(
      {
        class: result.newClass,
        enrolledCount: result.enrolledCount,
        message: `Promoted ${result.enrolledCount} student${result.enrolledCount === 1 ? '' : 's'} and archived the previous class. Existing login links still work.`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PromotionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logError(error, 'api/teacher/classes/[classId]/promote');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
