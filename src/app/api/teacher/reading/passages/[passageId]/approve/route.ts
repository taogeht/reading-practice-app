import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import { readingPassages } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import { assessPassageForPublication } from '@/lib/reading/publication';

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

    const assessment = await assessPassageForPublication(passageId);
    if (!assessment.found) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }
    if (assessment.currentStatus !== 'review') {
      return NextResponse.json(
        {
          error: `Cannot approve a passage in status '${assessment.currentStatus}'. Only review passages can be approved.`,
        },
        { status: 400 },
      );
    }
    if (!assessment.publishable) {
      return NextResponse.json(
        {
          error: 'This passage is not ready to publish.',
          issues: assessment.issues,
          qualityReport: assessment.qualityReport,
        },
        { status: 409 },
      );
    }

    const generationMeta = {
      ...assessment.generationMeta,
      qualityReport: assessment.qualityReport,
    };

    const [updated] = await db
      .update(readingPassages)
      .set({
        status: 'published',
        generationMeta,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(readingPassages.id, passageId),
          eq(readingPassages.status, 'review'),
          eq(readingPassages.updatedAt, assessment.snapshotUpdatedAt),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        {
          error:
            'The passage changed while it was being validated. Review the latest version and approve again.',
        },
        { status: 409 },
      );
    }

    logInfo(
      'reading passage published',
      `api/teacher/reading/passages/approve passage_id=${passageId} reviewed_by=${user.id}`,
    );

    return NextResponse.json({ passage: updated }, { status: 200 });
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/approve');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
