import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, sql } from 'drizzle-orm';
import { googleTtsClient } from '@/lib/tts/client';
import { elevenLabsTtsClient } from '@/lib/tts/elevenlabs-client';
import { r2Client } from '@/lib/storage/r2-client';

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

        // Prefer ElevenLabs for natural-sounding voices, fall back to Google
        const ttsClient = elevenLabsTtsClient.isConfigured() ? elevenLabsTtsClient : googleTtsClient;
        const ttsProvider = elevenLabsTtsClient.isConfigured() ? 'elevenlabs' : 'google';

        if (!ttsClient.isConfigured()) {
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
                // Check if another word with the same text in the same school already has audio
                const existingAudio = await db.execute(sql`
                    SELECT sw.audio_url FROM spelling_words sw
                    JOIN spelling_lists sl ON sl.id = sw.spelling_list_id
                    JOIN classes c ON c.id = sl.class_id
                    WHERE LOWER(sw.word) = LOWER(${word.word})
                      AND sw.audio_url IS NOT NULL
                      AND c.school_id = (
                          SELECT c2.school_id FROM classes c2
                          JOIN spelling_lists sl2 ON sl2.class_id = c2.id
                          WHERE sl2.id = ${list.id}
                      )
                    LIMIT 1
                `);

                if (existingAudio.rows.length > 0) {
                    const audioUrl = existingAudio.rows[0].audio_url as string;
                    await db
                        .update(spellingWords)
                        .set({ audioUrl })
                        .where(eq(spellingWords.id, word.id));
                    results.push({ word: word.word, status: 'reused', audioUrl });
                    successCount++;
                    continue;
                }

                // Generate TTS audio for the word
                const ttsResult = await ttsClient.generateSpeech({ text: word.word });

                if (!ttsResult.success || !ttsResult.audioBuffer) {
                    throw new Error(ttsResult.error || 'TTS generation failed');
                }

                // Upload to R2 - using uploadFile which returns presigned URLs for audio
                const audioKey = `spelling/${list.classId}/${list.id}/${word.id}.mp3`;
                const buffer = Buffer.isBuffer(ttsResult.audioBuffer)
                    ? ttsResult.audioBuffer
                    : Buffer.from(ttsResult.audioBuffer);
                const audioUrl = await r2Client.uploadFile(
                    audioKey,
                    buffer,
                    'audio/mpeg'
                );

                // Update the word with the audio URL
                await db
                    .update(spellingWords)
                    .set({ audioUrl })
                    .where(eq(spellingWords.id, word.id));

                // Propagate audio to matching words (same text, same school) that don't have audio yet
                await db.execute(sql`
                    UPDATE spelling_words sw
                    SET audio_url = ${audioUrl}
                    FROM spelling_lists sl
                    JOIN classes c ON c.id = sl.class_id
                    WHERE sw.spelling_list_id = sl.id
                      AND c.school_id = (
                          SELECT c2.school_id FROM classes c2
                          JOIN spelling_lists sl2 ON sl2.class_id = c2.id
                          WHERE sl2.id = ${list.id}
                      )
                      AND LOWER(sw.word) = LOWER(${word.word})
                      AND sw.audio_url IS NULL
                      AND sw.id != ${word.id}
                `);

                results.push({ word: word.word, status: 'success', audioUrl });
                successCount++;
            } catch (error) {
                console.error(`[generate-audio] Error generating audio for "${word.word}":`, error);
                results.push({ word: word.word, status: 'error', error: String(error) });
                errorCount++;
            }
        }

        return NextResponse.json({
            message: `Generated audio for ${successCount} words, ${errorCount} errors (using ${ttsProvider})`,
            successCount,
            errorCount,
            results,
        });
    } catch (error) {
        console.error('[POST /api/spelling-lists/[id]/generate-audio] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
