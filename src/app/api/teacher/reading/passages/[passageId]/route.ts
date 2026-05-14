import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  users,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string }>;
}

/** GET /api/teacher/reading/passages/[passageId]
 *  Returns the passage row plus all pages and questions. Used by the
 *  focused review page. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { passageId } = await params;

    const [passage] = await db
      .select()
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    // Pull each page along with the editor's name (left join — most pages
    // are NULL for editedBy until a teacher manually edits them).
    const pageRows = await db
      .select({
        id: storyPages.id,
        passageId: storyPages.passageId,
        pageNumber: storyPages.pageNumber,
        text: storyPages.text,
        imageKey: storyPages.imageKey,
        imagePromptUsed: storyPages.imagePromptUsed,
        ttsAudioKey: storyPages.ttsAudioKey,
        ttsVoice: storyPages.ttsVoice,
        editedAt: storyPages.editedAt,
        editedBy: storyPages.editedBy,
        editedByFirstName: users.firstName,
        editedByLastName: users.lastName,
        createdAt: storyPages.createdAt,
        updatedAt: storyPages.updatedAt,
      })
      .from(storyPages)
      .leftJoin(users, eq(users.id, storyPages.editedBy))
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    const pages = pageRows.map((p) => ({
      id: p.id,
      passageId: p.passageId,
      pageNumber: p.pageNumber,
      text: p.text,
      imageKey: p.imageKey,
      imagePromptUsed: p.imagePromptUsed,
      ttsAudioKey: p.ttsAudioKey,
      ttsVoice: p.ttsVoice,
      editedAt: p.editedAt ? p.editedAt.toISOString() : null,
      editedBy: p.editedBy,
      editorName:
        p.editedByFirstName || p.editedByLastName
          ? `${p.editedByFirstName ?? ''} ${p.editedByLastName ?? ''}`.trim()
          : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    const questions = await db
      .select()
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, passageId))
      .orderBy(readingQuestions.orderIndex);

    return NextResponse.json({ passage, pages, questions });
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/[passageId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const MAX_TITLE_LEN = 200;

/** PATCH /api/teacher/reading/passages/[passageId]
 *  Updates editable metadata on a passage. Currently only `title`.
 *  Auth: teacher or admin (same surface as GET / approve / reject —
 *  passages are platform-wide assets, not class-scoped). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { passageId } = await params;

    const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
    if (!body || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title (string) is required' }, { status: 400 });
    }
    const title = body.title.trim();
    if (title.length === 0) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LEN) {
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE_LEN} characters or fewer` },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(readingPassages)
      .set({ title, updatedAt: new Date() })
      .where(eq(readingPassages.id, passageId))
      .returning({ id: readingPassages.id, title: readingPassages.title });
    if (!updated) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    return NextResponse.json({ id: updated.id, title: updated.title });
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/[passageId] PATCH');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
