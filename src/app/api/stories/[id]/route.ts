import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/stories/[id] - Fetch a specific story by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyId } = await params;

    // Fetch the story with creator info
    const storyData = await db
      .select({
        id: stories.id,
        title: stories.title,
        content: stories.content,
        readingLevel: stories.readingLevel,
        gradeLevels: stories.gradeLevels,
        wordCount: stories.wordCount,
        estimatedReadingTimeMinutes: stories.estimatedReadingTimeMinutes,
        author: stories.author,
        genre: stories.genre,
        ttsAudioUrl: stories.ttsAudioUrl,
        ttsAudioDurationSeconds: stories.ttsAudioDurationSeconds,
        ttsGeneratedAt: stories.ttsGeneratedAt,
        elevenLabsVoiceId: stories.elevenLabsVoiceId,
        active: stories.active,
        createdAt: stories.createdAt,
        updatedAt: stories.updatedAt,
        createdBy: stories.createdBy,
        creatorFirstName: users.firstName,
        creatorLastName: users.lastName,
      })
      .from(stories)
      .leftJoin(users, eq(stories.createdBy, users.id))
      .where(eq(stories.id, storyId))
      .limit(1);

    if (storyData.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const story = storyData[0];

    // Check if story is active
    if (!story) {
      return NextResponse.json({ error: 'Story not available' }, { status: 404 });
    }

    return NextResponse.json({
      story: {
        ...story,
        createdAt: story.createdAt.toISOString(),
        updatedAt: story.updatedAt.toISOString(),
        ttsGeneratedAt: story.ttsGeneratedAt?.toISOString() || null,
      },
    });

  } catch (error) {
    logError(error, 'api/stories/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/stories/[id] - Update a story (for teachers)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyId } = await params;

    // Verify the story exists and get current data
    const existingStory = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    if (existingStory.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      title,
      content,
      readingLevel,
      gradeLevels,
      author,
      genre,
    } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // Calculate word count
    const wordCount = content.trim().split(/\s+/).length;
    // Estimate reading time (average 200 words per minute)
    const estimatedReadingTimeMinutes = Math.ceil(wordCount / 200);

    const updatedStory = await db
      .update(stories)
      .set({
        title,
        content,
        readingLevel: readingLevel || null,
        gradeLevels: gradeLevels || [],
        wordCount,
        estimatedReadingTimeMinutes,
        author: author || null,
        genre: genre || null,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId))
      .returning();

    if (updatedStory.length === 0) {
      return NextResponse.json({ error: 'Failed to update story' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      story: {
        ...updatedStory[0],
        createdAt: updatedStory[0].createdAt.toISOString(),
        updatedAt: updatedStory[0].updatedAt.toISOString(),
        ttsGeneratedAt: updatedStory[0].ttsGeneratedAt?.toISOString() || null,
      },
    });

  } catch (error) {
    logError(error, 'api/stories/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/stories/[id] - Delete a story (for teachers and admins)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyId } = await params;

    // Verify the story exists
    const existingStory = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    if (existingStory.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // For teachers, only allow deletion of stories they created
    // Admins can delete any story
    if (user.role === 'teacher' && existingStory[0].createdBy !== user.id) {
      return NextResponse.json({
        error: 'You can only delete stories you created'
      }, { status: 403 });
    }

    // Delete the story
    const deletedStory = await db
      .delete(stories)
      .where(eq(stories.id, storyId))
      .returning();

    if (deletedStory.length === 0) {
      return NextResponse.json({ error: 'Failed to delete story' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Story deleted successfully',
    });

  } catch (error) {
    logError(error, 'api/stories/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}