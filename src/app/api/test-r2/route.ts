import { NextRequest, NextResponse } from 'next/server';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Import S3 ListObjectsV2Command to search for files
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
    
    // List all objects in the audio/tts/ directory
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'audio/tts/',
      MaxKeys: 20
    });
    
    const listResponse = await s3Client.send(listCommand);
    const audioFiles = listResponse.Contents || [];
    
    const results = [];
    
    for (const file of audioFiles) {
      if (file.Key && file.Key.endsWith('.mp3')) {
        try {
          const presignedUrl = await r2Client.generatePresignedDownloadUrl(file.Key, 3600);
          const metadata = await r2Client.getFileMetadata(file.Key);
          
          results.push({
            key: file.Key,
            size: file.Size,
            lastModified: file.LastModified,
            presignedUrl,
            metadata
          });
        } catch (error) {
          results.push({
            key: file.Key,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      totalFiles: audioFiles.length,
      audioFiles: results,
      bucketName: process.env.R2_BUCKET_NAME,
      publicUrl: process.env.R2_PUBLIC_URL
    });
    
  } catch (error) {
    console.error('R2 test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Import database stuff
    const { db } = await import('@/lib/db');
    const { stories } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    
    const body = await request.json();
    const { storyId, audioKey } = body;
    
    if (!storyId || !audioKey) {
      return NextResponse.json({ error: 'storyId and audioKey required' }, { status: 400 });
    }
    
    // Generate presigned URL
    const presignedUrl = await r2Client.generatePresignedDownloadUrl(audioKey, 7 * 24 * 3600);
    
    // Update story in database
    await db
      .update(stories)
      .set({
        ttsAudioUrl: presignedUrl,
        ttsGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));
    
    return NextResponse.json({
      success: true,
      audioUrl: presignedUrl,
      message: 'Story updated successfully'
    });
    
  } catch (error) {
    console.error('Error fixing story:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}