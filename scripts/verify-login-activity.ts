/**
 * Read-only smoke test for the shared login-activity helper.
 * Confirms the grouped SQL aggregates (EXTRACT/LEAST/GREATEST, counts) execute
 * against the real schema and return sane shapes. Safe to re-run: SELECT only.
 *
 *   npx tsx scripts/verify-login-activity.ts
 */
import 'dotenv/config';
import { db } from '../src/lib/db';
import { classEnrollments } from '../src/lib/db/schema';
import { computeStudentActivity, summarizeActivity } from '../src/lib/activity/login-activity';

async function main() {
    // Grab a handful of real enrolled student IDs.
    const rows = await db
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .limit(25);
    const ids = Array.from(new Set(rows.map((r) => r.studentId)));
    console.log(`Sampled ${ids.length} enrolled students.`);
    if (ids.length === 0) {
        console.log('No enrollments found — nothing to verify, but queries did not throw.');
        return;
    }

    const now = new Date();

    for (const days of [7, 30, null] as const) {
        const startDate = days !== null ? new Date(now) : null;
        if (startDate && days !== null) {
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);
        }
        const metrics = await computeStudentActivity(ids, startDate, now);
        const counts = summarizeActivity(metrics);
        console.log(`\n=== window: ${days ?? 'all-time'} ===`);
        console.log('counts:', counts);

        // Spot-check a few rows for shape sanity.
        const sample = Array.from(metrics.values()).slice(0, 3);
        for (const m of sample) {
            console.log({
                status: m.status,
                hasEverLoggedIn: m.hasEverLoggedIn,
                online: m.isCurrentlyOnline,
                lastLoginAt: m.lastLoginAt,
                minutes: m.totalMinutesOnline,
                recordings: m.recordingsCount,
                questions: m.questionsAnswered,
                spelling: m.spellingGames,
                streak: m.currentStreakDays,
            });
        }

        // Invariant checks.
        for (const m of metrics.values()) {
            if (m.status === 'never' && m.hasEverLoggedIn) throw new Error('never but hasEverLoggedIn');
            if (m.status !== 'never' && !m.hasEverLoggedIn) throw new Error('non-never but !hasEverLoggedIn');
            if (m.totalMinutesOnline < 0) throw new Error('negative minutes');
            if (m.actionsCount !== m.recordingsCount + m.questionsAnswered + m.spellingGames)
                throw new Error('actionsCount mismatch');
        }
        // All-time can never have a slipping student (window == everything).
        if (days === null && counts.slipping !== 0) throw new Error('all-time produced slipping');
    }

    console.log('\n✓ Queries executed and invariants held.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('VERIFY FAILED:', err);
        process.exit(1);
    });
