import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classes, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';
import { resolveClassLoginDestination } from '@/lib/classes/login-destination';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  try {
    const { classId } = await params;

    const condition = classId.length === 36
      ? eq(classes.id, classId)
      : sql`${classes.id}::text LIKE ${classId + '%'}`;

    const [matchedClass] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(condition)
      .limit(1);

    if (!matchedClass) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // An archived class created by promotion forwards to the active class at
    // the end of its lineage. Manually archived classes remain unavailable.
    const destination = await resolveClassLoginDestination(matchedClass.id);
    if (!destination) {
      return NextResponse.json(
        { error: 'Class is not active' },
        { status: 404 },
      );
    }

    // Get the destination class info with teacher name (public login boundary).
    const [classData] = await db
      .select({
        id: classes.id,
        name: classes.name,
        teacherFirstName: users.firstName,
        teacherLastName: users.lastName,
      })
      .from(classes)
      .innerJoin(users, eq(classes.teacherId, users.id))
      .where(eq(classes.id, destination.id))
      .limit(1);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      // Explicit canonical target for callers that arrived through a legacy
      // UUID prefix or an archived class in a promotion lineage.
      canonicalClassId: classData.id,
      class: {
        id: classData.id,
        name: classData.name,
        teacherName: `${classData.teacherFirstName} ${classData.teacherLastName}`,
      }
    }, { status: 200 });

  } catch (error) {
    logError(error, 'api/classes/[classId]/info');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
