import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  stories,
  assignments,
  recordings,
  studentProgress,
} from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, inArray } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const story = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
    
    if (story.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    return NextResponse.json({ story: story[0] });
  } catch (error) {
    logError(error, 'api/admin/stories/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      title,
      content,
      readingLevel,
      gradeLevels,
      author,
      genre,
      active
    } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // Calculate word count
    const wordCount = content.trim().split(/\s+/).length;
    // Estimate reading time (average 200 words per minute)
    const estimatedReadingTimeMinutes = Math.ceil(wordCount / 200);

    const updatedStory = await db.update(stories)
      .set({
        title,
        content,
        readingLevel: readingLevel || null,
        gradeLevels: gradeLevels || [],
        wordCount,
        estimatedReadingTimeMinutes,
        author: author || null,
        genre: genre || null,
        active: active ?? true,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, id))
      .returning();

    if (updatedStory.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    return NextResponse.json({ story: updatedStory[0] });
  } catch (error) {
    logError(error, 'api/admin/stories/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await db.transaction(async (tx) => {
      const assignmentsForStory = await tx
        .select({ id: assignments.id })
        .from(assignments)
        .where(eq(assignments.storyId, id));

      const assignmentIds = assignmentsForStory.map((row) => row.id);

      if (assignmentIds.length > 0) {
        await tx
          .delete(studentProgress)
          .where(inArray(studentProgress.assignmentId, assignmentIds));

        await tx
          .delete(recordings)
          .where(inArray(recordings.assignmentId, assignmentIds));

        await tx
          .delete(assignments)
          .where(inArray(assignments.id, assignmentIds));
      }

      const deletedStory = await tx
        .delete(stories)
        .where(eq(stories.id, id))
        .returning();

      if (deletedStory.length === 0) {
        return null;
      }

      return {
        story: deletedStory[0],
        removedAssignments: assignmentIds.length,
      };
    });

    if (!result) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Story deleted successfully',
      removedAssignments: result.removedAssignments,
    });
  } catch (error) {
    logError(error, 'api/admin/stories/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
