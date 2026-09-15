import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import { classEnrollments, classes, session, studentDailyActivity } from '@/lib/db/schema';
import { getDaysAgo, getStartOfMonth, getStartOfWeek, getTodayDateString } from '@/lib/date-utils';
import { ONLINE_THRESHOLD_MS } from '@/lib/activity/login-activity';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { studentId } = await params;

    // Authorization: confirm teacher has student in one of their classes
    if (user.role === 'teacher') {
      const allowedClassIds = await accessibleClassIds(user.id, user.role);
      if (allowedClassIds.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      const enrollment = await db
        .select({ id: classes.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(
          and(eq(classEnrollments.studentId, studentId), inArray(classes.id, allowedClassIds))
        )
        .limit(1);

      if (enrollment.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
    }

    const now = new Date();
    const todayStr = getTodayDateString(now);
    const startOfWeekStr = getTodayDateString(getStartOfWeek(now));
    const startOfMonthStr = getTodayDateString(getStartOfMonth(now));
    const fourteenDaysAgoStr = getTodayDateString(getDaysAgo(14, now));

    const onlineThreshold = new Date(now.getTime() - ONLINE_THRESHOLD_MS);

    // Parallel queries: active session, daily logs, and aggregate summaries
    const [sessions, allDailyRows] = await Promise.all([
      db
        .select({
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          currentActivityType: session.currentActivityType,
          currentActivityLabel: session.currentActivityLabel,
        })
        .from(session)
        .where(eq(session.userId, studentId))
        .orderBy(desc(session.lastActivityAt))
        .limit(1),

      db
        .select({
          date: studentDailyActivity.date,
          activityType: studentDailyActivity.activityType,
          secondsActive: studentDailyActivity.secondsActive,
          lastContextLabel: studentDailyActivity.lastContextLabel,
        })
        .from(studentDailyActivity)
        .where(
          and(
            eq(studentDailyActivity.studentId, studentId),
            gte(studentDailyActivity.date, fourteenDaysAgoStr)
          )
        )
        .orderBy(desc(studentDailyActivity.date)),
    ]);

    const latestSession = sessions[0];
    const isCurrentlyOnline = Boolean(
      latestSession?.lastActivityAt && new Date(latestSession.lastActivityAt) > onlineThreshold
    );

    const currentActivity = isCurrentlyOnline && latestSession?.currentActivityType
      ? {
          type: latestSession.currentActivityType,
          label: latestSession.currentActivityLabel ?? null,
        }
      : null;

    // Process daily breakdown over past 14 days
    const dailyMap = new Map<string, {
      date: string;
      totalMinutes: number;
      readingMinutes: number;
      spellingMinutes: number;
      assignmentMinutes: number;
      practiceMinutes: number;
      generalMinutes: number;
    }>();

    const todayBreakdown = { reading: 0, spelling: 0, assignment: 0, practice: 0, general: 0 };
    const weekBreakdown = { reading: 0, spelling: 0, assignment: 0, practice: 0, general: 0 };
    const monthBreakdown = { reading: 0, spelling: 0, assignment: 0, practice: 0, general: 0 };
    const allTimeBreakdown = { reading: 0, spelling: 0, assignment: 0, practice: 0, general: 0 };

    for (const row of allDailyRows) {
      const d = row.date;
      const mins = Math.round(row.secondsActive / 60);
      const act = row.activityType as keyof typeof todayBreakdown;

      if (!dailyMap.has(d)) {
        dailyMap.set(d, {
          date: d,
          totalMinutes: 0,
          readingMinutes: 0,
          spellingMinutes: 0,
          assignmentMinutes: 0,
          practiceMinutes: 0,
          generalMinutes: 0,
        });
      }
      const dayEntry = dailyMap.get(d)!;
      dayEntry.totalMinutes += mins;
      if (act === 'reading') dayEntry.readingMinutes += mins;
      else if (act === 'spelling') dayEntry.spellingMinutes += mins;
      else if (act === 'assignment') dayEntry.assignmentMinutes += mins;
      else if (act === 'practice') dayEntry.practiceMinutes += mins;
      else dayEntry.generalMinutes += mins;

      if (d === todayStr && act in todayBreakdown) {
        todayBreakdown[act] += mins;
      }
      if (d >= startOfWeekStr && act in weekBreakdown) {
        weekBreakdown[act] += mins;
      }
      if (d >= startOfMonthStr && act in monthBreakdown) {
        monthBreakdown[act] += mins;
      }
      if (act in allTimeBreakdown) {
        allTimeBreakdown[act] += mins;
      }
    }

    const recentDailyHistory = Array.from(dailyMap.values()).sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    return NextResponse.json({
      isCurrentlyOnline,
      currentActivity,
      lastActivityAt: latestSession?.lastActivityAt ?? null,
      today: {
        totalMinutes: Object.values(todayBreakdown).reduce((a, b) => a + b, 0),
        breakdown: todayBreakdown,
      },
      thisWeek: {
        totalMinutes: Object.values(weekBreakdown).reduce((a, b) => a + b, 0),
        breakdown: weekBreakdown,
      },
      thisMonth: {
        totalMinutes: Object.values(monthBreakdown).reduce((a, b) => a + b, 0),
        breakdown: monthBreakdown,
      },
      recentDailyHistory,
    });
  } catch (error) {
    console.error('Error fetching student activity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
