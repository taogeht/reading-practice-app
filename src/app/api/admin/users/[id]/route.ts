import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  users,
  schoolMemberships,
  schools,
  teachers,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { alias } from 'drizzle-orm/pg-core';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

const primaryMembership = alias(schoolMemberships, 'primary_membership');

// GET - Get single user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: userId } = await params;

    const [targetUser] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        passwordHash: users.passwordHash,
        primarySchoolId: primaryMembership.schoolId,
        primarySchoolName: schools.name,
      })
      .from(users)
      .leftJoin(
        primaryMembership,
        and(
          eq(primaryMembership.userId, users.id),
          eq(primaryMembership.isPrimary, true),
        ),
      )
      .leftJoin(schools, eq(primaryMembership.schoolId, schools.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { passwordHash: _, ...userResponse } = targetUser;
    return NextResponse.json({ user: userResponse });
  } catch (error) {
    logError(error, 'api/admin/users/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: userId } = await params;
    const body = await request.json();
    const { email, password, role, firstName, lastName, active, schoolId } = body;

    const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [existingPrimarySchool] = await db
      .select({ schoolId: schoolMemberships.schoolId })
      .from(schoolMemberships)
      .where(
        and(
          eq(schoolMemberships.userId, userId),
          eq(schoolMemberships.isPrimary, true),
        ),
      )
      .limit(1);

    const nextRole = (role ?? existingUser.role) as 'student' | 'teacher' | 'admin';

    if (!['student', 'teacher', 'admin'].includes(nextRole)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    let resolvedSchoolId: string | null = null;
    if (nextRole === 'teacher') {
      const providedSchoolId = typeof schoolId === 'string' && schoolId.trim().length > 0
        ? schoolId.trim()
        : null;

      resolvedSchoolId = providedSchoolId ?? existingPrimarySchool?.schoolId ?? null;

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

    if (email !== undefined) {
      const [emailExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (emailExists && emailExists.id !== userId) {
        return NextResponse.json(
          { error: 'Email already in use by another user' },
          { status: 400 }
        );
      }
    }

    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = nextRole;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (active !== undefined) updateData.active = active;
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (nextRole === 'teacher') {
      await db
        .insert(teachers)
        .values({ id: userId })
        .onConflictDoNothing();

      if (resolvedSchoolId) {
        await db
          .delete(schoolMemberships)
          .where(eq(schoolMemberships.userId, userId));

        await db.insert(schoolMemberships).values({
          userId,
          schoolId: resolvedSchoolId,
          isPrimary: true,
        });
      }
    } else if (existingUser.role === 'teacher') {
      await db
        .delete(schoolMemberships)
        .where(eq(schoolMemberships.userId, userId));
    }

    const { passwordHash: _, ...userResponse } = updatedUser;

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.user.update',
      resourceType: 'user',
      resourceId: userId,
      details: {
        email,
        role: nextRole,
        firstName,
        lastName,
        active,
        schoolId: resolvedSchoolId ?? null,
        passwordChanged: Boolean(password),
      },
      request,
    });

    return NextResponse.json({ user: userResponse });
  } catch (error) {
    logError(error, 'api/admin/users/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: userId } = await params;

    if (currentUser.id === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await db.delete(users).where(eq(users.id, userId));

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.user.delete',
      resourceType: 'user',
      resourceId: userId,
      details: {
        email: existingUser.email,
        role: existingUser.role,
      },
      request,
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    logError(error, 'api/admin/users/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
