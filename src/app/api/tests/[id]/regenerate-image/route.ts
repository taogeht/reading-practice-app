import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';
import { regenerateTestItemImage } from '@/lib/practice/test-images';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canGeneratePracticeQuestions(user))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { id } = await params;
  let body: { itemId?: unknown; imagePrompt?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.itemId !== 'string' || !body.itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  // Ownership: teachers only their own; admins any.
  const scope =
    user.role === 'admin'
      ? eq(generatedTests.id, id)
      : and(eq(generatedTests.id, id), eq(generatedTests.generatedBy, user.id));
  const [row] = await db
    .select({ id: generatedTests.id })
    .from(generatedTests)
    .where(scope)
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const override =
    typeof body.imagePrompt === 'string' && body.imagePrompt.trim()
      ? body.imagePrompt.trim()
      : undefined;

  try {
    const result = await regenerateTestItemImage(id, body.itemId, override);
    if (!result) {
      return NextResponse.json({ error: 'Item not found or has no prompt' }, { status: 404 });
    }
    return NextResponse.json({ itemId: body.itemId, ...result });
  } catch (error) {
    logError(error, 'tests.regenerateImage');
    const message = error instanceof Error ? error.message : 'Failed to regenerate image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
