import { z } from 'zod';

export const mobilePlatformSchema = z.enum(['ios', 'android']);

export const mobileDeviceSchema = z.object({
  platform: mobilePlatformSchema,
  deviceName: z.string().trim().min(1).max(100).optional(),
});

export const mobileUserSchema = z.object({
  id: z.uuid(),
  email: z.string().email().nullable(),
  role: z.literal('student'),
  firstName: z.string(),
  lastName: z.string(),
});

export const mobileQrLoginRequestSchema = mobileDeviceSchema.extend({
  loginToken: z.string().trim().min(16).max(64),
});

export const mobileVisualLoginRequestSchema = mobileDeviceSchema.extend({
  classId: z.uuid(),
  studentId: z.uuid(),
  visualPassword: z.string().min(1).max(100),
});

export const mobileRefreshRequestSchema = mobileDeviceSchema.partial().extend({
  refreshToken: z.string().min(32).max(255),
});

export const mobileLogoutRequestSchema = z.object({
  refreshToken: z.string().min(32).max(255),
});

export const mobileAuthResponseSchema = z.object({
  accessToken: z.string().min(16),
  refreshToken: z.string().min(32),
  accessTokenExpiresAt: z.iso.datetime(),
  user: mobileUserSchema,
});

export const mobileMeResponseSchema = z.object({
  user: mobileUserSchema,
});

export const mobileClassResolveResponseSchema = z.object({
  canonicalClassId: z.uuid(),
  forwarded: z.boolean(),
  class: z.object({
    id: z.uuid(),
    name: z.string(),
    teacherName: z.string(),
  }),
});

export const studentRosterEntrySchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

export const studentRosterResponseSchema = z.object({
  students: z.array(studentRosterEntrySchema),
});

export const visualPasswordStudentSchema = studentRosterEntrySchema.extend({
  visualPasswordType: z.enum(['animal', 'object']),
});

export const visualPasswordStudentResponseSchema = z.object({
  student: visualPasswordStudentSchema,
});

export const mobileErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'INVALID_CREDENTIALS',
  'NOT_AUTHENTICATED',
  'NOT_FOUND',
  'RATE_LIMITED',
  'SESSION_EXPIRED',
  'INTERNAL_ERROR',
]);

export const mobileErrorResponseSchema = z.object({
  error: z.object({
    code: mobileErrorCodeSchema,
    message: z.string(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});

export type MobilePlatform = z.infer<typeof mobilePlatformSchema>;
export type MobileDevice = z.infer<typeof mobileDeviceSchema>;
export type MobileUser = z.infer<typeof mobileUserSchema>;
export type MobileQrLoginRequest = z.infer<typeof mobileQrLoginRequestSchema>;
export type MobileVisualLoginRequest = z.infer<typeof mobileVisualLoginRequestSchema>;
export type MobileRefreshRequest = z.infer<typeof mobileRefreshRequestSchema>;
export type MobileLogoutRequest = z.infer<typeof mobileLogoutRequestSchema>;
export type MobileAuthResponse = z.infer<typeof mobileAuthResponseSchema>;
export type MobileMeResponse = z.infer<typeof mobileMeResponseSchema>;
export type MobileClassResolveResponse = z.infer<typeof mobileClassResolveResponseSchema>;
export type StudentRosterEntry = z.infer<typeof studentRosterEntrySchema>;
export type StudentRosterResponse = z.infer<typeof studentRosterResponseSchema>;
export type VisualPasswordStudent = z.infer<typeof visualPasswordStudentSchema>;
export type MobileErrorCode = z.infer<typeof mobileErrorCodeSchema>;
export type MobileErrorResponse = z.infer<typeof mobileErrorResponseSchema>;
