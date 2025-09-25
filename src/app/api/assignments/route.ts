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
        createdAt: assignments.createdAt,
        storyTitle: stories.title,
        classId: assignments.classId,
        className: classes.name,
      })
      .from(assignments)
      .leftJoin(stories, eq(assignments.storyId, stories.id))
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .where(eq(assignments.teacherId, teacher.id))
      .orderBy(desc(assignments.createdAt));

    const progressRows = await db
      .select({
        assignmentId: assignments.id,
        studentId: classEnrollments.studentId,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        studentGradeLevel: students.gradeLevel,
        studentReadingLevel: students.readingLevel,
        hasCompleted: sql<number>`CASE WHEN count(${recordings.id}) > 0 THEN 1 ELSE 0 END`,
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
      .where(eq(assignments.teacherId, teacher.id))
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
      completedCount: number;
      pendingStudents: Array<{
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
        completedCount: 0,
        pendingStudents: [],
      });
    }

    for (const row of progressRows) {
      const entry = progressMap.get(row.assignmentId);
      if (!entry) {
        continue;
      }

      entry.totalStudents += 1;

      if (row.hasCompleted > 0) {
        entry.completedCount += 1;
      } else {
        entry.pendingStudents.push({
          id: row.studentId,
          firstName: row.studentFirstName ?? 'Unknown',
          lastName: row.studentLastName ?? '',
          gradeLevel: row.studentGradeLevel ?? null,
          readingLevel: row.studentReadingLevel ?? null,
        });
      }
    }

    const assignmentsWithProgress = teacherAssignments.map((assignment) => {
      const progress = progressMap.get(assignment.id) ?? {
        totalStudents: 0,
        completedCount: 0,
        pendingStudents: [] as ProgressEntry['pendingStudents'],
      };

      return {
        ...assignment,
        totalStudents: progress.totalStudents,
        completedCount: progress.completedCount,
        pendingStudents: progress.pendingStudents,
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
    } = body;

    // Validate required fields
    if (!title || !storyId || !classId) {
      return NextResponse.json(
        { error: 'Title, story, and class are required' },
        { status: 400 }
      );
    }

    // Verify the story exists
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
    });

    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // Verify the class exists and belongs to this teacher
    const classRecord = await db.query.classes.findFirst({
      where: and(
        eq(classes.id, classId),
        eq(classes.teacherId, teacher.id)
      ),
    });

    if (!classRecord) {
      return NextResponse.json({ 
        error: 'Class not found or you do not have permission to assign to this class' 
      }, { status: 404 });
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
