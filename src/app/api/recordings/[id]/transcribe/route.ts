import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments, classes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import {
    assemblyAIClient,
    googleSttClient,
    isProviderConfigured,
    type SttProvider,
} from '@/lib/stt/client';

export const runtime = 'nodejs';

// POST /api/recordings/[id]/transcribe - Transcribe a recording
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: recordingId } = await params;

        // Fetch the recording
        const recording = await db.query.recordings.findFirst({
            where: eq(recordings.id, recordingId),
        });

        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // Students can only transcribe their own recordings
        if (user.role === 'student' && recording.studentId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // If already transcribed, return existing transcript
        if (recording.transcript && recording.transcript.length > 1) {
            console.log(`[Transcribe] Returning cached transcript for ${recordingId}`);
            return NextResponse.json({
                success: true,
                transcript: recording.transcript,
                confidence: recording.transcriptConfidence ? parseFloat(recording.transcriptConfidence) : null,
            });
        }

        // Determine STT provider from the class setting
        let provider: SttProvider = 'assemblyai'; // default
        try {
            const assignment = await db.query.assignments.findFirst({
                where: eq(assignments.id, recording.assignmentId),
            });
            if (assignment) {
                const cls = await db.query.classes.findFirst({
                    where: eq(classes.id, assignment.classId),
                });
                if (cls?.sttProvider && (cls.sttProvider === 'google' || cls.sttProvider === 'assemblyai')) {
                    provider = cls.sttProvider as SttProvider;
                }
            }
        } catch (e) {
            console.warn('[Transcribe] Could not look up class STT preference, using default');
        }

        if (!isProviderConfigured(provider)) {
            return NextResponse.json(
                { error: `Speech-to-text provider "${provider}" is not configured` },
                { status: 503 }
            );
        }

        // Extract the R2 key from the audio URL
        const audioUrl = recording.audioUrl;
        const urlObj = new URL(audioUrl);
        const key = urlObj.pathname.replace(/^\//, '');

        console.log(`[Transcribe] Recording ${recordingId}: provider=${provider}, key=${key}`);

        let result;

        if (provider === 'assemblyai') {
            // AssemblyAI can fetch directly from a presigned URL
            const presignedUrl = await r2Client.generatePresignedDownloadUrl(key, 3600);
            result = await assemblyAIClient.transcribeFromUrl(presignedUrl);
        } else {
            // Google STT needs the audio buffer
            const audioData = await r2Client.getObjectBuffer(key);
            if (!audioData) {
                return NextResponse.json({ error: 'Could not fetch audio file' }, { status: 500 });
            }
            console.log(`[Transcribe] Fetched audio: ${(audioData.buffer.length / 1024).toFixed(1)} KB`);
            result = await googleSttClient.transcribe(audioData.buffer, audioData.contentType);
        }

        if (!result.success) {
            console.error(`[Transcribe] Failed (${provider}): ${result.error}`);
            return NextResponse.json(
                { error: result.error || 'Transcription failed' },
                { status: 500 }
            );
        }

        console.log(`[Transcribe] Success (${provider}): "${result.transcript?.substring(0, 80)}..." confidence=${result.confidence}`);

        // Save transcript to database
        await db
            .update(recordings)
            .set({
                transcript: result.transcript || '',
                transcriptConfidence: result.confidence?.toString() || null,
                updatedAt: new Date(),
            })
            .where(eq(recordings.id, recordingId));

        return NextResponse.json({
            success: true,
            transcript: result.transcript,
            confidence: result.confidence,
            provider,
        });
    } catch (error) {
        console.error('[POST /api/recordings/[id]/transcribe] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
