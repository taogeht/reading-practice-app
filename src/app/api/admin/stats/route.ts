import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, schools, stories, recordings } from '@/lib/db/schema';
import { count, eq, gte, sql } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all statistics in parallel
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      totalUsersResult,
      totalSchoolsResult,
      totalStoriesResult,
      totalRecordingsResult,
      adminCountResult,
      teacherCountResult,
      studentCountResult,
      recordingSizeResult,
      monthlyRecordingResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(schools),
      db.select({ count: count() }).from(stories),
      db.select({ count: count() }).from(recordings),
      db.select({ count: count() }).from(users).where(eq(users.role, 'admin')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'teacher')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'student')),
      db
        .select({
          totalSizeBytes: sql<number>`COALESCE(SUM(${recordings.fileSizeBytes}), 0)` ,
          totalDurationSeconds: sql<number>`COALESCE(SUM(${recordings.audioDurationSeconds}), 0)` ,
        })
        .from(recordings),
      db
        .select({ count: count() })
        .from(recordings)
        .where(gte(recordings.submittedAt, monthStart)),
    ]);

    const totalRecordingSizeBytes = Number(recordingSizeResult[0]?.totalSizeBytes ?? 0);
    const totalRecordingDurationSeconds = Number(recordingSizeResult[0]?.totalDurationSeconds ?? 0);
    const totalRecordingDurationHours = totalRecordingDurationSeconds / 3600;
    const monthlyRecordingCount = Number(monthlyRecordingResult[0]?.count ?? 0);

    const totalStorageGb = totalRecordingSizeBytes / (1024 ** 3);
    const STORAGE_COST_PER_GB = 0.015; // Cloudflare R2 standard storage estimate (USD)
    const estimatedStorageCostUsd = Number((totalStorageGb * STORAGE_COST_PER_GB).toFixed(2));

    const stats = {
      totalUsers: totalUsersResult[0]?.count || 0,
      totalSchools: totalSchoolsResult[0]?.count || 0,
      totalStories: totalStoriesResult[0]?.count || 0,
      totalRecordings: totalRecordingsResult[0]?.count || 0,
      totalAdmins: adminCountResult[0]?.count || 0,
      totalTeachers: teacherCountResult[0]?.count || 0,
      totalStudents: studentCountResult[0]?.count || 0,
      totalRecordingSizeBytes,
      totalRecordingDurationSeconds,
      totalRecordingDurationHours,
      monthlyRecordingCount,
      estimatedStorageCostUsd,
    };

    return NextResponse.json({ stats });

  } catch (error) {
    logError(error, 'api/admin/stats');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
