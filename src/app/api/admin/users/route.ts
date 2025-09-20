import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

// GET - Fetch all users
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allUsers = await db.select().from(users);

    return NextResponse.json({ users: allUsers });

  } catch (error) {
    logError(error, 'api/admin/users');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new user
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email, password, role, firstName, lastName } = body;

    // Validate required fields
    if (!email || !password || !role || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate role
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      role,
      firstName,
      lastName,
      active: true,
    }).returning();

    // Remove password hash from response
    const { passwordHash: _, ...userResponse } = newUser;

    return NextResponse.json({ user: userResponse }, { status: 201 });

  } catch (error) {
    logError(error, 'api/admin/users');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
