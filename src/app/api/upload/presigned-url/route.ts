import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';
import { getCurrentUser } from '@/lib/auth';
import { logError, createRequestContext } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, type } = body;

    // Validate inputs
    if (!filename || !contentType || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: filename, contentType, type' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/webm',
      'audio/ogg',
      'audio/m4a',
      'audio/mp4'
    ];

    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Generate unique key for the file
    const key = r2Client.generateAudioKey(type, filename, user.id);

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await r2Client.generatePresignedUploadUrl(
      key,
      contentType,
      3600
    );

    // Return the presigned URL and key
    return NextResponse.json({
      presignedUrl,
      key,
      publicUrl: r2Client.getPublicUrl(key),
    });

  } catch (error) {
    logError(error, 'api/upload/presigned-url');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}