import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories, users } from '@/lib/db/schema';
import { eq, and, asc, desc, like, inArray, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/stories - Fetch stories with filtering
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search');
    const readingLevel = searchParams.get('readingLevel');
    const gradeLevel = searchParams.get('gradeLevel');
    const genre = searchParams.get('genre');
    const hasAudio = searchParams.get('hasAudio'); // 'true', 'false', or null
    const includeArchived = searchParams.get('includeArchived'); // 'true' to include archived stories
    const archivedOnly = searchParams.get('archivedOnly'); // 'true' to show only archived stories

    const offset = (page - 1) * limit;

    // Build query conditions
    const conditions = [];

    // Handle archive filtering
    if (archivedOnly === 'true') {
      conditions.push(eq(stories.active, false));
    } else if (includeArchived !== 'true') {
      // Default behavior: only show active stories
      conditions.push(eq(stories.active, true));
    }
    // If includeArchived is true but archivedOnly is not, we don't filter by active status

    if (search) {
      conditions.push(
        like(stories.title, `%${search}%`)
      );
    }

    if (readingLevel) {
      conditions.push(eq(stories.readingLevel, readingLevel));
    }

    if (gradeLevel) {
      // PostgreSQL array contains check
      const gradeArray = `{${parseInt(gradeLevel)}}`;
      conditions.push(
        // @ts-ignore - Drizzle doesn't have perfect array support yet
        sql`${stories.gradeLevels} @> ${gradeArray}`
      );
    }

    if (genre) {
      conditions.push(eq(stories.genre, genre));
    }

    if (hasAudio === 'true') {
      // Only stories with TTS audio
      conditions.push(
        // @ts-ignore
        sql`${stories.ttsAudioUrl} IS NOT NULL`
      );
    } else if (hasAudio === 'false') {
      // Only stories without TTS audio
      conditions.push(
        // @ts-ignore
        sql`${stories.ttsAudioUrl} IS NULL`
      );
    }

    // Fetch stories with creator info
    const storiesData = await db
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
      .where(and(...conditions))
      .orderBy(desc(stories.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalCount = await db
      .select({ count: sql`COUNT(*)` })
      .from(stories)
      .where(and(...conditions));

    return NextResponse.json({
      stories: storiesData,
      pagination: {
        page,
        limit,
        total: Number(totalCount[0].count),
        totalPages: Math.ceil(Number(totalCount[0].count) / limit),
      },
    });

  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/stories - Create new story (teachers and admins only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      content,
      readingLevel,
      gradeLevels,
      author,
      genre,
      generateTTS = false,
      voiceId,
    } = body;

    // Validate required fields
    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    // Calculate word count and estimated reading time
    const wordCount = content.trim().split(/\s+/).length;
    const estimatedReadingTimeMinutes = Math.ceil(wordCount / 150); // Average reading speed

    // Create the story
    const [newStory] = await db
      .insert(stories)
      .values({
        title,
        content,
        readingLevel,
        gradeLevels: gradeLevels || [],
        wordCount,
        estimatedReadingTimeMinutes,
        author,
        genre,
        createdBy: user.id,
      })
      .returning();

    // If TTS generation requested, trigger it asynchronously
    if (generateTTS) {
      // In a real application, you might want to use a job queue here
      // For now, we'll just return the story and let the client handle TTS generation
      return NextResponse.json({
        story: newStory,
        message: 'Story created successfully. TTS generation can be triggered separately.',
        ttsReady: false,
      });
    }

    return NextResponse.json({
      story: newStory,
      message: 'Story created successfully',
    });

  } catch (error) {
    console.error('Error creating story:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}