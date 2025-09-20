import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { logError, createRequestContext } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      active: users.active,
      hasPassword: users.passwordHash,
    }).from(users);

    return NextResponse.json({
      success: true,
      count: allUsers.length,
      users: allUsers,
    });
  } catch (error) {
    logError(error, 'api/debug/users');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}