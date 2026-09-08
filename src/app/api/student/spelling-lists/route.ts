import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classEnrollments, classes, students } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/student/spelling-lists - Get active spelling lists for student's enrolled classes
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user || user.role !== 'student') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get student profile (for grade level)
        const [student] = await db
            .select({ gradeLevel: students.gradeLevel })
            .from(students)
            .where(eq(students.id, user.id))
            .limit(1);

        // Get student's enrolled classes
        const enrollments = await db.query.classEnrollments.findMany({
            where: eq(classEnrollments.studentId, user.id),
            with: {
                class: true,
            },
        });

        if (enrollments.length === 0) {
            return NextResponse.json([]);
        }

        // 1. Only include active, un-promoted classes
        let targetEnrollments = enrollments.filter(
            (e) => e.class && e.class.active && !e.class.promotedToClassId
        );

        // 2. If the student has multiple active enrollments, prioritize classes
        // matching their current grade level (prevents old active classes from earlier grades leaking in)
        if (targetEnrollments.length > 1 && student?.gradeLevel != null) {
            const matchingGrade = targetEnrollments.filter(
                (e) => e.class.gradeLevel === student.gradeLevel
            );
            if (matchingGrade.length > 0) {
                targetEnrollments = matchingGrade;
            }
        }

        // 3. If multiple active classes still exist, sort most recent enrollment first
        targetEnrollments.sort((a, b) => {
            const dateA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0;
            const dateB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0;
            return dateB - dateA;
        });

        // Fallback only if no active classes exist at all
        if (targetEnrollments.length === 0) {
            targetEnrollments = enrollments;
        }

        const allLists = [];

        for (const enrollment of targetEnrollments) {
            const classId = enrollment.classId;
            const targetGrade = enrollment.class?.gradeLevel ?? student?.gradeLevel;

            // If class/student has a grade level (e.g. Grade 3), only return lists
            // matching that grade (or untagged lists), preventing older curriculum
            // lists from last semester in the same class from leaking in.
            const gradeCondition = targetGrade != null
                ? or(
                    eq(spellingLists.gradeLevel, targetGrade),
                    isNull(spellingLists.gradeLevel)
                )
                : undefined;

            const lists = await db.query.spellingLists.findMany({
                where: and(
                    eq(spellingLists.classId, classId),
                    eq(spellingLists.active, true),
                    gradeCondition,
                    // Scheduled release: only surface a list once its release date has passed
                    or(
                        isNull(spellingLists.availableFrom),
                        lte(spellingLists.availableFrom, new Date())
                    )
                ),
                with: {
                    words: {
                        orderBy: (words, { asc }) => [asc(words.orderIndex)],
                    },
                    class: {
                        columns: {
                            id: true,
                            name: true,
                            gradeLevel: true,
                        },
                    },
                },
                orderBy: [desc(spellingLists.isCurrent), desc(spellingLists.createdAt)],
            });

            allLists.push(...lists);
        }

        // Ensure at most one list is marked as current for the student
        let foundCurrent = false;
        for (const list of allLists) {
            if (list.isCurrent) {
                if (foundCurrent) {
                    list.isCurrent = false;
                } else {
                    foundCurrent = true;
                }
            }
        }

        // Sort: current week first, then curriculum order (by weekNumber if set, else creation date)
        allLists.sort((a, b) => {
            if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
            if (a.weekNumber != null && b.weekNumber != null) {
                return a.weekNumber - b.weekNumber;
            }
            return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
        });

        return NextResponse.json(allLists);
    } catch (error) {
        console.error('[GET /api/student/spelling-lists] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
