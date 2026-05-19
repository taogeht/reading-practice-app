import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { baseCharacters } from '@/lib/db/schema';

export const runtime = 'nodejs';

// GET /api/student/character/catalog
// Returns every base character with generation_status = 'complete'. Powers the
// student-side picker (initial create + reroll) so kids only see characters
// that have a real portrait. Pending/failed rows are hidden until admin runs
// generation.
export async function GET(_request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rows = await db
            .select({
                id: baseCharacters.id,
                character_type: baseCharacters.characterType,
                variant_index: baseCharacters.variantIndex,
                name: baseCharacters.name,
                personality: baseCharacters.personality,
                asset_url: baseCharacters.assetUrl,
            })
            .from(baseCharacters)
            .where(eq(baseCharacters.generationStatus, 'complete'))
            .orderBy(asc(baseCharacters.characterType), asc(baseCharacters.variantIndex));

        return NextResponse.json({ characters: rows });
    } catch (error) {
        console.error('[GET /api/student/character/catalog] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
