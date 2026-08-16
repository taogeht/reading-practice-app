import { NextResponse } from 'next/server';
import {
  mobileDashboardResponseSchema,
  type MobileDashboardResponse,
} from '@starling-rise/contracts';
import { and, countDistinct, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classes,
  classEnrollments,
  spellingLists,
  spellingWords,
  studentProgression,
  students,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { listActiveMobileAssignments } from '@/lib/mobile/assignments';
import { mobileError } from '@/lib/mobile/http';

export const runtime = 'nodejs';

const NEXT_ASSIGNMENT_LIMIT = 5;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return mobileError('NOT_AUTHENTICATED', 'Not authenticated.', 401);
    }

    const [studentRows, assignmentRows, spellingRows, progressionRows] =
      await Promise.all([
        db
          .select({
            gradeLevel: students.gradeLevel,
            readingLevel: students.readingLevel,
          })
          .from(students)
          .where(eq(students.id, user.id))
          .limit(1),
        listActiveMobileAssignments(user.id),
        db
          .select({
            listCount: countDistinct(spellingLists.id),
            wordCount: countDistinct(spellingWords.id),
          })
          .from(spellingLists)
          .innerJoin(classes, eq(spellingLists.classId, classes.id))
          .innerJoin(
            classEnrollments,
            and(
              eq(classEnrollments.classId, classes.id),
              eq(classEnrollments.studentId, user.id),
            ),
          )
          .leftJoin(spellingWords, eq(spellingWords.spellingListId, spellingLists.id))
          .where(and(eq(spellingLists.active, true), eq(classes.active, true))),
        db
          .select({
            totalXp: studentProgression.totalXp,
            currentLevel: studentProgression.currentLevel,
            currentStreakDays: studentProgression.currentStreakDays,
          })
          .from(studentProgression)
          .where(eq(studentProgression.studentId, user.id))
          .limit(1),
      ]);

    const student = studentRows[0];
    if (!student) {
      return mobileError('NOT_FOUND', 'Student record not found.', 404);
    }

    const spelling = spellingRows[0];
    const progression = progressionRows[0];
    const response: MobileDashboardResponse = {
      student,
      nextAssignments: assignmentRows.slice(0, NEXT_ASSIGNMENT_LIMIT),
      summary: {
        pendingAssignments: assignmentRows.filter(
          (assignment) => assignment.status === 'pending',
        ).length,
        submittedAssignments: assignmentRows.filter(
          (assignment) => assignment.status === 'submitted',
        ).length,
        completedAssignments: assignmentRows.filter(
          (assignment) => assignment.status === 'completed',
        ).length,
        activeSpellingLists: Number(spelling?.listCount ?? 0),
        activeSpellingWords: Number(spelling?.wordCount ?? 0),
        totalXp: progression?.totalXp ?? 0,
        currentLevel: Math.max(1, progression?.currentLevel ?? 1),
        currentStreakDays: progression?.currentStreakDays ?? 0,
      },
    };

    return NextResponse.json(mobileDashboardResponseSchema.parse(response));
  } catch (error) {
    logError(error, 'api/mobile/v1/dashboard');
    return mobileError('INTERNAL_ERROR', 'Unable to load the dashboard.', 500);
  }
}
