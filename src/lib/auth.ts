import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
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

export async function createSession(userId: string): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(session).values({
    id: sessionId,
    token: sessionId,
    userId: userId,
    expiresAt: expiresAt,
  });

  return sessionId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(session).where(eq(session.id, sessionId));
}

export async function cleanupExpiredSessions(): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, new Date()));
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

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    if (!cookieStore) {
      console.log('No cookie store available');
      return null;
    }
    const sessionId = cookieStore.get(COOKIE_NAME)?.value;

    if (!sessionId) {
      return null;
    }

    // Find valid session
    const sessionData = await db.query.session.findFirst({
      where: eq(session.id, sessionId),
      with: {
        user: true,
      }
    });

    if (!sessionData || sessionData.expiresAt < new Date()) {
      // Clean up expired session
      if (sessionData) {
        await deleteSession(sessionId);
      }
      return null;
    }

    const user = sessionData.user;
    if (!user || !user.active) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  } catch (error) {
    logError(error, 'getCurrentUser');
    return null;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7, // 7 days
  path: '/',
};

export { COOKIE_NAME };
