import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { books } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, desc, and, arrayContains } from 'drizzle-orm';

export const runtime = 'nodejs';

// GET /api/books - List all books (with optional grade filter)
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const gradeLevel = searchParams.get('gradeLevel');
        const activeOnly = searchParams.get('activeOnly') !== 'false';

        let query = db.select().from(books);

        // Build conditions
        const conditions = [];

        if (activeOnly) {
            conditions.push(eq(books.active, true));
        }

        // Apply conditions if any
        const allBooks = conditions.length > 0
            ? await query.where(and(...conditions)).orderBy(desc(books.createdAt))
            : await query.orderBy(desc(books.createdAt));

        // Filter by grade level in JS (since array contains is tricky)
        const filteredBooks = gradeLevel
            ? allBooks.filter(book => book.gradeLevels?.includes(parseInt(gradeLevel)))
            : allBooks;

        return NextResponse.json({ books: filteredBooks });
    } catch (error) {
        console.error('[GET /api/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/books - Create a new book (admin only)
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const body = await request.json();
        const { title, publisher, isbn, totalPages, gradeLevels, subject, coverImageUrl } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const [newBook] = await db.insert(books).values({
            title,
            publisher: publisher || null,
            isbn: isbn || null,
            totalPages: totalPages ? parseInt(totalPages) : null,
            gradeLevels: gradeLevels || null,
            subject: subject || null,
            coverImageUrl: coverImageUrl || null,
            createdBy: user.id,
        }).returning();

        return NextResponse.json({ book: newBook }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/books] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
