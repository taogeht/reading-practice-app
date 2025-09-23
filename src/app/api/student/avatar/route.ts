import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { students } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { AVATARS } from '@/components/auth/visual-password-options';

export const runtime = 'nodejs';

const ALLOWED_AVATARS = AVATARS.map((avatar) => avatar.emoji);

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { avatar } = await request.json();

    if (!avatar || typeof avatar !== 'string' || !ALLOWED_AVATARS.includes(avatar)) {
      return NextResponse.json({ error: 'Invalid avatar selection' }, { status: 400 });
    }

    await db
      .update(students)
      .set({ avatarUrl: avatar })
      .where(eq(students.id, user.id));

    return NextResponse.json({ success: true, avatar });
  } catch (error) {
    logError(error, 'api/student/avatar');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ avatars: AVATARS });
}
