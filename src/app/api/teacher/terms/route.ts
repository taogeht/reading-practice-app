import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { academicTerms, schoolMemberships } from '@/lib/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// Read-only term list for teachers — populates the term <Select> on class
// create/edit and the promote-to-term dialog. Scoped to the schools the teacher
// belongs to (admins see every term). Terms themselves are admin-managed
// (/api/admin/terms).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    let whereClause;
    if (user.role !== 'admin') {
      const memberships = await db
        .select({ schoolId: schoolMemberships.schoolId })
        .from(schoolMemberships)
        .where(eq(schoolMemberships.userId, user.id));
      const schoolIds = memberships.map((m) => m.schoolId);
      if (schoolIds.length === 0) {
        return NextResponse.json({ terms: [] });
      }
      whereClause = inArray(academicTerms.schoolId, schoolIds);
    }

    const terms = await db
      .select({
        id: academicTerms.id,
        schoolId: academicTerms.schoolId,
        name: academicTerms.name,
        startDate: academicTerms.startDate,
        endDate: academicTerms.endDate,
        isCurrent: academicTerms.isCurrent,
      })
      .from(academicTerms)
      .where(whereClause)
      .orderBy(desc(academicTerms.isCurrent), desc(academicTerms.startDate), desc(academicTerms.createdAt));

    return NextResponse.json({ terms });
  } catch (error) {
    logError(error, 'api/teacher/terms');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
