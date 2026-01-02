import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attendanceRecords, classEnrollments, students, users } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and, gte, lte } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/attendance - Get attendance for a class on a specific date
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');

        // Default to today
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        // Set to start of day
        targetDate.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all students enrolled in this class
        const enrolledStudents = await db
            .select({
                studentId: classEnrollments.studentId,
                firstName: users.firstName,
                lastName: users.lastName,
            })
            .from(classEnrollments)
            .innerJoin(students, eq(classEnrollments.studentId, students.id))
            .innerJoin(users, eq(students.id, users.id))
            .where(eq(classEnrollments.classId, classId));

        // Get existing attendance records for this date
        const existingRecords = await db
            .select()
            .from(attendanceRecords)
            .where(
                and(
                    eq(attendanceRecords.classId, classId),
                    gte(attendanceRecords.date, targetDate),
                    lte(attendanceRecords.date, endOfDay)
                )
            );

        // Create a map of existing attendance by student ID
        const attendanceMap = new Map(
            existingRecords.map(record => [record.studentId, record])
        );

        // Combine students with their attendance status
        const studentsWithAttendance = enrolledStudents.map(student => ({
            studentId: student.studentId,
            firstName: student.firstName,
            lastName: student.lastName,
            attendance: attendanceMap.get(student.studentId) || null,
        }));

        return NextResponse.json({
            date: targetDate.toISOString(),
            students: studentsWithAttendance,
        });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/attendance] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/classes/[classId]/attendance - Record attendance for multiple students
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { date, records } = body;

        if (!date || !records || !Array.isArray(records)) {
            return NextResponse.json(
                { error: 'date and records array are required' },
                { status: 400 }
            );
        }

        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        // Process each attendance record
        const results = await Promise.all(
            records.map(async (record: { studentId: string; status: string; notes?: string }) => {
                const existingRecord = await db
                    .select()
                    .from(attendanceRecords)
                    .where(
                        and(
                            eq(attendanceRecords.classId, classId),
                            eq(attendanceRecords.studentId, record.studentId),
                            eq(attendanceRecords.date, targetDate)
                        )
                    )
                    .limit(1);

                if (existingRecord.length > 0) {
                    // Update existing record
                    await db
                        .update(attendanceRecords)
                        .set({
                            status: record.status as 'present' | 'absent' | 'late' | 'excused',
                            notes: record.notes || null,
                            recordedBy: user.id,
                            updatedAt: new Date(),
                        })
                        .where(eq(attendanceRecords.id, existingRecord[0].id));
                    return { studentId: record.studentId, action: 'updated' };
                } else {
                    // Create new record
                    await db.insert(attendanceRecords).values({
                        classId,
                        studentId: record.studentId,
                        date: targetDate,
                        status: record.status as 'present' | 'absent' | 'late' | 'excused',
                        notes: record.notes || null,
                        recordedBy: user.id,
                    });
                    return { studentId: record.studentId, action: 'created' };
                }
            })
        );

        return NextResponse.json({
            success: true,
            date: targetDate.toISOString(),
            results,
        });
    } catch (error) {
        console.error('[POST /api/classes/[classId]/attendance] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
