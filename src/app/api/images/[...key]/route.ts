import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/images/[...key] - Stream images from R2.
// All image content is shared/non-PII (spelling, passage, practice, and avatar
// snapshots — the classmates gallery intentionally shows peers' avatars), so a
// valid session is the only gate; no per-key ownership. Safe to cache.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string[] }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { key: keyParts } = await params;
        if (keyParts.some((p) => p === '..')) {
            return NextResponse.json({ error: 'Invalid image key' }, { status: 400 });
        }
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
        logError(error, 'api/images/[...key]');
        return NextResponse.json(
            { error: 'Failed to stream image' },
            { status: 500 }
        );
    }
}
