/**
 * Dictionary API client for fetching syllable data
 * 
 * Primary: WordsAPI (via RapidAPI) - explicit syllable arrays
 * Fallback: Algorithmic splitting when API unavailable or word not found
 */

interface WordsApiResponse {
    word: string;
    syllables?: {
        count: number;
        list: string[];
    };
    pronunciation?: {
        all?: string;
    };
}

/**
 * Simple syllable splitting algorithm as fallback
 * Based on vowel patterns - improved version
 */
function splitSyllablesFallback(word: string): string[] {
    const lower = word.toLowerCase();

    // Very short words are one syllable
    if (lower.length <= 3) {
        return [word];
    }

    const vowels = "aeiouy";
    const result: string[] = [];
    let current = "";
    let hasVowel = false;

    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const lowerChar = char.toLowerCase();
        const isVowel = vowels.includes(lowerChar);

        current += char;

        if (isVowel) {
            hasVowel = true;
        }

        // Look ahead to determine syllable break
        if (hasVowel && i < word.length - 1) {
            const nextChar = word[i + 1].toLowerCase();
            const isNextVowel = vowels.includes(nextChar);

            // If current is consonant and next is vowel, might be syllable break
            if (!isVowel && isNextVowel && current.length >= 2) {
                result.push(current);
                current = "";
                hasVowel = false;
            }
            // If we have VCV pattern, break before the consonant that precedes the vowel
            else if (isVowel && !isNextVowel && i < word.length - 2) {
                const afterNext = word[i + 2]?.toLowerCase();
                if (afterNext && vowels.includes(afterNext)) {
                    // V-CV pattern: break after vowel
                    result.push(current);
                    current = "";
                    hasVowel = false;
                }
            }
        }
    }

    if (current) {
        result.push(current);
    }

    // Merge very short syllables
    const merged: string[] = [];
    for (let i = 0; i < result.length; i++) {
        if (result[i].length === 1 && !vowels.includes(result[i].toLowerCase()) && merged.length > 0) {
            merged[merged.length - 1] += result[i];
        } else if (i === result.length - 1 && result[i].length === 1 && merged.length > 0) {
            merged[merged.length - 1] += result[i];
        } else {
            merged.push(result[i]);
        }
    }

    return merged.length > 0 ? merged : [word];
}

/**
 * Fetch syllables from WordsAPI (via RapidAPI)
 * Requires RAPIDAPI_KEY environment variable
 */
async function fetchFromWordsApi(word: string): Promise<string[] | null> {
    const apiKey = process.env.RAPIDAPI_KEY;

    if (!apiKey) {
        console.log('[WordsAPI] No RAPIDAPI_KEY configured, using fallback');
        return null;
    }

    try {
        const response = await fetch(
            `https://wordsapiv1.p.rapidapi.com/words/${encodeURIComponent(word.toLowerCase())}`,
            {
                headers: {
                    'X-RapidAPI-Key': apiKey,
                    'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com',
                },
                signal: AbortSignal.timeout(5000),
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                console.log(`[WordsAPI] Word not found: ${word}`);
                return null;
            }
            console.error(`[WordsAPI] Error response: ${response.status}`);
            return null;
        }

        const data: WordsApiResponse = await response.json();

        if (data.syllables?.list && data.syllables.list.length > 0) {
            // WordsAPI returns lowercase syllables, preserve original case for first letter
            const syllables = data.syllables.list;

            // Capitalize first syllable if original word was capitalized
            if (word[0] === word[0].toUpperCase()) {
                syllables[0] = syllables[0].charAt(0).toUpperCase() + syllables[0].slice(1);
            }

            return syllables;
        }

        return null;
    } catch (error) {
        console.error(`[WordsAPI] Error fetching syllables for "${word}":`, error);
        return null;
    }
}

/**
 * Fetch syllables for a word - tries WordsAPI first, then falls back to algorithm
 */
export async function getSyllables(word: string): Promise<string[]> {
    // Try WordsAPI first (if configured)
    const apiSyllables = await fetchFromWordsApi(word);
    if (apiSyllables) {
        return apiSyllables;
    }

    // Fallback to algorithmic splitting
    console.log(`[Syllables] Using fallback algorithm for: ${word}`);
    return splitSyllablesFallback(word);
}

/**
 * Fetch syllables for multiple words in parallel with rate limiting
 */
export async function getSyllablesForWords(words: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    // Process in smaller batches to respect rate limits
    const batchSize = 3;
    const delayMs = 200; // Small delay between batches

    for (let i = 0; i < words.length; i += batchSize) {
        const batch = words.slice(i, i + batchSize);
        const promises = batch.map(async (word) => {
            const syllables = await getSyllables(word);
            results.set(word.toLowerCase(), syllables);
        });
        await Promise.all(promises);

        // Add small delay between batches to avoid rate limiting
        if (i + batchSize < words.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

/**
 * Check if WordsAPI is configured
 */
export function isWordsApiConfigured(): boolean {
    return !!process.env.RAPIDAPI_KEY;
}
