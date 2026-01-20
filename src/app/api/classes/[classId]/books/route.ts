import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classBooks, books } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ classId: string }>;
}

// GET /api/classes/[classId]/books - Get books assigned to a class
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const assignedBooks = await db
            .select({
                id: classBooks.id,
                bookId: classBooks.bookId,
                assignedAt: classBooks.assignedAt,
                isCurrent: classBooks.isCurrent,
                title: books.title,
                publisher: books.publisher,
                totalPages: books.totalPages,
                subject: books.subject,
                coverImageUrl: books.coverImageUrl,
            })
            .from(classBooks)
            .innerJoin(books, eq(classBooks.bookId, books.id))
            .where(eq(classBooks.classId, classId));

        return NextResponse.json({ books: assignedBooks });
    } catch (error) {
        console.error('[GET /api/classes/[classId]/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/classes/[classId]/books - Assign a book to a class
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { bookId, isCurrent = true } = body;

        if (!bookId) {
            return NextResponse.json({ error: 'bookId is required' }, { status: 400 });
        }

        // Check if already assigned
        const existing = await db
            .select()
            .from(classBooks)
            .where(and(eq(classBooks.classId, classId), eq(classBooks.bookId, bookId)))
            .limit(1);

        if (existing.length > 0) {
            return NextResponse.json({ error: 'Book already assigned to this class' }, { status: 400 });
        }

        const [assignment] = await db.insert(classBooks).values({
            classId,
            bookId,
            isCurrent,
        }).returning();

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/classes/[classId]/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/classes/[classId]/books - Remove a book from a class
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const bookId = searchParams.get('bookId');

        if (!bookId) {
            return NextResponse.json({ error: 'bookId is required' }, { status: 400 });
        }

        await db
            .delete(classBooks)
            .where(and(eq(classBooks.classId, classId), eq(classBooks.bookId, bookId)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/classes/[classId]/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH /api/classes/[classId]/books - Archive or restore a book
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { classId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { bookId, isCurrent } = body;

        if (!bookId || typeof isCurrent !== 'boolean') {
            return NextResponse.json(
                { error: 'bookId and isCurrent (boolean) are required' },
                { status: 400 }
            );
        }

        await db
            .update(classBooks)
            .set({ isCurrent })
            .where(and(eq(classBooks.classId, classId), eq(classBooks.bookId, bookId)));

        return NextResponse.json({
            success: true,
            bookId,
            isCurrent,
            action: isCurrent ? 'restored' : 'archived'
        });
    } catch (error) {
        console.error('[PATCH /api/classes/[classId]/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
