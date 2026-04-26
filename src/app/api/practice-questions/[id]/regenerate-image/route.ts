import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { practiceQuestions } from '@/lib/db/schema';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { imagePrompt?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — if absent we use the stored prompt.
  }

  const [row] = await db
    .select()
    .from(practiceQuestions)
    .where(eq(practiceQuestions.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const overridePrompt =
    typeof body.imagePrompt === 'string' && body.imagePrompt.trim().length > 0
      ? body.imagePrompt.trim()
      : null;
  const prompt = overridePrompt ?? row.imagePrompt;

  if (!prompt) {
    return NextResponse.json(
      { error: 'No imagePrompt available — provide one in the request body.' },
      { status: 400 }
    );
  }

  try {
    const result = await geminiImageClient.generateScene(prompt);
    if (!result.success || !result.imageBuffer) {
      return NextResponse.json(
        { error: result.error || 'Gemini did not return an image' },
        { status: 502 }
      );
    }

    const key = r2Client.generatePracticeImageKey(row.unit, row.id);
    const imageUrl = await r2Client.uploadFile(
      key,
      result.imageBuffer,
      result.contentType || 'image/png'
    );

    // Append a cache-buster so the browser picks up the new image even
    // though the R2 key didn't change.
    const bustedUrl = `${imageUrl}?v=${Date.now()}`;

    const [updated] = await db
      .update(practiceQuestions)
      .set({
        imageUrl: bustedUrl,
        imagePrompt: overridePrompt ?? row.imagePrompt,
      })
      .where(eq(practiceQuestions.id, id))
      .returning();

    return NextResponse.json({ question: updated });
  } catch (error) {
    logError(error, `practice-questions.image.regenerate[${id}]`);
    const message = error instanceof Error ? error.message : 'Image regeneration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
