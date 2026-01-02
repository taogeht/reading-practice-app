import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { books } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/books/[id] - Get a single book
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [book] = await db
            .select()
            .from(books)
            .where(eq(books.id, id))
            .limit(1);

        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        return NextResponse.json({ book });
    } catch (error) {
        console.error('[GET /api/books/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT /api/books/[id] - Update a book (admin only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const body = await request.json();
        const { title, publisher, isbn, totalPages, gradeLevels, subject, coverImageUrl, active } = body;

        const [updatedBook] = await db
            .update(books)
            .set({
                title,
                publisher: publisher || null,
                isbn: isbn || null,
                totalPages: totalPages ? parseInt(totalPages) : null,
                gradeLevels: gradeLevels || null,
                subject: subject || null,
                coverImageUrl: coverImageUrl || null,
                active: active ?? true,
                updatedAt: new Date(),
            })
            .where(eq(books.id, id))
            .returning();

        if (!updatedBook) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        return NextResponse.json({ book: updatedBook });
    } catch (error) {
        console.error('[PUT /api/books/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/books/[id] - Delete a book (admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const [deletedBook] = await db
            .delete(books)
            .where(eq(books.id, id))
            .returning();

        if (!deletedBook) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/books/[id]] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
