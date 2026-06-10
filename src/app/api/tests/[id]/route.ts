import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';

export const runtime = 'nodejs';

// Admins may touch any test; teachers only their own. Returns the matching
// condition or null if the caller is neither.
function ownerScope(user: { id: string; role: string }, id: string) {
  if (user.role === 'admin') return eq(generatedTests.id, id);
  return and(eq(generatedTests.id, id), eq(generatedTests.generatedBy, user.id));
}

async function authed() {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await canGeneratePracticeQuestions(user))) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await authed();
  if (a.error) return a.error;
  const { id } = await params;

  const [row] = await db
    .select()
    .from(generatedTests)
    .where(ownerScope(a.user, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ test: row });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const a = await authed();
  if (a.error) return a.error;
  const { id } = await params;

  let body: { title?: unknown; active?: unknown; removeItemId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const [row] = await db.select().from(generatedTests).where(ownerScope(a.user, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Partial<typeof generatedTests.$inferInsert> = {};

  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    updates.title = t.slice(0, 200);
  }
  if (typeof body.active === 'boolean') {
    updates.active = body.active;
  }
  // Prune one bad item out of the document blob, dropping any section it empties.
  if (typeof body.removeItemId === 'string' && body.removeItemId) {
    const doc = row.document;
    doc.sections = doc.sections
      .map((s) => ({ ...s, items: s.items.filter((it) => it.id !== body.removeItemId) }))
      .filter((s) => s.items.length > 0);
    updates.document = doc;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(generatedTests)
    .set(updates)
    .where(eq(generatedTests.id, id))
    .returning();
  return NextResponse.json({ test: updated });
}

// Soft delete (archive) — the library lists active tests only, so this hides it
// while keeping it recoverable, matching the project's active-boolean convention.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const a = await authed();
  if (a.error) return a.error;
  const { id } = await params;

  const [archived] = await db
    .update(generatedTests)
    .set({ active: false })
    .where(ownerScope(a.user, id))
    .returning({ id: generatedTests.id });
  if (!archived) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
