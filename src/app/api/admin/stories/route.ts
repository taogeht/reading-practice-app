import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, createRequestContext } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allStories = await db.select().from(stories).orderBy(stories.title);
    
    return NextResponse.json({ stories: allStories });
  } catch (error) {
    logError(error, 'api/admin/stories');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      content,
      readingLevel,
      gradeLevels,
      author,
      genre,
      active = true
    } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    // Calculate word count
    const wordCount = content.trim().split(/\s+/).length;
    // Estimate reading time (average 200 words per minute)
    const estimatedReadingTimeMinutes = Math.ceil(wordCount / 200);

    const newStory = await db.insert(stories).values({
      title,
      content,
      readingLevel: readingLevel || null,
      gradeLevels: gradeLevels || [],
      wordCount,
      estimatedReadingTimeMinutes,
      author: author || null,
      genre: genre || null,
      active,
      createdBy: user.id,
    }).returning();

    return NextResponse.json({ story: newStory[0] }, { status: 201 });
  } catch (error) {
    logError(error, 'api/admin/stories');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}