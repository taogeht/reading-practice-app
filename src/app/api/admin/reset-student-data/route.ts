import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    recordings,
    studentProgress,
    spellingGameResults,
    attendanceRecords,
    auditLogs,
    session,
    users,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { r2Client, r2KeyFromStoredUrl } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

// POST /api/admin/reset-student-data - Reset all student activity data
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - admin only' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        if (body.confirm !== 'RESET_ALL_STUDENT_DATA') {
            return NextResponse.json(
                { error: 'Must send { "confirm": "RESET_ALL_STUDENT_DATA" } to confirm' },
                { status: 400 }
            );
        }

        console.log('[RESET] Starting student data reset...');
        const results: Record<string, number> = {};

        // Collect recording R2 keys BEFORE the rows are deleted, so the audio
        // can be purged afterward (best-effort). Scoped to exactly what this
        // route deletes (recordings), so it doesn't touch media/avatars the
        // reset intentionally leaves in place.
        const r2Keys = new Set<string>();
        const recAudio = await db
            .select({ audioUrl: recordings.audioUrl, replyUrl: recordings.teacherReplyAudioUrl })
            .from(recordings);
        for (const row of recAudio) {
            const ka = r2KeyFromStoredUrl(row.audioUrl);
            if (ka) r2Keys.add(ka);
            const kr = r2KeyFromStoredUrl(row.replyUrl);
            if (kr) r2Keys.add(kr);
        }

        // 1. Delete spelling game results
        const gameRes = await db.delete(spellingGameResults).returning({ id: spellingGameResults.id });
        results.spellingGameResults = gameRes.length;
        console.log(`[RESET] Deleted ${gameRes.length} spelling game results`);

        // 2. Delete attendance records
        const attendRes = await db.delete(attendanceRecords).returning({ id: attendanceRecords.id });
        results.attendanceRecords = attendRes.length;
        console.log(`[RESET] Deleted ${attendRes.length} attendance records`);

        // 3. Delete recordings (these reference student_progress, so delete first)
        const recRes = await db.delete(recordings).returning({ id: recordings.id });
        results.recordings = recRes.length;
        console.log(`[RESET] Deleted ${recRes.length} recordings`);

        // 4. Delete student progress
        const progRes = await db.delete(studentProgress).returning({ id: studentProgress.id });
        results.studentProgress = progRes.length;
        console.log(`[RESET] Deleted ${progRes.length} student progress records`);

        // 5. Delete student audit logs (keep teacher/admin logs)
        const studentUsers = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, 'student'));
        const studentIds = studentUsers.map(u => u.id);

        if (studentIds.length > 0) {
            const auditRes = await db
                .delete(auditLogs)
                .where(inArray(auditLogs.userId, studentIds))
                .returning({ id: auditLogs.id });
            results.auditLogs = auditRes.length;
            console.log(`[RESET] Deleted ${auditRes.length} student audit logs`);

            // 6. Delete student sessions
            const sessRes = await db
                .delete(session)
                .where(inArray(session.userId, studentIds))
                .returning({ id: session.id });
            results.sessions = sessRes.length;
            console.log(`[RESET] Deleted ${sessRes.length} student sessions`);
        } else {
            results.auditLogs = 0;
            results.sessions = 0;
        }

        // Best-effort R2 purge of the now-deleted recordings' audio objects.
        const r2KeyList = Array.from(r2Keys);
        if (r2KeyList.length > 0) {
            await r2Client
                .deleteFiles(r2KeyList)
                .catch((e) => console.error('[RESET] R2 purge failed:', e));
        }
        results.r2ObjectsDeleted = r2KeyList.length;
        console.log(`[RESET] Purged ${r2KeyList.length} R2 objects`);

        console.log('[RESET] Student data reset complete:', results);

        return NextResponse.json({
            success: true,
            message: 'All student activity data has been reset',
            deleted: results,
        });
    } catch (error) {
        console.error('[RESET] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
