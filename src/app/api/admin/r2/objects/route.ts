import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { r2Client } from '@/lib/storage/r2-client';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const MAX_PAGE_SIZE = 100;

function ensureAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureAdmin(user);

    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix') ?? undefined;
    const continuationToken = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const maxKeys = Math.min(
      Math.max(Number.parseInt(limitParam ?? '50', 10) || 50, 1),
      MAX_PAGE_SIZE,
    );

    const listResponse = await r2Client.listObjects({
      prefix,
      continuationToken,
      maxKeys,
    });

    const metadataResults = await Promise.all(
      listResponse.objects.map(async (object) => {
        const metadata = await r2Client.getFileMetadata(object.key);
        const metaRecord = metadata?.metadata || {};

        const storyId = metaRecord['story-id'] || metaRecord['story_id'];
        const artifactType = metaRecord['artifact-type'] || metaRecord['artifact_type'];

        return {
          key: object.key,
          size: object.size,
          lastModified: object.lastModified?.toISOString() ?? null,
          metadata: metaRecord,
          storyId,
          artifactType: artifactType ?? inferArtifactType(object.key),
        };
      }),
    );

    const storyIds = Array.from(
      new Set(metadataResults.map((item) => item.storyId).filter((id): id is string => Boolean(id))),
    );

    let storiesById: Record<string, { id: string; title: string }> = {};
    if (storyIds.length > 0) {
      const rows = await db
        .select({ id: stories.id, title: stories.title })
        .from(stories)
        .where(inArray(stories.id, storyIds));

      storiesById = rows.reduce<Record<string, { id: string; title: string }>>((acc, row) => {
        acc[row.id] = { id: row.id, title: row.title };
        return acc;
      }, {});
    }

    const items = metadataResults.map((item) => ({
      key: item.key,
      size: item.size,
      lastModified: item.lastModified,
      metadata: item.metadata,
      type: item.artifactType ?? inferArtifactType(item.key),
      story: item.storyId && storiesById[item.storyId]
        ? storiesById[item.storyId]
        : undefined,
    }));

    return NextResponse.json({
      items,
      nextCursor: listResponse.nextContinuationToken ?? null,
      isTruncated: listResponse.isTruncated ?? false,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error listing R2 objects:', error);
    return NextResponse.json({ error: 'Failed to list R2 objects' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    ensureAdmin(user);

    const body = await request.json().catch(() => null);
    const key = body?.key;

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const metadata = await r2Client.getFileMetadata(key);

    await r2Client.deleteFile(key);

    const storyIdFromMetadata = metadata?.metadata?.['story-id'] || metadata?.metadata?.['story_id'];

    let unlinkedStory: { id: string; title: string } | null = null;

    const unlinkStoryById = async (storyId: string) => {
      const [story] = await db
        .select({ id: stories.id, title: stories.title })
        .from(stories)
        .where(eq(stories.id, storyId))
        .limit(1);

      if (story) {
        await db
          .update(stories)
          .set({
            ttsAudioUrl: null,
            ttsAudioDurationSeconds: null,
            ttsGeneratedAt: null,
            elevenLabsVoiceId: null,
          })
          .where(eq(stories.id, story.id));

        unlinkedStory = story;
      }
    };

    if (storyIdFromMetadata) {
      await unlinkStoryById(storyIdFromMetadata);
    } else {
      const likePattern = `%${key}%`;
      const storyMatch = await db
        .select({ id: stories.id, title: stories.title })
        .from(stories)
        .where(sql`${stories.ttsAudioUrl} LIKE ${likePattern}`)
        .limit(1);

      if (storyMatch.length > 0) {
        await db
          .update(stories)
          .set({
            ttsAudioUrl: null,
            ttsAudioDurationSeconds: null,
            ttsGeneratedAt: null,
            elevenLabsVoiceId: null,
          })
          .where(eq(stories.id, storyMatch[0].id));

        unlinkedStory = storyMatch[0];
      }
    }

    return NextResponse.json({
      message: 'File deleted from R2',
      unlinkedStory,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error deleting R2 object:', error);
    return NextResponse.json({ error: 'Failed to delete R2 object' }, { status: 500 });
  }
}

function inferArtifactType(key: string): string {
  if (key.startsWith('audio/tts/')) {
    return 'tts-audio';
  }
  if (key.startsWith('audio/recordings/')) {
    return 'student-recording';
  }
  return 'unknown';
}
