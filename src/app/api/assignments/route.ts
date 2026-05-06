import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  assignments,
  stories,
  classes,
  teachers,
  classEnrollments,
  students,
  users,
  recordings,
} from '@/lib/db/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { accessibleClassIds, userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    // Across every class the user can manage (primary + co-teacher), pull
    // assignments. Admins see all.
    const allowedClassIds = await accessibleClassIds(user.id, user.role);

    // Get assignments for this teacher
    const teacherAssignments = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        status: assignments.status,
        assignedAt: assignments.assignedAt,
        dueAt: assignments.dueAt,
        maxAttempts: assignments.maxAttempts,
        instructions: assignments.instructions,
        recordingMode: assignments.recordingMode,
        createdAt: assignments.createdAt,
        storyTitle: stories.title,
        classId: assignments.classId,
        className: classes.name,
      })
      .from(assignments)
      .leftJoin(stories, eq(assignments.storyId, stories.id))
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .where(allowedClassIds.length > 0 ? inArray(assignments.classId, allowedClassIds) : sql`false`)
      .orderBy(desc(assignments.createdAt));

    const progressRows = await db
      .select({
        assignmentId: assignments.id,
        studentId: classEnrollments.studentId,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        studentGradeLevel: students.gradeLevel,
        studentReadingLevel: students.readingLevel,
        hasSubmitted: sql<number>`SUM(CASE WHEN ${recordings.status} = 'submitted' THEN 1 ELSE 0 END)`,
        hasReviewed: sql<number>`SUM(CASE WHEN ${recordings.status} = 'reviewed' THEN 1 ELSE 0 END)`,
      })
      .from(assignments)
      .innerJoin(classEnrollments, eq(assignments.classId, classEnrollments.classId))
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .leftJoin(
        recordings,
        and(
          eq(recordings.assignmentId, assignments.id),
          eq(recordings.studentId, classEnrollments.studentId),
          inArray(recordings.status, ['submitted', 'reviewed'])
        )
      )
      .where(allowedClassIds.length > 0 ? inArray(assignments.classId, allowedClassIds) : sql`false`)
      .groupBy(
        assignments.id,
        classEnrollments.studentId,
        users.firstName,
        users.lastName,
        students.gradeLevel,
        students.readingLevel
      );

    type ProgressEntry = {
      totalStudents: number;
      reviewedCount: number;
      needsReviewStudents: Array<{
        id: string;
        firstName: string;
        lastName: string;
        gradeLevel: number | null;
        readingLevel: string | null;
      }>;
      notStartedStudents: Array<{
        id: string;
        firstName: string;
        lastName: string;
        gradeLevel: number | null;
        readingLevel: string | null;
      }>;
    };

    const progressMap = new Map<string, ProgressEntry>();

    for (const assignment of teacherAssignments) {
      progressMap.set(assignment.id, {
        totalStudents: 0,
        reviewedCount: 0,
        needsReviewStudents: [],
        notStartedStudents: [],
      });
    }

    for (const row of progressRows) {
      const entry = progressMap.get(row.assignmentId);
      if (!entry) {
        continue;
      }

      entry.totalStudents += 1;

      const studentData = {
        id: row.studentId,
        firstName: row.studentFirstName ?? 'Unknown',
        lastName: row.studentLastName ?? '',
        gradeLevel: row.studentGradeLevel ?? null,
        readingLevel: row.studentReadingLevel ?? null,
      };

      if (row.hasReviewed && row.hasReviewed > 0) {
        entry.reviewedCount += 1;
      } else if (row.hasSubmitted && row.hasSubmitted > 0) {
        entry.needsReviewStudents.push(studentData);
      } else {
        entry.notStartedStudents.push(studentData);
      }
    }

    const assignmentsWithProgress = teacherAssignments.map((assignment) => {
      const progress = progressMap.get(assignment.id) ?? {
        totalStudents: 0,
        reviewedCount: 0,
        needsReviewStudents: [] as ProgressEntry['needsReviewStudents'],
        notStartedStudents: [] as ProgressEntry['notStartedStudents'],
      };

      return {
        ...assignment,
        totalStudents: progress.totalStudents,
        reviewedCount: progress.reviewedCount,
        needsReviewStudents: progress.needsReviewStudents,
        notStartedStudents: progress.notStartedStudents,
      };
    });

    return NextResponse.json({
      success: true,
      assignments: assignmentsWithProgress,
    });
  } catch (error) {
    logError(error, 'api/assignments');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get teacher ID
    const teacher = await db.query.teachers.findFirst({
      where: eq(teachers.id, user.id),
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      description,
      storyId,
      classId,
      dueAt,
      maxAttempts = 3,
      instructions,
      recordingMode = 'teacher_review',
    } = body;

    // Validate required fields
    if (!title || !storyId || !classId) {
      return NextResponse.json(
        { error: 'Title, story, and class are required' },
        { status: 400 }
      );
    }

    // Server-side guard: only accept ai_graded when the env flag is on, even
    // if the client sends it. Belt-and-suspenders for the feature flag.
    if (recordingMode !== 'teacher_review' && recordingMode !== 'ai_graded') {
      return NextResponse.json(
        { error: 'Invalid recordingMode' },
        { status: 400 }
      );
    }
    if (recordingMode === 'ai_graded' && process.env.ENABLE_AI_GRADING !== 'true') {
      return NextResponse.json(
        { error: 'AI-graded recordings are not enabled in this environment' },
        { status: 403 }
      );
    }

    // Verify the story exists
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
    });

    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // Verify the user can manage this class (primary or co-teacher).
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({
        error: 'Class not found or you do not have permission to assign to this class'
      }, { status: 404 });
    }
    const classRecord = await db.query.classes.findFirst({
      where: eq(classes.id, classId),
    });
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // Create the assignment
    const [newAssignment] = await db
      .insert(assignments)
      .values({
        title,
        description,
        storyId,
        classId,
        teacherId: teacher.id,
        status: 'published',
        assignedAt: new Date(),
        dueAt: dueAt ? new Date(dueAt) : null,
        maxAttempts,
        instructions,
        recordingMode,
      })
      .returning();

    return NextResponse.json({
      success: true,
      assignment: newAssignment,
      message: 'Assignment created successfully',
    });
  } catch (error) {
    logError(error, 'api/assignments');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
