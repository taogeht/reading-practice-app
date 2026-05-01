import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classes, classPracticeUnits } from '@/lib/db/schema';
import { isAvailablePracticeUnit, AVAILABLE_PRACTICE_UNITS } from '@/lib/practice/units';

export const runtime = 'nodejs';

// GET /api/teacher/classes/[classId]/practice-units
// → { units: number[], availableUnits: UnitInfo[] }
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { classId } = await params;

    const classRow = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
        columns: { id: true, teacherId: true },
    });
    if (!classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (user.role !== 'admin' && classRow.teacherId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const rows = await db
        .select({ unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(eq(classPracticeUnits.classId, classId));

    return NextResponse.json({
        units: rows.map((r) => r.unit).sort((a, b) => a - b),
        availableUnits: AVAILABLE_PRACTICE_UNITS,
    });
}

// PUT /api/teacher/classes/[classId]/practice-units
// Body: { units: number[] } — replaces the full set for this class.
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ classId: string }> }
) {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { classId } = await params;

    const classRow = await db.query.classes.findFirst({
        where: eq(classes.id, classId),
        columns: { id: true, teacherId: true },
    });
    if (!classRow) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    if (user.role !== 'admin' && classRow.teacherId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    let body: { units?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!Array.isArray(body.units)) {
        return NextResponse.json({ error: 'units must be an array of numbers' }, { status: 400 });
    }

    const requested = body.units
        .map((u) => Number(u))
        .filter((u) => Number.isInteger(u));
    const invalid = requested.find((u) => !isAvailablePracticeUnit(u));
    if (invalid !== undefined) {
        return NextResponse.json(
            { error: `Unit ${invalid} is not an available practice unit` },
            { status: 400 }
        );
    }
    const desired = Array.from(new Set(requested));

    const existingRows = await db
        .select({ unit: classPracticeUnits.unit })
        .from(classPracticeUnits)
        .where(eq(classPracticeUnits.classId, classId));
    const existing = new Set(existingRows.map((r) => r.unit));
    const desiredSet = new Set(desired);

    const toAdd = desired.filter((u) => !existing.has(u));
    const toRemove = Array.from(existing).filter((u) => !desiredSet.has(u));

    if (toAdd.length > 0) {
        await db
            .insert(classPracticeUnits)
            .values(toAdd.map((unit) => ({ classId, unit })))
            .onConflictDoNothing();
    }

    if (toRemove.length > 0) {
        await db
            .delete(classPracticeUnits)
            .where(
                and(
                    eq(classPracticeUnits.classId, classId),
                    inArray(classPracticeUnits.unit, toRemove)
                )
            );
    }

    return NextResponse.json({ units: desired.sort((a, b) => a - b) });
}
