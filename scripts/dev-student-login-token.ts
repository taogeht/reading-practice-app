// Dev-only helper: find an active student and ensure they have a magic-link
// login token, then print a ready-to-use /s/<token> URL. Used to drive a real
// browser session against /student/dashboard-v2 locally.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/dev-student-login-token.ts
//
// Prefers a student who actually has data (enrollment + a recording) so the
// V2 dashboard's hero/last-recording surfaces aren't all empty states.

import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { users } from '../src/lib/db/schema';
import { generateLoginToken } from '../src/lib/auth';

async function main() {
    // Pick the student with the most recordings (richest dashboard), else any active student.
    const ranked = await db.execute(sql`
        SELECT u.id, u.first_name, u.last_name, u.login_token,
               COUNT(DISTINCT r.id) AS recording_count,
               COUNT(DISTINCT ce.class_id) AS class_count
        FROM users u
        JOIN students s ON s.id = u.id
        LEFT JOIN class_enrollments ce ON ce.student_id = s.id
        LEFT JOIN recordings r ON r.student_id = s.id
        WHERE u.active = true AND u.role = 'student'
        GROUP BY u.id, u.first_name, u.last_name, u.login_token
        ORDER BY recording_count DESC, class_count DESC
        LIMIT 5
    `);

    const rows = (ranked as any).rows ?? ranked;
    if (!rows || rows.length === 0) {
        console.error('No active students found in this database.');
        process.exit(1);
    }

    console.log('Top candidate students:');
    for (const r of rows) {
        console.log(
            `  ${r.first_name} ${r.last_name} (id=${r.id}) — recordings=${r.recording_count}, classes=${r.class_count}, hasToken=${!!r.login_token}`
        );
    }

    const chosen = rows[0];
    let token: string = chosen.login_token;
    if (!token || token.length < 16) {
        token = generateLoginToken();
        await db.update(users).set({ loginToken: token }).where(eq(users.id, chosen.id));
        console.log(`\nGenerated new login token for ${chosen.first_name}.`);
    }

    console.log(`\nCHOSEN_STUDENT=${chosen.first_name} ${chosen.last_name} (id=${chosen.id})`);
    console.log(`MAGIC_LINK=http://localhost:3000/s/${token}`);
    console.log(`LOGIN_TOKEN=${token}`);

    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
