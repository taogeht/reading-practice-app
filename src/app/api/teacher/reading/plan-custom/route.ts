import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { planCustomStory } from '@/lib/reading/generate/custom-passage';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
      return NextResponse.json({ error: 'Please provide at least one page with story text.' }, { status: 400 });
    }

    const readingLevelId = Number.isInteger(body.readingLevelId) ? body.readingLevelId : 2;
    const plan = await planCustomStory({
      pages: body.pages,
      title: body.title,
      readingLevelId,
    });

    return NextResponse.json({ success: true, plan });
  } catch (err) {
    logError(err, 'api/teacher/reading/plan-custom');
    const msg = err instanceof Error ? err.message : 'Failed to analyze story';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
