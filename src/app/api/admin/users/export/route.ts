import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, schoolMemberships, schools } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

const primaryMembership = alias(schoolMemberships, 'primary_membership');

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await db
      .select({
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        schoolName: schools.name,
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
      .orderBy(users.lastName, users.firstName);

    const header = [
      'email',
      'firstName',
      'lastName',
      'role',
      'active',
      'schoolName',
      'createdAt',
    ];

    const body = rows
      .map((row) => [
        formatCsvValue(row.email ?? ''),
        formatCsvValue(row.firstName ?? ''),
        formatCsvValue(row.lastName ?? ''),
        formatCsvValue(row.role ?? ''),
        formatCsvValue(row.active ? 'true' : 'false'),
        formatCsvValue(row.schoolName ?? ''),
        formatCsvValue(row.createdAt?.toISOString() ?? ''),
      ].join(','))
      .join('\n');

    const csv = `${header.join(',')}\n${body}`;
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.user.export',
      resourceType: 'user',
      details: { count: rows.length },
      request,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logError(error, 'api/admin/users/export');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

