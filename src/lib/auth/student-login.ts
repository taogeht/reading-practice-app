import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classes, classEnrollments, students, users } from '@/lib/db/schema';
import { loginWithToken, type User } from '@/lib/auth';
import {
  checkRateLimit,
  clearRateLimit,
  recordFailure,
  type RateLimitPolicy,
} from '@/lib/rate-limit';

const VISUAL_PER_STUDENT: RateLimitPolicy = {
  maxFailures: 8,
  windowMs: 10 * 60_000,
  lockMs: 5 * 60_000,
};
const VISUAL_PER_IP: RateLimitPolicy = {
  maxFailures: 50,
  windowMs: 10 * 60_000,
  lockMs: 5 * 60_000,
};
const TOKEN_PER_IP: RateLimitPolicy = {
  maxFailures: 80,
  windowMs: 10 * 60_000,
  lockMs: 10 * 60_000,
};

export type StudentLoginFailureCode =
  | 'BAD_REQUEST'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'RATE_LIMITED';

export type StudentLoginResult =
  | { ok: true; user: User }
  | {
      ok: false;
      code: StudentLoginFailureCode;
      message: string;
      status: 400 | 401 | 403 | 404 | 429;
      retryAfterSeconds?: number;
    };

export interface VisualStudentLoginInput {
  studentId: string;
  classId: string;
  visualPassword: string;
  ipAddress: string;
}

export interface TokenStudentLoginInput {
  loginToken: string;
  ipAddress: string;
}

function rateLimited(retryAfterSeconds: number): StudentLoginResult {
  return {
    ok: false,
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait and try again.',
    status: 429,
    retryAfterSeconds,
  };
}

function visualAnswer(
  passwordData: unknown,
  type: string,
): string {
  if (!passwordData || typeof passwordData !== 'object') return '';
  const data = passwordData as Record<string, unknown>;
  if (type === 'animal' && typeof data.animal === 'string') return data.animal;
  if (type === 'object' && typeof data.object === 'string') return data.object;
  return '';
}

export async function authenticateStudentVisualPassword(
  input: VisualStudentLoginInput,
): Promise<StudentLoginResult> {
  if (!input.studentId || !input.classId || !input.visualPassword) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'Student, class, and visual password are required.',
      status: 400,
    };
  }

  const studentKey = `login:student:${input.studentId}`;
  const ipKey = `login:visual:ip:${input.ipAddress}`;
  const [studentLimit, ipLimit] = await Promise.all([
    checkRateLimit(studentKey, VISUAL_PER_STUDENT),
    checkRateLimit(ipKey, VISUAL_PER_IP),
  ]);

  if (studentLimit.blocked || ipLimit.blocked) {
    return rateLimited(
      Math.max(studentLimit.retryAfterSec, ipLimit.retryAfterSec),
    );
  }

  const [student] = await db
    .select({
      id: students.id,
      visualPasswordType: students.visualPasswordType,
      visualPasswordData: students.visualPasswordData,
      email: users.email,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      active: users.active,
    })
    .from(students)
    .innerJoin(users, eq(students.id, users.id))
    .where(eq(students.id, input.studentId))
    .limit(1);

  if (!student) {
    await recordFailure(ipKey, VISUAL_PER_IP);
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Student not found.',
      status: 404,
    };
  }

  if (!student.active || student.role !== 'student') {
    await recordFailure(ipKey, VISUAL_PER_IP);
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Student account is inactive.',
      status: 403,
    };
  }

  const [enrollment] = await db
    .select({ classActive: classes.active })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(
      and(
        eq(classEnrollments.studentId, input.studentId),
        eq(classEnrollments.classId, input.classId),
      ),
    )
    .limit(1);

  if (!enrollment) {
    await recordFailure(ipKey, VISUAL_PER_IP);
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Student is not enrolled in this class.',
      status: 403,
    };
  }

  if (!enrollment.classActive) {
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Class is not active.',
      status: 403,
    };
  }

  const expected = visualAnswer(
    student.visualPasswordData,
    student.visualPasswordType ?? '',
  );
  if (!expected || input.visualPassword !== expected) {
    await Promise.all([
      recordFailure(studentKey, VISUAL_PER_STUDENT),
      recordFailure(ipKey, VISUAL_PER_IP),
    ]);
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid visual password.',
      status: 401,
    };
  }

  await clearRateLimit(studentKey);
  return {
    ok: true,
    user: {
      id: student.id,
      email: student.email,
      role: 'student',
      firstName: student.firstName,
      lastName: student.lastName,
    },
  };
}

export async function authenticateStudentLoginToken(
  input: TokenStudentLoginInput,
): Promise<StudentLoginResult> {
  if (!input.loginToken || input.loginToken.length < 16) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'A valid login token is required.',
      status: 400,
    };
  }

  const ipKey = `login:token:ip:${input.ipAddress}`;
  const ipLimit = await checkRateLimit(ipKey, TOKEN_PER_IP);

  if (ipLimit.blocked) {
    return rateLimited(ipLimit.retryAfterSec);
  }

  const user = await loginWithToken(input.loginToken);
  if (!user) {
    // Do not create a durable bucket for an attacker-controlled random token;
    // that would let unauthenticated traffic grow the throttle table without
    // bound. Login tokens are 128-bit credentials, so the shared IP backstop is
    // the useful brute-force control here.
    await recordFailure(ipKey, TOKEN_PER_IP);
    return {
      ok: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid login token.',
      status: 401,
    };
  }

  return { ok: true, user };
}

export function requestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
