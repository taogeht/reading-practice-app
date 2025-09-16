import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// POST /api/stories/[id]/archive - Archive a story
export async function POST(
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

    // For teachers, only allow archiving of stories they created
    // Admins can archive any story
    if (user.role === 'teacher' && existingStory[0].createdBy !== user.id) {
      return NextResponse.json({
        error: 'You can only archive stories you created'
      }, { status: 403 });
    }

    // Archive the story by setting active to false
    const archivedStory = await db
      .update(stories)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId))
      .returning();

    if (archivedStory.length === 0) {
      return NextResponse.json({ error: 'Failed to archive story' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Story archived successfully',
      story: {
        ...archivedStory[0],
        createdAt: archivedStory[0].createdAt.toISOString(),
        updatedAt: archivedStory[0].updatedAt.toISOString(),
        ttsGeneratedAt: archivedStory[0].ttsGeneratedAt?.toISOString() || null,
      },
    });

  } catch (error) {
    console.error('Error archiving story:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/stories/[id]/archive - Unarchive a story
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

    // For teachers, only allow unarchiving of stories they created
    // Admins can unarchive any story
    if (user.role === 'teacher' && existingStory[0].createdBy !== user.id) {
      return NextResponse.json({
        error: 'You can only unarchive stories you created'
      }, { status: 403 });
    }

    // Unarchive the story by setting active to true
    const unarchivedStory = await db
      .update(stories)
      .set({
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId))
      .returning();

    if (unarchivedStory.length === 0) {
      return NextResponse.json({ error: 'Failed to unarchive story' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Story unarchived successfully',
      story: {
        ...unarchivedStory[0],
        createdAt: unarchivedStory[0].createdAt.toISOString(),
        updatedAt: unarchivedStory[0].updatedAt.toISOString(),
        ttsGeneratedAt: unarchivedStory[0].ttsGeneratedAt?.toISOString() || null,
      },
    });

  } catch (error) {
    console.error('Error unarchiving story:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}