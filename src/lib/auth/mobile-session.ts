import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { MobileDevice, MobileUser } from '@starling-rise/contracts';
import { db } from '@/lib/db';
import { mobileRefreshSessions, session, users } from '@/lib/db/schema';
import type { User } from '@/lib/auth';

const ACCESS_DURATION_MS = 15 * 60_000;
const REFRESH_INACTIVITY_MS = 180 * 24 * 60 * 60_000;

export interface MobileSessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface MobileSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  user: MobileUser;
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mobileUser(user: User): MobileUser {
  if (user.role !== 'student') {
    throw new Error('Mobile learner sessions may only be issued to students');
  }
  return { ...user, role: 'student' };
}

function sessionValues(
  userId: string,
  metadata: MobileSessionMetadata,
  now: Date,
) {
  const accessToken = opaqueToken();
  const accessTokenExpiresAt = new Date(now.getTime() + ACCESS_DURATION_MS);
  return {
    accessToken,
    accessTokenExpiresAt,
    row: {
      id: accessToken,
      token: accessToken,
      userId,
      expiresAt: accessTokenExpiresAt,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      lastActivityAt: now,
      updatedAt: now,
    },
  };
}

export async function issueMobileSession(
  user: User,
  device: MobileDevice,
  metadata: MobileSessionMetadata = {},
): Promise<MobileSessionTokens> {
  const learner = mobileUser(user);
  const now = new Date();
  const refreshToken = opaqueToken();
  const access = sessionValues(learner.id, metadata, now);

  await db.transaction(async (tx) => {
    await tx.insert(session).values(access.row);
    await tx.insert(mobileRefreshSessions).values({
      userId: learner.id,
      accessSessionId: access.accessToken,
      tokenHash: hashRefreshToken(refreshToken),
      platform: device.platform,
      deviceName: device.deviceName,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_INACTIVITY_MS),
    });
  });

  return {
    accessToken: access.accessToken,
    refreshToken,
    accessTokenExpiresAt: access.accessTokenExpiresAt,
    user: learner,
  };
}

export async function rotateMobileSession(
  refreshToken: string,
  device: Partial<MobileDevice> = {},
  metadata: MobileSessionMetadata = {},
): Promise<MobileSessionTokens | null> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        refreshId: mobileRefreshSessions.id,
        userId: mobileRefreshSessions.userId,
        accessSessionId: mobileRefreshSessions.accessSessionId,
        platform: mobileRefreshSessions.platform,
        deviceName: mobileRefreshSessions.deviceName,
        expiresAt: mobileRefreshSessions.expiresAt,
        revokedAt: mobileRefreshSessions.revokedAt,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        active: users.active,
      })
      .from(mobileRefreshSessions)
      .innerJoin(users, eq(mobileRefreshSessions.userId, users.id))
      .where(eq(mobileRefreshSessions.tokenHash, hashRefreshToken(refreshToken)))
      .limit(1)
      .for('update');

    if (!current || current.revokedAt) return null;

    if (current.expiresAt <= now || !current.active || current.role !== 'student') {
      await tx
        .update(mobileRefreshSessions)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(eq(mobileRefreshSessions.id, current.refreshId));
      if (current.accessSessionId) {
        await tx.delete(session).where(eq(session.id, current.accessSessionId));
      }
      return null;
    }

    const nextRefreshToken = opaqueToken();
    const nextAccess = sessionValues(current.userId, metadata, now);

    await tx
      .update(mobileRefreshSessions)
      .set({ revokedAt: now, lastUsedAt: now, accessSessionId: null })
      .where(eq(mobileRefreshSessions.id, current.refreshId));
    if (current.accessSessionId) {
      await tx.delete(session).where(eq(session.id, current.accessSessionId));
    }
    await tx.insert(session).values(nextAccess.row);
    await tx.insert(mobileRefreshSessions).values({
      userId: current.userId,
      accessSessionId: nextAccess.accessToken,
      tokenHash: hashRefreshToken(nextRefreshToken),
      platform: device.platform ?? current.platform,
      deviceName: device.deviceName ?? current.deviceName ?? undefined,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_INACTIVITY_MS),
    });

    return {
      accessToken: nextAccess.accessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresAt: nextAccess.accessTokenExpiresAt,
      user: {
        id: current.userId,
        email: current.email,
        role: 'student',
        firstName: current.firstName,
        lastName: current.lastName,
      },
    };
  });
}

export async function revokeMobileSession(
  refreshToken: string,
  expectedUserId?: string,
): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const conditions = [
      eq(mobileRefreshSessions.tokenHash, hashRefreshToken(refreshToken)),
    ];
    if (expectedUserId) {
      conditions.push(eq(mobileRefreshSessions.userId, expectedUserId));
    }

    const [current] = await tx
      .select({
        id: mobileRefreshSessions.id,
        accessSessionId: mobileRefreshSessions.accessSessionId,
      })
      .from(mobileRefreshSessions)
      .where(and(...conditions))
      .limit(1)
      .for('update');

    if (!current) return false;
    await tx
      .update(mobileRefreshSessions)
      .set({ revokedAt: now, lastUsedAt: now, accessSessionId: null })
      .where(eq(mobileRefreshSessions.id, current.id));
    if (current.accessSessionId) {
      await tx.delete(session).where(eq(session.id, current.accessSessionId));
    }
    return true;
  });
}

export async function revokeMobileSessionsForUser(userId: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const activeSessions = await tx
      .select({ accessSessionId: mobileRefreshSessions.accessSessionId })
      .from(mobileRefreshSessions)
      .where(
        and(
          eq(mobileRefreshSessions.userId, userId),
          isNull(mobileRefreshSessions.revokedAt),
        ),
      );

    await tx
      .update(mobileRefreshSessions)
      .set({ revokedAt: now, lastUsedAt: now, accessSessionId: null })
      .where(
        and(
          eq(mobileRefreshSessions.userId, userId),
          isNull(mobileRefreshSessions.revokedAt),
        ),
      );

    const accessSessionIds = activeSessions
      .map((row) => row.accessSessionId)
      .filter((value): value is string => Boolean(value));
    if (accessSessionIds.length > 0) {
      await tx.delete(session).where(inArray(session.id, accessSessionIds));
    }
  });
}
