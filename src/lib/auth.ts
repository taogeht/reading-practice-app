import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { db } from './db';
import { users, session } from './db/schema';
import { eq, lt } from 'drizzle-orm';
import { logError } from './logger';

const COOKIE_NAME = 'session-id';

export interface User {
  id: string;
  email: string | null;
  role: 'student' | 'teacher' | 'admin';
  firstName: string;
  lastName: string;
}

export interface CurrentSession {
  sessionId: string;
  source: 'cookie' | 'bearer';
  user: User;
}

export interface CreateSessionOptions {
  durationMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateSessionId(): string {
  const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObj?.randomUUID) {
    // Remove dashes to keep cookie-friendly format
    return cryptoObj.randomUUID().replace(/-/g, '');
  }

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for environments without Web Crypto support
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {},
): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(
    Date.now() + (options.durationMs ?? 7 * 24 * 60 * 60 * 1000),
  );

  await db.insert(session).values({
    id: sessionId,
    token: sessionId,
    userId: userId,
    expiresAt: expiresAt,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return sessionId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(session).where(eq(session.id, sessionId));
}

export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, new Date()));
}

export function generateLoginToken(): string {
  const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, 32);
}

export async function loginWithToken(token: string): Promise<User | null> {
  if (!token || token.length < 16) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.loginToken, token),
  });

  if (!user || !user.active || user.role !== 'student') {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

export function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+([^\s]{16,255})$/i);
  return match?.[1] ?? null;
}

async function resolveSession(
  sessionId: string,
  source: CurrentSession['source'],
): Promise<CurrentSession | null> {
  const sessionData = await db.query.session.findFirst({
    where: eq(session.id, sessionId),
    with: {
      user: true,
    },
  });

  if (!sessionData || sessionData.expiresAt < new Date()) {
    if (sessionData) await deleteSession(sessionId);
    return null;
  }

  const user = sessionData.user;
  if (!user || !user.active) return null;

  return {
    sessionId,
    source,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
}

/** Resolve either the existing web cookie or a native Bearer access token. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  try {
    const cookieStore = await cookies();
    const cookieSessionId = cookieStore?.get(COOKIE_NAME)?.value;
    if (cookieSessionId) {
      const cookieSession = await resolveSession(cookieSessionId, 'cookie');
      if (cookieSession) return cookieSession;
    }

    const headerStore = await headers();
    const bearerSessionId = parseBearerToken(headerStore.get('authorization'));
    if (!bearerSessionId || bearerSessionId === cookieSessionId) return null;
    return resolveSession(bearerSessionId, 'bearer');
  } catch (error) {
    // During static generation (build time), cookies() throws an error
    // This is expected behavior - silently return null instead of logging
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('cookies') || errorMessage.includes('Dynamic server usage')) {
      return null;
    }
    logError(error, 'getCurrentSession');
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  return (await getCurrentSession())?.user ?? null;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
};

export { COOKIE_NAME };
