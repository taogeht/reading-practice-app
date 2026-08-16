import { z } from 'zod';

export const mobileDashboardAssignmentStatusSchema = z.enum([
  'pending',
  'submitted',
  'completed',
]);

export const mobileDashboardAssignmentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  storyTitle: z.string(),
  className: z.string(),
  dueAt: z.iso.datetime().nullable(),
  status: mobileDashboardAssignmentStatusSchema,
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  hasTeacherFeedback: z.boolean(),
}).strict();

export const mobileDashboardResponseSchema = z.object({
  student: z.object({
    gradeLevel: z.number().int().nullable(),
    readingLevel: z.string().nullable(),
  }).strict(),
  nextAssignments: z.array(mobileDashboardAssignmentSchema).max(5),
  summary: z.object({
    pendingAssignments: z.number().int().nonnegative(),
    submittedAssignments: z.number().int().nonnegative(),
    completedAssignments: z.number().int().nonnegative(),
    activeSpellingLists: z.number().int().nonnegative(),
    activeSpellingWords: z.number().int().nonnegative(),
    totalXp: z.number().int().nonnegative(),
    currentLevel: z.number().int().positive(),
    currentStreakDays: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type MobileDashboardAssignmentStatus = z.infer<
  typeof mobileDashboardAssignmentStatusSchema
>;
export type MobileDashboardAssignment = z.infer<typeof mobileDashboardAssignmentSchema>;
export type MobileDashboardResponse = z.infer<typeof mobileDashboardResponseSchema>;
