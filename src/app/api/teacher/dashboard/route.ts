import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, assignments, recordings, classEnrollments, stories, users, students, teachers, schools, schoolMemberships } from '@/lib/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'teacher') {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 401 }
      );
    }

    // Ensure teacher record exists
    const teacherRecord = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(eq(teachers.id, user.id))
      .limit(1);

    if (!teacherRecord.length) {
      // Create teacher record if it doesn't exist
      await db.insert(teachers).values({
        id: user.id,
        employeeId: null,
        department: null,
        subjects: null,
      });
    }

    // Ensure teacher has school association
    let teacherSchool = await db
      .select({ schoolId: schoolMemberships.schoolId })
      .from(schoolMemberships)
      .where(and(
        eq(schoolMemberships.userId, user.id),
        eq(schoolMemberships.isPrimary, true)
      ))
      .limit(1);

    if (!teacherSchool.length) {
      // Create a default school for the teacher
      const defaultSchool = await db
        .insert(schools)
        .values({
          name: `${user.firstName} ${user.lastName}'s School`,
          district: null,
          address: null,
          city: null,
          state: null,
          zipCode: null,
        })
        .returning();

      // Associate teacher with the new school
      await db
        .insert(schoolMemberships)
        .values({
          userId: user.id,
          schoolId: defaultSchool[0].id,
          isPrimary: true,
        });
    }

    // Get teacher's classes with student counts
    const teacherClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        studentCount: sql<number>`count(${classEnrollments.studentId})::integer`,
      })
      .from(classes)
      .leftJoin(classEnrollments, eq(classes.id, classEnrollments.classId))
      .where(eq(classes.teacherId, user.id))
      .groupBy(classes.id, classes.name);

    // Get active assignments count
    const activeAssignmentsResult = await db
      .select({ count: count() })
      .from(assignments)
      .where(eq(assignments.teacherId, user.id));

    // Get pending reviews count
    const pendingReviewsResult = await db
      .select({ count: count() })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .where(and(
        eq(assignments.teacherId, user.id),
        eq(recordings.status, 'pending')
      ));

    // Get stories without TTS audio count
    const storiesWithoutAudioResult = await db
      .select({ count: count() })
      .from(stories)
      .where(sql`${stories.ttsAudioUrl} IS NULL AND ${stories.active} = true`);

    // Get recent submissions (last 10)
    const recentSubmissions = await db
      .select({
        id: recordings.id,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        assignmentTitle: assignments.title,
        submittedAt: recordings.submittedAt,
        status: recordings.status,
        attemptNumber: recordings.attemptNumber,
        accuracyScore: recordings.accuracyScore,
        teacherFeedback: recordings.teacherFeedback,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .innerJoin(students, eq(recordings.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(assignments.teacherId, user.id))
      .orderBy(desc(recordings.submittedAt))
      .limit(10);

    // Calculate total students across all classes
    const totalStudents = teacherClasses.reduce((sum, cls) => sum + cls.studentCount, 0);

    const dashboardData = {
      teacher: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        classes: teacherClasses.map(cls => ({
          id: cls.id,
          name: cls.name,
          studentCount: cls.studentCount,
          pendingSubmissions: 0, // We'll calculate this per class if needed
          recentActivity: 0, // We'll calculate this per class if needed
        }))
      },
      stats: {
        totalStudents,
        activeAssignments: activeAssignmentsResult[0]?.count || 0,
        pendingReviews: pendingReviewsResult[0]?.count || 0,
        storiesWithoutAudio: storiesWithoutAudioResult[0]?.count || 0,
      },
      recentSubmissions: recentSubmissions.map(submission => ({
        id: submission.id,
        studentName: `${submission.studentFirstName} ${submission.studentLastName}`,
        assignmentTitle: submission.assignmentTitle,
        submittedAt: submission.submittedAt?.toISOString() || new Date().toISOString(),
        status: submission.status as 'pending' | 'submitted' | 'reviewed' | 'flagged',
        attemptNumber: submission.attemptNumber || 1,
        score: submission.accuracyScore ? Math.round(Number(submission.accuracyScore)) : undefined,
        flagReason: submission.status === 'flagged' ? submission.teacherFeedback : undefined,
      }))
    };

    return NextResponse.json(dashboardData, { status: 200 });

  } catch (error) {
    logError(error, 'api/teacher/dashboard');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}