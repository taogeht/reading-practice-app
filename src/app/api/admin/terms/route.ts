import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { academicTerms, schools } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

// Admin-managed academic terms (school-scoped). Terms group classes by a span
// of the school year and power the "promote roster to next term" flow + the
// longitudinal student-journey view. At most one term per school is current,
// enforced by the uniq_one_current_term_per_school partial index and by
// clearing siblings inside a transaction on write.

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const schoolId = request.nextUrl.searchParams.get('schoolId');

    const rows = await db
      .select({
        id: academicTerms.id,
        schoolId: academicTerms.schoolId,
        schoolName: schools.name,
        name: academicTerms.name,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
        isCurrent: academicTerms.isCurrent,
        createdAt: academicTerms.createdAt,
      })
      .from(academicTerms)
      .innerJoin(schools, eq(academicTerms.schoolId, schools.id))
      .where(schoolId ? eq(academicTerms.schoolId, schoolId) : undefined)
      .orderBy(schools.name, desc(academicTerms.startDate), desc(academicTerms.createdAt));

    return NextResponse.json({ terms: rows });
  } catch (error) {
    logError(error, 'api/admin/terms');
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
    const { schoolId, name, startDate, endDate, isCurrent } = body;

    if (!schoolId || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'School and term name are required' }, { status: 400 });
    }

    const school = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!school.length) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const makeCurrent = isCurrent === true;

    const term = await db.transaction(async (tx) => {
      if (makeCurrent) {
        // Only one current term per school — demote any existing current one
        // before inserting so the partial unique index is satisfied.
        await tx
          .update(academicTerms)
          .set({ isCurrent: false })
          .where(and(eq(academicTerms.schoolId, schoolId), eq(academicTerms.isCurrent, true)));
      }
      const inserted = await tx
        .insert(academicTerms)
        .values({
          schoolId,
          name: name.trim(),
          startDate: startDate || null,
          endDate: endDate || null,
          isCurrent: makeCurrent,
        })
        .returning();
      return inserted[0];
    });

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.term.create',
      resourceType: 'academic_term',
      resourceId: term.id,
      details: { schoolId, name: term.name, isCurrent: makeCurrent },
      request,
    });

    return NextResponse.json({ term }, { status: 201 });
  } catch (error) {
    // Unique (school_id, name) collision = Postgres 23505. Drizzle wraps the
    // driver error, so the code/message sits on error.cause, not error itself.
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: 'A term with that name already exists for this school.' },
        { status: 409 },
      );
    }
    logError(error, 'api/admin/terms');
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
