import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
    baseCharacters,
    classEnrollments,
    shopItems,
    studentAvatars,
    studentInventory,
    studentProgression,
    users,
} from '@/lib/db/schema';

export const runtime = 'nodejs';

// GET /api/student/classmates
// Returns every other student enrolled in any class the current student is
// in (union across enrollments). Excludes the current student. Surfaces only
// public-facing data: first name, avatar, lifetime star count (NOT balance),
// and collectibles owned. Never exposes cosmetic inventory or balances.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Pull the current student's class ids.
        const myEnrollments = await db
            .select({ classId: classEnrollments.classId })
            .from(classEnrollments)
            .where(eq(classEnrollments.studentId, user.id));
        const myClassIds = myEnrollments.map((e) => e.classId);
        if (myClassIds.length === 0) {
            return NextResponse.json({ classmates: [] });
        }

        // 2. Find every distinct classmate. UNION over enrollments to dedupe
        // when peers share more than one class with this student.
        const classmateRows = await db.execute<{ id: string; first_name: string }>(sql`
            SELECT DISTINCT u.id, u.first_name
            FROM ${classEnrollments} ce
            INNER JOIN ${users} u ON u.id = ce.student_id
            WHERE ce.class_id IN (${sql.join(myClassIds.map((id) => sql`${id}`), sql`, `)})
              AND ce.student_id <> ${user.id}
              AND u.role = 'student'
        `);
        const classmateList =
            (classmateRows as unknown as { rows?: { id: string; first_name: string }[] }).rows ??
            (classmateRows as unknown as { id: string; first_name: string }[]);
        if (classmateList.length === 0) {
            return NextResponse.json({ classmates: [] });
        }

        const classmateIds = classmateList.map((c) => c.id);

        // 3. Avatar rows (may be null for peers who haven't picked).
        const avatarRows = await db
            .select()
            .from(studentAvatars)
            .where(inArray(studentAvatars.studentId, classmateIds));
        const avatarByStudent = new Map(avatarRows.map((a) => [a.studentId, a]));

        // 4. Collectibles for every classmate — rendered on the profile sheet.
        // No longer hydrating equipped cosmetics for the gallery: with Phase 6
        // snapshots, the flat composite already shows everything they have on
        // their canvas, so per-slot details aren't needed on the peer view.
        const collectibleRows = await db
            .select({
                studentId: studentInventory.studentId,
                itemId: studentInventory.itemId,
                acquiredAt: studentInventory.acquiredAt,
                item: shopItems,
            })
            .from(studentInventory)
            .innerJoin(shopItems, eq(shopItems.id, studentInventory.itemId))
            .where(
                and(
                    inArray(studentInventory.studentId, classmateIds),
                    eq(shopItems.type, 'collectible'),
                ),
            );

        const collectiblesByStudent = new Map<string, typeof collectibleRows>();
        for (const row of collectibleRows) {
            if (!collectiblesByStudent.has(row.studentId)) collectiblesByStudent.set(row.studentId, []);
            collectiblesByStudent.get(row.studentId)!.push(row);
        }

        // 6. Lifetime stars for each peer.
        const lifetimeRows = await db
            .select({
                studentId: studentProgression.studentId,
                lifetime: studentProgression.starsLifetime,
            })
            .from(studentProgression)
            .where(inArray(studentProgression.studentId, classmateIds));
        const lifetimeByStudent = new Map(lifetimeRows.map((r) => [r.studentId, r.lifetime]));

        // Phase 6: peer avatars render from the snapshot URL when present.
        // Fall back to the character base PNG (Phase 5 era) when a peer hasn't
        // saved a canvas yet. CSS layered rendering for peers is gone.
        const characterIds = Array.from(
            new Set(avatarRows.map((r) => r.characterId).filter(Boolean) as string[]),
        );
        const characterAssetById = new Map<string, string | null>();
        if (characterIds.length > 0) {
            const charRows = await db
                .select({ id: baseCharacters.id, assetUrl: baseCharacters.assetUrl })
                .from(baseCharacters)
                .where(inArray(baseCharacters.id, characterIds));
            for (const c of charRows) characterAssetById.set(c.id, c.assetUrl);
        }

        const classmates = classmateList.map((c) => {
            const avatarRow = avatarByStudent.get(c.id);
            let avatar = null as null | {
                characterType: string;
                baseAssetUrl: string | null;
                snapshotUrl: string | null;
            };
            if (avatarRow) {
                const characterUrl = avatarRow.characterId
                    ? characterAssetById.get(avatarRow.characterId) ?? null
                    : null;
                avatar = {
                    characterType: avatarRow.characterType,
                    baseAssetUrl: avatarRow.baseAssetUrl ?? characterUrl,
                    snapshotUrl: avatarRow.snapshotUrl,
                };
            }

            const owned = collectiblesByStudent.get(c.id) ?? [];
            return {
                id: c.id,
                display_name: c.first_name,
                avatar,
                lifetime_stars: lifetimeByStudent.get(c.id) ?? 0,
                collectibles: owned.map((o) => ({
                    id: o.item.id,
                    name: o.item.name,
                    asset_data: o.item.assetData,
                    category: o.item.category,
                })),
            };
        });

        // Sort: peers with avatars first, then alphabetical by display name —
        // gives a cleaner gallery for kids who scan left-to-right.
        classmates.sort((a, b) => {
            const hasA = a.avatar ? 1 : 0;
            const hasB = b.avatar ? 1 : 0;
            if (hasA !== hasB) return hasB - hasA;
            return a.display_name.localeCompare(b.display_name);
        });

        return NextResponse.json({ classmates });
    } catch (error) {
        console.error('[GET /api/student/classmates] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
