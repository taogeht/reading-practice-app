import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentAvatars } from '@/lib/db/schema';
import { generateSnapshot } from '@/lib/generation/snapshot';

export const runtime = 'nodejs';
// Each snapshot is a few R2 round-trips plus Sharp compositing — runs ~1–3s
// per student. The route returns as soon as the work is kicked off; the loop
// itself keeps running detached. maxDuration covers the initial DB query and
// the first .then() handoff so the response goes out promptly.
export const maxDuration = 60;

// POST /api/admin/avatar-catalog/regenerate-snapshots
// Body: { student_id?: uuid } — when omitted, regenerates snapshots for every
// student with an avatar row. Use this after re-running character/cosmetic
// generation so existing snapshots (which were composited from stale assets)
// get refreshed without each student having to touch their canvas.
export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { student_id } = body as { student_id?: string };

    const rows = student_id
        ? await db
            .select({ id: studentAvatars.studentId })
            .from(studentAvatars)
            .where(eq(studentAvatars.studentId, student_id))
            .limit(1)
        : await db.select({ id: studentAvatars.studentId }).from(studentAvatars);

    if (rows.length === 0) {
        return NextResponse.json({ success: true, started: 0, note: 'No avatars to regenerate' });
    }

    // Fire-and-forget: regenerate sequentially with a small pause between to
    // be gentle on R2 / Gemini-adjacent rate limits. Each failure is logged
    // and skipped; we don't bail the whole batch on one bad row.
    void (async () => {
        let ok = 0;
        let fail = 0;
        for (const r of rows) {
            try {
                await generateSnapshot(r.id);
                ok++;
            } catch (e) {
                fail++;
                console.error('[regenerate-snapshots]', r.id, e);
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        console.log(`[regenerate-snapshots] done — ok=${ok} fail=${fail} of ${rows.length}`);
    })();

    return NextResponse.json({ success: true, started: rows.length });
}
