import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { filename, contentType, classId } = body;

        if (!filename || !contentType || !classId) {
            return NextResponse.json(
                { error: 'Missing required fields: filename, contentType, classId' },
                { status: 400 }
            );
        }

        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];

        if (!allowedTypes.includes(contentType)) {
            return NextResponse.json(
                { error: 'Unsupported file type' },
                { status: 400 }
            );
        }

        const key = r2Client.generateSyllabusKey(classId, filename);

        const presignedUrl = await r2Client.generatePresignedUploadUrl(
            key,
            contentType,
            3600
        );

        return NextResponse.json({
            presignedUrl,
            key,
            publicUrl: r2Client.getPublicUrl(key),
        });

    } catch (error) {
        logError(error, 'api/upload/syllabus');
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
