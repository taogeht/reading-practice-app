import { z } from 'zod';
import {
  mobileDashboardAssignmentSchema,
  mobileDashboardAssignmentStatusSchema,
} from './mobile-dashboard';

export const mobileAssignmentListResponseSchema = z.object({
  assignments: z.array(mobileDashboardAssignmentSchema),
}).strict();

export const mobileStoryAudioSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  durationSeconds: z.number().nonnegative().nullable(),
  voiceId: z.string().nullable(),
  label: z.string().nullable(),
}).strict();

export const mobileAssignmentDetailSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  className: z.string(),
  dueAt: z.iso.datetime().nullable(),
  status: mobileDashboardAssignmentStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  maxRecordingSeconds: z.number().int().positive(),
  hasTeacherFeedback: z.boolean(),
  story: z.object({
    id: z.uuid(),
    title: z.string(),
    content: z.string(),
    readingLevel: z.string().nullable(),
    wordCount: z.number().int().nonnegative().nullable(),
    estimatedReadingTimeMinutes: z.number().int().nonnegative().nullable(),
    author: z.string().nullable(),
    genre: z.string().nullable(),
    ttsAudio: z.array(mobileStoryAudioSchema),
  }).strict(),
}).strict();

export const mobileAssignmentDetailResponseSchema = z.object({
  assignment: mobileAssignmentDetailSchema,
}).strict();

export type MobileAssignmentListResponse = z.infer<
  typeof mobileAssignmentListResponseSchema
>;
export type MobileStoryAudio = z.infer<typeof mobileStoryAudioSchema>;
export type MobileAssignmentDetail = z.infer<typeof mobileAssignmentDetailSchema>;
export type MobileAssignmentDetailResponse = z.infer<
  typeof mobileAssignmentDetailResponseSchema
>;
