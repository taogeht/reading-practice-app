import { NextRequest } from 'next/server';
import { db } from './db';
import { auditLogs } from './db/schema';

type AuditDetails = Record<string, unknown> | null | undefined;

export interface AuditEventInput {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: AuditDetails;
  request?: NextRequest;
}

const MAX_DETAIL_LENGTH = 2000;

function coerceDetails(details: AuditDetails): Record<string, unknown> | null {
  if (!details) {
    return null;
  }

  try {
    const payload = typeof details === 'object' ? details : { value: details };
    const json = JSON.stringify(payload);
    if (json.length > MAX_DETAIL_LENGTH) {
      return { truncated: true };
    }
    return payload;
  } catch (error) {
    return { invalid: true };
  }
}

export async function recordAuditEvent({
  userId,
  action,
  resourceType,
  resourceId,
  details,
  request,
}: AuditEventInput): Promise<void> {
  try {
    const ipAddress = request?.headers.get('x-forwarded-for')
      ?? request?.headers.get('remote-addr')
      ?? null;
    const userAgent = request?.headers.get('user-agent') ?? null;

    await db.insert(auditLogs).values({
      userId: userId ?? null,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      details: coerceDetails(details),
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });
  } catch (error) {
    // Intentionally swallow audit failures to avoid blocking primary flow.
    console.error('Failed to record audit event', error);
  }
}

