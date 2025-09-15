import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, schools, stories, recordings } from '@/lib/db/schema';
import { count } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all statistics in parallel
    const [
      totalUsersResult,
      totalSchoolsResult,
      totalStoriesResult,
      totalRecordingsResult
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(schools),
      db.select({ count: count() }).from(stories),
      db.select({ count: count() }).from(recordings)
    ]);

    const stats = {
      totalUsers: totalUsersResult[0]?.count || 0,
      totalSchools: totalSchoolsResult[0]?.count || 0,
      totalStories: totalStoriesResult[0]?.count || 0,
      totalRecordings: totalRecordingsResult[0]?.count || 0,
    };

    return NextResponse.json({ stats });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}