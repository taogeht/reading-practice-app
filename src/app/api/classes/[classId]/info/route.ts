import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classes, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { classId: string } }
) {
  try {
    const { classId } = params;

    // Get class info with teacher name (public endpoint for login)
    const classInfo = await db
      .select({
        id: classes.id,
        name: classes.name,
        teacherFirstName: users.firstName,
        teacherLastName: users.lastName,
        active: classes.active,
      })
      .from(classes)
      .innerJoin(users, eq(classes.teacherId, users.id))
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classInfo.length) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    const classData = classInfo[0];

    // Only return active classes for student login
    if (!classData.active) {
      return NextResponse.json(
        { error: 'Class is not active' },
        { status: 404 }
      );
    }

    return NextResponse.json({
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