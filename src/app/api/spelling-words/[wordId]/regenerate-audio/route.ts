import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingWords, spellingLists, classes } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { googleTtsClient } from '@/lib/tts/client';
import { elevenLabsTtsClient } from '@/lib/tts/elevenlabs-client';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ wordId: string }>;
}

// POST /api/spelling-words/[wordId]/regenerate-audio
// Body: {
//   voiceId?: string,
//   applyToListIds?: string[],   // sibling list IDs (deduped view) — same-text words inside these get the new audio too
//   applyToSchool?: boolean,     // also overwrite every matching same-text word in the whole school
// }
// Generates a fresh TTS audio file for a single spelling word using the chosen
// voice. Uploads to a new versioned R2 key so the URL changes (avoids stale
// browser cache).
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { wordId } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const voiceParam: string | undefined = body.voiceId;
        const applyToSchool: boolean = body.applyToSchool === true;
        const applyToListIds: string[] = Array.isArray(body.applyToListIds)
            ? body.applyToListIds.filter((id: unknown): id is string => typeof id === 'string')
            : [];

        // Resolve TTS client + voice (mirrors /api/spelling-lists/[id]/generate-audio)
        let ttsClient: typeof googleTtsClient | typeof elevenLabsTtsClient;
        let ttsProvider: string;
        let voiceId: string | undefined;

        if (voiceParam) {
            const [provider, ...rest] = voiceParam.split(':');
            voiceId = rest.join(':');
            if (provider === 'elevenlabs' && elevenLabsTtsClient.isConfigured()) {
                ttsClient = elevenLabsTtsClient;
                ttsProvider = 'elevenlabs';
            } else if (provider === 'google' && googleTtsClient.isConfigured()) {
                ttsClient = googleTtsClient;
                ttsProvider = 'google';
            } else {
                ttsClient = elevenLabsTtsClient.isConfigured() ? elevenLabsTtsClient : googleTtsClient;
                ttsProvider = elevenLabsTtsClient.isConfigured() ? 'elevenlabs' : 'google';
                voiceId = undefined;
            }
        } else {
            ttsClient = elevenLabsTtsClient.isConfigured() ? elevenLabsTtsClient : googleTtsClient;
            ttsProvider = elevenLabsTtsClient.isConfigured() ? 'elevenlabs' : 'google';
        }

        if (!ttsClient.isConfigured()) {
            return NextResponse.json(
                { error: 'Text-to-speech is not configured on this server' },
                { status: 503 }
            );
        }

        // Fetch the word + parent list (need classId for the storage key + schoolId for propagation)
        const word = await db.query.spellingWords.findFirst({
            where: eq(spellingWords.id, wordId),
            with: {
                spellingList: {
                    with: {
                        class: { columns: { id: true, schoolId: true, teacherId: true } },
                    },
                },
            },
        });

        if (!word || !word.spellingList) {
            return NextResponse.json({ error: 'Word not found' }, { status: 404 });
        }

        if (user.role !== 'admin' && word.spellingList.class.teacherId !== user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Generate the audio
        const ttsResult = await ttsClient.generateSpeech({ text: word.word, voice_id: voiceId });

        if (!ttsResult.success || !ttsResult.audioBuffer) {
            return NextResponse.json(
                { error: ttsResult.error || 'TTS generation failed' },
                { status: 502 }
            );
        }

        // Versioned key — new URL each regeneration so the cached copy is bypassed
        const audioKey = `spelling/${word.spellingList.classId}/${word.spellingList.id}/${word.id}-${Date.now()}.mp3`;
        const buffer = Buffer.isBuffer(ttsResult.audioBuffer)
            ? ttsResult.audioBuffer
            : Buffer.from(ttsResult.audioBuffer);
        const audioUrl = await r2Client.uploadFile(audioKey, buffer, 'audio/mpeg');

        // Update this word
        await db.update(spellingWords).set({ audioUrl }).where(eq(spellingWords.id, word.id));

        // Propagate to sibling lists (the deduped teacher view of the same logical list).
        // Authorize: only sibling lists owned by this teacher (or anything for admin).
        let siblingsUpdated = 0;
        const siblingListIds = applyToListIds.filter((id) => id !== word.spellingList.id);
        if (siblingListIds.length > 0) {
            const allowedLists = await db
                .select({ id: spellingLists.id })
                .from(spellingLists)
                .innerJoin(classes, eq(classes.id, spellingLists.classId))
                .where(
                    user.role === 'admin'
                        ? inArray(spellingLists.id, siblingListIds)
                        : and(inArray(spellingLists.id, siblingListIds), eq(classes.teacherId, user.id))
                );

            const allowedIds = allowedLists.map((row) => row.id);
            if (allowedIds.length > 0) {
                const result = await db.execute(sql`
                    UPDATE spelling_words sw
                    SET audio_url = ${audioUrl}
                    WHERE sw.spelling_list_id = ANY(${allowedIds})
                      AND LOWER(sw.word) = LOWER(${word.word})
                      AND sw.id != ${word.id}
                `);
                siblingsUpdated = result.rowCount ?? 0;
            }
        }

        let schoolUpdated = 0;
        if (applyToSchool && word.spellingList.class.schoolId) {
            // Propagate to every matching same-text word in classes belonging to the same school
            const result = await db.execute(sql`
                UPDATE spelling_words sw
                SET audio_url = ${audioUrl}
                FROM spelling_lists sl
                JOIN classes c ON c.id = sl.class_id
                WHERE sw.spelling_list_id = sl.id
                  AND c.school_id = ${word.spellingList.class.schoolId}
                  AND LOWER(sw.word) = LOWER(${word.word})
                  AND sw.audio_url IS DISTINCT FROM ${audioUrl}
            `);
            schoolUpdated = result.rowCount ?? 0;
        }

        return NextResponse.json({
            success: true,
            wordId: word.id,
            audioUrl,
            provider: ttsProvider,
            voiceId,
            siblingsUpdated,
            schoolUpdated,
        });
    } catch (error) {
        console.error('[POST /api/spelling-words/[wordId]/regenerate-audio] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
