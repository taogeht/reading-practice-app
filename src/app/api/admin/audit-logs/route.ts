import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditLogs, users } from '@/lib/db/schema';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export interface AuditLogFilters {
  action?: string | null;
  resourceType?: string | null;
  userId?: string | null;
  search?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  limit: number;
  page: number;
}

export function parseFilters(request: NextRequest): AuditLogFilters {
  const { searchParams } = new URL(request.url);

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get('limit') ?? '25', 10) || 25, 1),
    100,
  );
  const page = Math.max(Number.parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);

  const timeframeDaysParam = searchParams.get('timeframeDays');
  const timeframeDays = timeframeDaysParam
    ? Number.parseInt(timeframeDaysParam, 10)
    : 30;

  let startDate: Date | null = null;
  if (timeframeDays && Number.isFinite(timeframeDays) && timeframeDays > 0) {
    startDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);
  }

  const startParam = searchParams.get('startDate');
  if (startParam) {
    const parsed = new Date(startParam);
    if (!Number.isNaN(parsed.getTime())) {
      startDate = parsed;
    }
  }

  let endDate: Date | null = null;
  const endParam = searchParams.get('endDate');
  if (endParam) {
    const parsed = new Date(endParam);
    if (!Number.isNaN(parsed.getTime())) {
      endDate = parsed;
    }
  }

  return {
    action: searchParams.get('action'),
    resourceType: searchParams.get('resourceType'),
    userId: searchParams.get('userId'),
    search: searchParams.get('search'),
    startDate,
    endDate,
    limit,
    page,
  };
}

export function buildWhereClause(filters: AuditLogFilters) {
  const conditions: any[] = [];

  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }

  if (filters.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  }

  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }

  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }

  if (filters.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      sql`
        lower(${auditLogs.details}::text) LIKE ${term}
        OR lower(${auditLogs.action}) LIKE ${term}
        OR lower(${auditLogs.resourceType}) LIKE ${term}
      `,
    );
  }

  if (conditions.length === 0) {
    return null;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filters = parseFilters(request);
    const whereClause = buildWhereClause(filters);

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

    const offset = (filters.page - 1) * filters.limit;

    const logs = await query
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.limit)
      .offset(offset);

    let countQuery = db.select({ total: count() }).from(auditLogs);
    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }
    const [{ total }] = await countQuery;

    const totalItems = Number(total ?? 0);
    const totalPages = Math.max(Math.ceil(totalItems / filters.limit), 1);

    const [actionsResult, resourceResult] = await Promise.all([
      db
        .selectDistinct({ action: auditLogs.action })
        .from(auditLogs)
        .orderBy(auditLogs.action),
      db
        .selectDistinct({ resourceType: auditLogs.resourceType })
        .from(auditLogs)
        .orderBy(auditLogs.resourceType),
    ]);

    const responseLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt?.toISOString() ?? null,
      user: log.userId
        ? {
            id: log.userId,
            name: [log.userFirstName, log.userLastName].filter(Boolean).join(' ') || 'User',
            email: log.userEmail,
          }
        : null,
    }));

    return NextResponse.json({
      logs: responseLogs,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        totalItems,
        totalPages,
      },
      filters: {
        availableActions: actionsResult.map((row) => row.action).filter(Boolean),
        availableResourceTypes: resourceResult
          .map((row) => row.resourceType)
          .filter(Boolean),
      },
    });
  } catch (error) {
    logError(error, 'api/admin/audit-logs');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
