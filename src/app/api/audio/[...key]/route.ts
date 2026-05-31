import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { r2Client, SENSITIVE_AUDIO_PREFIXES } from '@/lib/storage/r2-client';
import { userCanAccessStudentMedia } from '@/lib/auth/class-access';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/audio/[...key] - Stream audio from R2 without presigned URLs.
// Requires a session. Keys under SENSITIVE_AUDIO_PREFIXES are a student's own
// recorded voice (audio/recordings/<studentId>/... and
// audio/passage-recordings/<studentId>/...) and are scoped to that student +
// their managing teachers + admins. All other audio (TTS, spelling, story
// narration, teacher replies) is shared classroom content for any logged-in user.
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
            return NextResponse.json({ error: 'Invalid audio key' }, { status: 400 });
        }
        const audioKey = keyParts.join('/');

        if (!audioKey) {
            return NextResponse.json({ error: 'Missing audio key' }, { status: 400 });
        }

        const isSensitive = SENSITIVE_AUDIO_PREFIXES.some((p) => audioKey.startsWith(p));
        if (isSensitive) {
            // audio/recordings/<studentId>/...  &  audio/passage-recordings/<studentId>/...
            // → studentId is the 3rd path segment.
            const ownerId = audioKey.split('/')[2];
            const allowed =
                !!ownerId &&
                ((user.role === 'student' && user.id === ownerId) ||
                    user.role === 'admin' ||
                    (user.role === 'teacher' &&
                        (await userCanAccessStudentMedia(user.id, user.role, ownerId))));
            if (!allowed) {
                // 404 (not 403) so the proxy doesn't confirm a key exists.
                return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
            }
        }

        const result = await r2Client.getObject(audioKey);

        if (!result) {
            return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
        }

        const { body, contentType, contentLength } = result;

        const headers: Record<string, string> = {
            'Content-Type': contentType || 'audio/mpeg',
            // Private (per-user, short-lived) for a minor's recording so shared
            // caches never serve it cross-user; shared content stays immutable.
            'Cache-Control': isSensitive
                ? 'private, max-age=3600'
                : 'public, max-age=31536000, immutable',
            'Accept-Ranges': 'bytes',
            'Vary': 'Cookie',
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
