import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

// GET /api/images/[...key] - Stream images from R2
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string[] }> }
) {
    try {
        const { key: keyParts } = await params;
        const imageKey = keyParts.join('/');

        if (!imageKey) {
            return NextResponse.json({ error: 'Missing image key' }, { status: 400 });
        }

        const result = await r2Client.getObject(imageKey);

        if (!result) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        const { body, contentType, contentLength } = result;

        const headers: Record<string, string> = {
            'Content-Type': contentType || 'image/png',
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
        console.error('[api/images] Error:', error);
        return NextResponse.json(
            { error: 'Failed to stream image' },
            { status: 500 }
        );
    }
}
