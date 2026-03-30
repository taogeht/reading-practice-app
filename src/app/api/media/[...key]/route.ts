import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/media/[...key] - Stream media files (photos, audio) from R2
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: keyParts } = await params;
    const mediaKey = keyParts.join('/');

    if (!mediaKey) {
      return NextResponse.json({ error: 'Missing media key' }, { status: 400 });
    }

    const result = await r2Client.getObject(mediaKey);

    if (!result) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const { body, contentType, contentLength } = result;

    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    if (contentLength !== undefined) {
      headers['Content-Length'] = String(contentLength);
    }

    return new NextResponse(body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    logError(error, 'api/media/[...key]');
    return NextResponse.json({ error: 'Failed to stream media' }, { status: 500 });
  }
}
