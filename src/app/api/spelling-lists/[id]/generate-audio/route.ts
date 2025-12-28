import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { googleTtsClient } from '@/lib/tts/client';
import { uploadRecordingToR2 } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/spelling-lists/[id]/generate-audio - Generate TTS audio for all words
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!googleTtsClient.isConfigured()) {
            return NextResponse.json(
                { error: 'Text-to-speech is not configured on this server' },
                { status: 503 }
            );
        }

        // Fetch the spelling list with words
        const list = await db.query.spellingLists.findFirst({
            where: eq(spellingLists.id, id),
            with: {
                words: {
                    orderBy: (words, { asc }) => [asc(words.orderIndex)],
                },
            },
        });

        if (!list) {
            return NextResponse.json({ error: 'Spelling list not found' }, { status: 404 });
        }

        // Generate audio for each word that doesn't have audio yet
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const word of list.words) {
            if (word.audioUrl) {
                results.push({ word: word.word, status: 'skipped', audioUrl: word.audioUrl });
                continue;
            }

            try {
                // Generate TTS audio for the word
                const ttsResult = await googleTtsClient.generateSpeech({ text: word.word });

                if (!ttsResult.success || !ttsResult.audioBuffer) {
                    throw new Error(ttsResult.error || 'TTS generation failed');
                }

                // Upload to R2
                const audioKey = `spelling/${list.classId}/${list.id}/${word.id}.mp3`;
                const audioUrl = await uploadRecordingToR2(
                    audioKey,
                    ttsResult.audioBuffer,
                    'audio/mpeg'
                );

                // Update the word with the audio URL
                await db
                    .update(spellingWords)
                    .set({ audioUrl })
                    .where(eq(spellingWords.id, word.id));

                results.push({ word: word.word, status: 'success', audioUrl });
                successCount++;
            } catch (error) {
                console.error(`[generate-audio] Error generating audio for "${word.word}":`, error);
                results.push({ word: word.word, status: 'error', error: String(error) });
                errorCount++;
            }
        }

        return NextResponse.json({
            message: `Generated audio for ${successCount} words, ${errorCount} errors`,
            successCount,
            errorCount,
            results,
        });
    } catch (error) {
        console.error('[POST /api/spelling-lists/[id]/generate-audio] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
