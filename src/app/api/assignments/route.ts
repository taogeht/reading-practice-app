import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { assignments, stories, classes, teachers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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
        className: classes.name,
      })
      .from(assignments)
      .leftJoin(stories, eq(assignments.storyId, stories.id))
      .leftJoin(classes, eq(assignments.classId, classes.id))
      .where(eq(assignments.teacherId, teacher.id))
      .orderBy(desc(assignments.createdAt));

    return NextResponse.json({
      success: true,
      assignments: teacherAssignments,
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