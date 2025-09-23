import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET - Fetch all users
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');
    const activeFilter = searchParams.get('active');

    if (roleFilter && !['student', 'teacher', 'admin'].includes(roleFilter)) {
      return NextResponse.json(
        { error: 'Invalid role filter' },
        { status: 400 }
      );
    }

    if (activeFilter && !['true', 'false'].includes(activeFilter.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid active filter. Use true or false.' },
        { status: 400 }
      );
    }

    const conditions: any[] = [];

    if (roleFilter) {
      conditions.push(eq(users.role, roleFilter as 'student' | 'teacher' | 'admin'));
    }

    if (activeFilter) {
      const isActive = activeFilter.toLowerCase() === 'true';
      conditions.push(eq(users.active, isActive));
    }

    let query = db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users);

    if (conditions.length) {
      query = query.where(and(...conditions));
    }

    const allUsers = await query.orderBy(users.lastName, users.firstName);

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
