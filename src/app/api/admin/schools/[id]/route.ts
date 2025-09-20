import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { schools } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const school = await db.select().from(schools).where(eq(schools.id, params.id)).limit(1);
    
    if (school.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ school: school[0] });
  } catch (error) {
    logError(error, 'api/admin/schools/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, district, address, city, state, zipCode } = body;

    if (!name) {
      return NextResponse.json({ error: 'School name is required' }, { status: 400 });
    }

    const updatedSchool = await db.update(schools)
      .set({
        name,
        district: district || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        updatedAt: new Date(),
      })
      .where(eq(schools.id, params.id))
      .returning();

    if (updatedSchool.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ school: updatedSchool[0] });
  } catch (error) {
    logError(error, 'api/admin/schools/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deletedSchool = await db.delete(schools)
      .where(eq(schools.id, params.id))
      .returning();

    if (deletedSchool.length === 0) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'School deleted successfully' });
  } catch (error) {
    logError(error, 'api/admin/schools/[id]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}