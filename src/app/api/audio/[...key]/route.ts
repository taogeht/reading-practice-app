import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

// GET /api/audio/[...key] - Stream audio from R2 without presigned URLs
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string[] }> }
) {
    try {
        const { key: keyParts } = await params;
        const audioKey = keyParts.join('/');

        if (!audioKey) {
            return NextResponse.json({ error: 'Missing audio key' }, { status: 400 });
        }

        // Fetch the object from R2
        const result = await r2Client.getObject(audioKey);

        if (!result) {
            return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
        }

        const { body, contentType, contentLength } = result;

        // Build response headers
        const headers: Record<string, string> = {
            'Content-Type': contentType || 'audio/mpeg',
            'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year — files are immutable
            'Accept-Ranges': 'bytes',
        };

        if (contentLength !== undefined) {
            headers['Content-Length'] = String(contentLength);
        }

        return new NextResponse(body as ReadableStream, {
            status: 200,
            headers,
        });
    } catch (error) {
        logError(error, 'api/audio/[...key]');
        return NextResponse.json(
            { error: 'Failed to stream audio' },
            { status: 500 }
        );
    }
}
