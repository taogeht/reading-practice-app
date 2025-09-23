import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, schoolMemberships, schools, teachers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { alias } from 'drizzle-orm/pg-core';

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

    const primaryMembership = alias(schoolMemberships, 'primary_membership');

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
        primarySchoolId: primaryMembership.schoolId,
        primarySchoolName: schools.name,
      })
      .from(users)
      .leftJoin(
        primaryMembership,
        and(
          eq(primaryMembership.userId, users.id),
          eq(primaryMembership.isPrimary, true)
        )
      )
      .leftJoin(schools, eq(primaryMembership.schoolId, schools.id));

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
    const { email, password, role, firstName, lastName, schoolId } = body;

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

    let resolvedSchoolId: string | null = null;
    if (role === 'teacher') {
      resolvedSchoolId = typeof schoolId === 'string' && schoolId.trim().length > 0 ? schoolId.trim() : null;

      if (!resolvedSchoolId) {
        return NextResponse.json(
          { error: 'Teachers must be assigned to a school' },
          { status: 400 }
        );
      }

      const schoolExists = await db
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, resolvedSchoolId))
        .limit(1);

      if (!schoolExists.length) {
        return NextResponse.json(
          { error: 'Assigned school not found' },
          { status: 404 }
        );
      }
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

    if (role === 'teacher') {
      await db
        .insert(teachers)
        .values({ id: newUser.id })
        .onConflictDoNothing();

      if (resolvedSchoolId) {
        await db
          .delete(schoolMemberships)
          .where(eq(schoolMemberships.userId, newUser.id));

        await db.insert(schoolMemberships).values({
          userId: newUser.id,
          schoolId: resolvedSchoolId,
          isPrimary: true,
        });
      }
    }

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
