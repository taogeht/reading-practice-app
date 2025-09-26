import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classes,
  classEnrollments,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

type RolloverRequestBody = {
  fromAcademicYear: string;
  toAcademicYear?: string;
  includeInactive?: boolean;
  deactivateSource?: boolean;
};

type RolloverResult = {
  created: Array<{ id: string; name: string; academicYear: string }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
};

function parseAcademicYear(value: string): { start: number; end: number } | null {
  const match = value.trim().match(/^(\d{4})[-/](\d{4})$/);
  if (!match) {
    return null;
  }
  const start = Number.parseInt(match[1]!, 10);
  const end = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }
  return { start, end };
}

function formatAcademicYear(start: number): string {
  return `${start}-${start + 1}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as RolloverRequestBody;

    if (!body?.fromAcademicYear) {
      return NextResponse.json(
        { error: 'fromAcademicYear is required' },
        { status: 400 },
      );
    }

    const parsedFromYear = parseAcademicYear(body.fromAcademicYear);
    if (!parsedFromYear) {
      return NextResponse.json(
        { error: 'Invalid fromAcademicYear format. Use YYYY-YYYY.' },
        { status: 400 },
      );
    }

    let toAcademicYear = body.toAcademicYear;
    if (toAcademicYear) {
      const parsedToYear = parseAcademicYear(toAcademicYear);
      if (!parsedToYear) {
        return NextResponse.json(
          { error: 'Invalid toAcademicYear format. Use YYYY-YYYY.' },
          { status: 400 },
        );
      }
      if (parsedToYear.start !== parsedFromYear.start + 1) {
        return NextResponse.json(
          { error: 'toAcademicYear must immediately follow fromAcademicYear.' },
          { status: 400 },
        );
      }
    } else {
      toAcademicYear = formatAcademicYear(parsedFromYear.start + 1);
    }

    const includeInactive = Boolean(body?.includeInactive);
    const deactivateSource = body?.deactivateSource ?? true;

    const filters = [eq(classes.academicYear, body.fromAcademicYear.trim())];
    if (!includeInactive) {
      filters.push(eq(classes.active, true));
    }

    const sourceClasses = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
        gradeLevel: classes.gradeLevel,
        academicYear: classes.academicYear,
        active: classes.active,
        showPracticeStories: classes.showPracticeStories,
        schoolId: classes.schoolId,
        teacherId: classes.teacherId,
      })
      .from(classes)
      .where(filters.length > 1 ? and(...filters) : filters[0]!);

    if (sourceClasses.length === 0) {
      return NextResponse.json(
        {
          error: 'No classes found for the specified academic year.',
        },
        { status: 404 },
      );
    }

    // Preload enrollments for efficiency
    const enrollmentRows = await db
      .select({
        classId: classEnrollments.classId,
        studentId: classEnrollments.studentId,
      })
      .from(classEnrollments)
      .where(
        inArray(classEnrollments.classId, sourceClasses.map((cls) => cls.id)),
      );

    const enrollmentMap = new Map<string, string[]>();
    for (const row of enrollmentRows) {
      if (!enrollmentMap.has(row.classId)) {
        enrollmentMap.set(row.classId, []);
      }
      enrollmentMap.get(row.classId)!.push(row.studentId);
    }

    const result: RolloverResult = {
      created: [],
      skipped: [],
    };

    await db.transaction(async (tx) => {
      for (const sourceClass of sourceClasses) {
        if (!sourceClass.academicYear) {
          result.skipped.push({
            id: sourceClass.id,
            name: sourceClass.name,
            reason: 'Class has no academic year',
          });
          continue;
        }

        const existingTarget = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(and(
            eq(classes.teacherId, sourceClass.teacherId),
            eq(classes.name, sourceClass.name),
            eq(classes.academicYear, toAcademicYear),
          ))
          .limit(1);

        if (existingTarget.length > 0) {
          result.skipped.push({
            id: sourceClass.id,
            name: sourceClass.name,
            reason: 'Target class already exists',
          });
          continue;
        }

        const nextGradeLevel = sourceClass.gradeLevel !== null && sourceClass.gradeLevel !== undefined
          ? sourceClass.gradeLevel + 1
          : null;

        const [newClass] = await tx
          .insert(classes)
          .values({
            name: sourceClass.name,
            description: sourceClass.description,
            teacherId: sourceClass.teacherId,
            schoolId: sourceClass.schoolId,
            gradeLevel: nextGradeLevel,
            academicYear: toAcademicYear,
            showPracticeStories: sourceClass.showPracticeStories,
            active: true,
            rolloverFromClassId: sourceClass.id,
          })
          .returning();

        const studentIds = enrollmentMap.get(sourceClass.id) ?? [];
        if (studentIds.length > 0) {
          await tx
            .insert(classEnrollments)
            .values(studentIds.map((studentId) => ({
              classId: newClass.id,
              studentId,
            })))
            .onConflictDoNothing();
        }

        if (deactivateSource && sourceClass.active) {
          await tx
            .update(classes)
            .set({ active: false })
            .where(eq(classes.id, sourceClass.id));
        }

        result.created.push({
          id: newClass.id,
          name: newClass.name,
          academicYear: newClass.academicYear ?? toAcademicYear,
        });
      }
    });

    return NextResponse.json({
      message: 'Class rollover completed',
      created: result.created,
      skipped: result.skipped,
      targetAcademicYear: toAcademicYear,
    });
  } catch (error) {
    logError(error, 'api/admin/classes/rollover');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
