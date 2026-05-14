import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import { readingPassages } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { passageId } = await params;

    const [existing] = await db
      .select({ id: readingPassages.id, status: readingPassages.status })
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }
    if (existing.status !== 'review' && existing.status !== 'draft') {
      return NextResponse.json(
        {
          error: `Cannot approve a passage in status '${existing.status}'. Only review and draft passages can be approved.`,
        },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(readingPassages)
      .set({
        status: 'published',
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(eq(readingPassages.id, passageId))
      .returning();

    return NextResponse.json({ passage: updated }, { status: 200 });
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/approve');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
