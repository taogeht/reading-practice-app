import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { spellingLists, spellingWords } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { eq, sql } from 'drizzle-orm';
import { geminiImageClient } from '@/lib/image/gemini-client';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/spelling-lists/[id]/generate-images - Generate images for all words
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await getCurrentUser();

        if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get('force') === 'true';

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

        // Generate images for each word that doesn't have one yet
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        console.log(`[generate-images] Starting image generation for ${list.words.length} words, force=${force}`);

        for (const word of list.words) {
            if (word.imageUrl && !force) {
                console.log(`[generate-images] Skipping "${word.word}" - already has image`);
                results.push({ word: word.word, status: 'skipped', imageUrl: word.imageUrl });
                continue;
            }

            try {
                // Check if another word with the same text in the same school already has an image
                const existingImage = force ? { rows: [] } : await db.execute(sql`
                    SELECT sw.image_url FROM spelling_words sw
                    JOIN spelling_lists sl ON sl.id = sw.spelling_list_id
                    JOIN classes c ON c.id = sl.class_id
                    WHERE LOWER(sw.word) = LOWER(${word.word})
                      AND sw.image_url IS NOT NULL
                      AND c.school_id = (
                          SELECT c2.school_id FROM classes c2
                          JOIN spelling_lists sl2 ON sl2.class_id = c2.id
                          WHERE sl2.id = ${list.id}
                      )
                    LIMIT 1
                `);

                if (existingImage.rows.length > 0) {
                    const imageUrl = existingImage.rows[0].image_url as string;
                    await db
                        .update(spellingWords)
                        .set({ imageUrl })
                        .where(eq(spellingWords.id, word.id));
                    results.push({ word: word.word, status: 'reused', imageUrl });
                    successCount++;
                    continue;
                }

                // Generate image via Gemini
                console.log(`[generate-images] Calling Gemini for "${word.word}"...`);
                const imageResult = await geminiImageClient.generateImage(word.word);
                console.log(`[generate-images] Gemini result for "${word.word}":`, imageResult.success ? 'success' : imageResult.error);

                if (!imageResult.success || !imageResult.imageBuffer) {
                    throw new Error(imageResult.error || 'Image generation failed');
                }

                // Upload to R2
                const imageKey = r2Client.generateImageKey(list.classId, list.id, word.id);
                const imageUrl = await r2Client.uploadFile(
                    imageKey,
                    imageResult.imageBuffer,
                    imageResult.contentType || 'image/png'
                );

                // Update the word with the image URL
                await db
                    .update(spellingWords)
                    .set({ imageUrl })
                    .where(eq(spellingWords.id, word.id));

                // Propagate image to matching words (same text, same school) that don't have images yet
                await db.execute(sql`
                    UPDATE spelling_words sw
                    SET image_url = ${imageUrl}
                    FROM spelling_lists sl
                    JOIN classes c ON c.id = sl.class_id
                    WHERE sw.spelling_list_id = sl.id
                      AND c.school_id = (
                          SELECT c2.school_id FROM classes c2
                          JOIN spelling_lists sl2 ON sl2.class_id = c2.id
                          WHERE sl2.id = ${list.id}
                      )
                      AND LOWER(sw.word) = LOWER(${word.word})
                      AND sw.image_url IS NULL
                      AND sw.id != ${word.id}
                `);

                results.push({ word: word.word, status: 'success', imageUrl });
                successCount++;

                // Small delay to respect Gemini free tier rate limits (~10 req/min)
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                console.error(`[generate-images] Error generating image for "${word.word}":`, error);
                results.push({ word: word.word, status: 'error', error: String(error) });
                errorCount++;
            }
        }

        return NextResponse.json({
            message: `Generated images for ${successCount} words, ${errorCount} errors`,
            successCount,
            errorCount,
            results,
        });
    } catch (error) {
        console.error('[POST /api/spelling-lists/[id]/generate-images] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
