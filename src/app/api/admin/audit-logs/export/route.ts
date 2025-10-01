import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLogs, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import {
  buildWhereClause,
  parseFilters,
  AuditLogFilters,
} from '../route';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildExportLimit(filters: AuditLogFilters, max = 2000): number {
  const rawLimit = filters.limit ?? 1000;
  return Math.min(Math.max(rawLimit, 1), max);
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filters = parseFilters(request);
    const exportLimit = buildExportLimit(filters);
    const whereClause = buildWhereClause({ ...filters, limit: exportLimit });

    let query = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id));

    if (whereClause) {
      query = query.where(whereClause);
    }

    const rows = await query
      .orderBy(desc(auditLogs.createdAt))
      .limit(exportLimit);

    const header = [
      'id',
      'action',
      'resourceType',
      'resourceId',
      'userName',
      'userEmail',
      'createdAt',
      'ipAddress',
      'details',
    ];

    const csvBody = rows
      .map((row) => [
        formatCsvValue(row.id),
        formatCsvValue(row.action),
        formatCsvValue(row.resourceType),
        formatCsvValue(row.resourceId ?? ''),
        formatCsvValue(
          row.userId
            ? [row.userFirstName, row.userLastName].filter(Boolean).join(' ') || 'User'
            : '',
        ),
        formatCsvValue(row.userEmail ?? ''),
        formatCsvValue(row.createdAt?.toISOString() ?? ''),
        formatCsvValue(row.ipAddress ?? ''),
        formatCsvValue(row.details ?? {}),
      ].join(','))
      .join('\n');

    const csv = `${header.join(',')}\n${csvBody}`;
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.audit_logs.export',
      resourceType: 'audit_logs',
      details: {
        rows: rows.length,
      },
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
    logError(error, 'api/admin/audit-logs/export');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

