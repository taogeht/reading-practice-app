import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { schools } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allSchools = await db.select().from(schools).orderBy(schools.name);

    return NextResponse.json({ schools: allSchools });

  } catch (error) {
    logError(error, 'api/admin/schools');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const newSchool = await db.insert(schools).values({
      name,
      district: district || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
    }).returning();

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.school.create',
      resourceType: 'school',
      resourceId: newSchool[0].id,
      details: {
        name,
        district: district || null,
        city: city || null,
        state: state || null,
      },
      request,
    });

    return NextResponse.json({ school: newSchool[0] }, { status: 201 });
  } catch (error) {
    logError(error, 'api/admin/schools');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
