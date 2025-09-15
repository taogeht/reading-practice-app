import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
    console.error('Error fetching story:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}