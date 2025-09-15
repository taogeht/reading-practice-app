import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { students, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/students - Fetch all students for login selection
export async function GET(request: NextRequest) {
  try {
    // Fetch all students with their user information
    const studentData = await db
      .select({
        id: students.id,
        firstName: users.firstName,
        lastName: users.lastName,
        visualPasswordType: students.visualPasswordType,
        visualPasswordData: students.visualPasswordData,
      })
      .from(students)
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(users.active, true));

    return NextResponse.json({
      students: studentData,
    });

  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}