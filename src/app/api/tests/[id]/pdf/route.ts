import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGeneratePracticeQuestions } from '@/lib/auth/teacher-capabilities';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';
import { renderTestHtml } from '@/lib/practice/test-html';
import { renderPdfFromHtml } from '@/lib/pdf/browser';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
// Synchronous Chromium render happens inside the request, so give it headroom.
export const maxDuration = 60;

function safeFilename(title: string): string {
  const base =
    title
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'test';
  return `${base}.pdf`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canGeneratePracticeQuestions(user))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { id } = await params;
  const scope =
    user.role === 'admin'
      ? eq(generatedTests.id, id)
      : and(eq(generatedTests.id, id), eq(generatedTests.generatedBy, user.id));
  const [row] = await db.select().from(generatedTests).where(scope).limit(1);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const html = await renderTestHtml({
      title: row.title,
      bookSlug: row.bookSlug,
      units: row.units,
      document: row.document,
    });
    const pdf = await renderPdfFromHtml(html, { format: 'A4' });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename(row.title)}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logError(error, 'tests.pdf');
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
