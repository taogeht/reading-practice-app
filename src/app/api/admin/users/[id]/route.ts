import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

// GET - Get single user
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = params.id;
    const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove password hash from response
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
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = params.id;
    const body = await request.json();
    const { email, password, role, firstName, lastName, active } = body;

    // Check if user exists
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (email !== undefined) {
      // Check if new email is already taken by another user
      const [emailExists] = await db.select().from(users)
        .where(eq(users.email, email))
        .limit(1);
      
      if (emailExists && emailExists.id !== userId) {
        return NextResponse.json(
          { error: 'Email already in use by another user' },
          { status: 400 }
        );
      }
      updateData.email = email;
    }

    if (role !== undefined) {
      if (!['student', 'teacher', 'admin'].includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (active !== undefined) updateData.active = active;

    // Hash password if provided
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    // Update user
    const [updatedUser] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    // Remove password hash from response
    const { passwordHash: _, ...userResponse } = updatedUser;
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
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = params.id;

    // Don't allow admin to delete themselves
    if (user.id === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Check if user exists
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete user (cascade will handle related records)
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ message: 'User deleted successfully' });

  } catch (error) {
    logError(error, 'api/admin/users/[id]');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}