import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { academicTerms } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { termId } = await params;
    const existing = await db
      .select()
      .from(academicTerms)
      .where(eq(academicTerms.id, termId))
      .limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }
    const term = existing[0];

    const body = await request.json();
    const { name, startDate, endDate, isCurrent } = body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Term name cannot be empty' }, { status: 400 });
    }

    const makeCurrent = isCurrent === true;

    const updated = await db.transaction(async (tx) => {
      if (makeCurrent) {
        // Demote any other current term for this school first (the target row
        // is excluded so we don't immediately re-clear it).
        await tx
          .update(academicTerms)
          .set({ isCurrent: false })
          .where(
            and(
              eq(academicTerms.schoolId, term.schoolId),
              eq(academicTerms.isCurrent, true),
              ne(academicTerms.id, termId),
            ),
          );
      }
      const rows = await tx
        .update(academicTerms)
        .set({
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(startDate !== undefined ? { startDate: startDate || null } : {}),
          ...(endDate !== undefined ? { endDate: endDate || null } : {}),
          ...(isCurrent !== undefined ? { isCurrent: makeCurrent } : {}),
        })
        .where(eq(academicTerms.id, termId))
        .returning();
      return rows[0];
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.term.update',
      resourceType: 'academic_term',
      resourceId: termId,
      details: { name: updated.name, isCurrent: updated.isCurrent },
      request,
    });

    return NextResponse.json({ term: updated });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: 'A term with that name already exists for this school.' },
        { status: 409 },
      );
    }
    logError(error, 'api/admin/terms/[termId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { termId } = await params;
    const existing = await db
      .select({ id: academicTerms.id, name: academicTerms.name })
      .from(academicTerms)
      .where(eq(academicTerms.id, termId))
      .limit(1);
    if (!existing.length) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    // Classes referencing this term have classes.term_id set null via the FK
    // (ON DELETE SET NULL) — they fall back to "Ungrouped", nothing is removed.
    await db.delete(academicTerms).where(eq(academicTerms.id, termId));

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.term.delete',
      resourceType: 'academic_term',
      resourceId: termId,
      details: { name: existing[0].name },
      request,
    });

    return NextResponse.json({ message: 'Term deleted' });
  } catch (error) {
    logError(error, 'api/admin/terms/[termId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Detects a Postgres unique_violation (23505) anywhere in the (drizzle-wrapped)
// error chain.
function isUniqueViolation(error: unknown): boolean {
  let cur: unknown = error;
  for (let depth = 0; cur && depth < 5; depth++) {
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (e.code === '23505') return true;
    if (typeof e.message === 'string' && /duplicate key|unique_term_school_name/i.test(e.message)) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}
