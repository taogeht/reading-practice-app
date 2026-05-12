import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classEnrollments, users, students } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { userCanManageClass, userIsClassPrimary } from '@/lib/auth/class-access';
import { findUniqueSlug, isSlugAvailable, isValidSlug } from '@/lib/classes/slug';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get class details with student count
    const classData = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        slug: classes.slug,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        showPracticeStories: classes.showPracticeStories,
        trackLoginActivity: classes.trackLoginActivity,
        weeklyRecapEnabled: classes.weeklyRecapEnabled,
        createdAt: classes.createdAt,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classData.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Get enrolled students
    const enrolledStudents = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        gradeLevel: students.gradeLevel,
        readingLevel: students.readingLevel,
        enrolledAt: classEnrollments.enrolledAt,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
        avatarUrl: students.avatarUrl,
        loginToken: users.loginToken,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    // Whether the calling user is the primary teacher of this class.
    // Admins read as primary so they keep their full toolbox. Drives
    // UI gating on the class detail page (advanced settings, progress,
    // weekly recap, syllabus import — primary-only sections).
    const callerIsPrimary =
      user.role === 'admin'
        ? true
        : await userIsClassPrimary(user.id, classId);

    return NextResponse.json({
      class: {
        ...classData[0],
        studentCount: enrolledStudents.length,
        students: enrolledStudents,
      },
      isPrimary: callerIsPrimary,
    }, { status: 200 });

  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const body = await request.json();
    const {
      name,
      description,
      gradeLevel,
      academicYear,
      active,
      showPracticeStories,
      trackLoginActivity,
      weeklyRecapEnabled,
      slug: requestedSlug,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    const existingClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!existingClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Validate the slug if the teacher edited it. An empty/whitespace value
    // means "leave as-is" (we never wipe the slug to null after a class has one).
    let slugUpdate: string | undefined;
    if (typeof requestedSlug === 'string' && requestedSlug.trim()) {
      const trimmed = requestedSlug.trim().toLowerCase();
      if (!isValidSlug(trimmed)) {
        return NextResponse.json(
          {
            error:
              'Invalid URL slug. Use 3–60 characters: lowercase letters, numbers, and hyphens only (must contain at least one letter).',
          },
          { status: 400 },
        );
      }
      if (!(await isSlugAvailable(trimmed, classId))) {
        const suggestion = await findUniqueSlug(trimmed, classId);
        return NextResponse.json(
          {
            error: `That URL is already taken. Try "${suggestion}" instead.`,
            suggestion,
          },
          { status: 409 },
        );
      }
      slugUpdate = trimmed;
    }

    // Update class
    const updatedClass = await db
      .update(classes)
      .set({
        name: name.trim(),
        description: description?.trim() || null,
        gradeLevel: gradeLevel !== undefined && gradeLevel !== null && gradeLevel !== '' ? Number(gradeLevel) : null,
        academicYear: academicYear?.trim() || null,
        active: active !== undefined ? active : true,
        showPracticeStories: showPracticeStories !== undefined ? showPracticeStories : false,
        trackLoginActivity: trackLoginActivity !== undefined ? trackLoginActivity : true,
        weeklyRecapEnabled: weeklyRecapEnabled !== undefined ? weeklyRecapEnabled : true,
        ...(slugUpdate !== undefined ? { slug: slugUpdate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId))
      .returning();

    return NextResponse.json(
      { class: updatedClass[0], message: 'Class updated successfully' },
      { status: 200 }
    );

  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    const { classId } = await params;
    // Only the primary teacher (or admin) can delete a class — co-teachers
    // can edit but not remove.
    if (user.role !== 'admin' && !(await userIsClassPrimary(user.id, classId))) {
      return NextResponse.json(
        { error: 'Only the primary teacher can delete this class' },
        { status: 403 },
      );
    }

    const existingClass = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!existingClass.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if class has enrolled students
    const studentCount = await db
      .select({ count: count() })
      .from(classEnrollments)
      .where(eq(classEnrollments.classId, classId));

    if (studentCount[0]?.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete class with enrolled students. Remove students first.' },
        { status: 400 }
      );
    }

    // Delete class
    await db
      .delete(classes)
      .where(eq(classes.id, classId));

    return NextResponse.json(
      { message: 'Class deleted successfully' },
      { status: 200 }
    );

  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
