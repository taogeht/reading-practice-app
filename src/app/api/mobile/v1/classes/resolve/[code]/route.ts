import { NextResponse } from 'next/server';
import type { MobileClassResolveResponse } from '@starling-rise/contracts';
import { eq } from 'drizzle-orm';
import { resolveClassLoginCode } from '@/lib/classes/login-code';
import { db } from '@/lib/db';
import { classes, users } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const destination = await resolveClassLoginCode(code);
    if (!destination) {
      return mobileError('NOT_FOUND', 'Class not found.', 404);
    }

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
      return mobileError('NOT_FOUND', 'Class not found.', 404);
    }

    return NextResponse.json<MobileClassResolveResponse>({
      canonicalClassId: classData.id,
      forwarded: destination.forwarded,
      class: {
        id: classData.id,
        name: classData.name,
        teacherName: `${classData.teacherFirstName} ${classData.teacherLastName}`,
      },
    });
  } catch (error) {
    logError(error, 'api/mobile/v1/classes/resolve/[code]');
    return mobileError('INTERNAL_ERROR', 'Unable to resolve this class.', 500);
  }
}
