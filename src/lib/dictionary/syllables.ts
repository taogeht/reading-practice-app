/**
 * Dictionary API client for fetching syllable data
 * Uses the Free Dictionary API: https://dictionaryapi.dev/
 */

interface DictionaryResponse {
    word: string;
    phonetic?: string;
    phonetics?: {
        text?: string;
        audio?: string;
    }[];
    meanings?: {
        partOfSpeech: string;
        definitions: {
            definition: string;
        }[];
    }[];
}

/**
 * Simple syllable splitting algorithm as fallback
 * Based on vowel patterns - not perfect but reasonable
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
    let vowelCount = 0;

    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const isVowel = vowels.includes(char.toLowerCase());

        current += char;

        if (isVowel) {
            vowelCount++;
        }

        // After we have at least one vowel and hit a consonant before another vowel
        if (vowelCount > 0 && !isVowel && i < word.length - 1) {
            const nextIsVowel = vowels.includes(word[i + 1].toLowerCase());
            if (nextIsVowel && current.length >= 2) {
                result.push(current);
                current = "";
                vowelCount = 0;
            }
        }
    }

    if (current) {
        result.push(current);
    }

    return result.length > 0 ? result : [word];
}

/**
 * Parse phonetic notation to extract syllables
 * Phonetics often use · or ˈ or ˌ to mark syllable boundaries
 */
function parsePhoneticToSyllables(phonetic: string, originalWord: string): string[] | null {
    // Remove IPA brackets
    let clean = phonetic.replace(/[\/\[\]]/g, '');

    // Common syllable separators in phonetic notation
    const separators = /[·ˈˌ.]/;

    if (separators.test(clean)) {
        // Split by separators
        const parts = clean.split(separators).filter(p => p.length > 0);
        if (parts.length > 1) {
            // Try to map phonetic parts back to original word
            // This is approximate - phonetic doesn't always match spelling
            return approximateSyllablesFromPhonetic(parts, originalWord);
        }
    }

    return null;
}

/**
 * Approximate syllable boundaries in the original word based on phonetic syllable count
 */
function approximateSyllablesFromPhonetic(phoneticParts: string[], originalWord: string): string[] {
    const syllableCount = phoneticParts.length;

    if (syllableCount === 1) {
        return [originalWord];
    }

    // Use vowel-based splitting but aim for the target count
    const vowels = "aeiouy";
    const word = originalWord.toLowerCase();

    // Find vowel positions
    const vowelPositions: number[] = [];
    for (let i = 0; i < word.length; i++) {
        if (vowels.includes(word[i])) {
            // Skip consecutive vowels (diphthongs)
            if (vowelPositions.length === 0 || i - vowelPositions[vowelPositions.length - 1] > 1) {
                vowelPositions.push(i);
            }
        }
    }

    // If we don't have enough vowels, fall back to even splitting
    if (vowelPositions.length < syllableCount) {
        return splitEvenly(originalWord, syllableCount);
    }

    // Try to split at consonants between vowels
    const result: string[] = [];
    let start = 0;

    for (let i = 0; i < syllableCount - 1 && i < vowelPositions.length - 1; i++) {
        // Find a good break point between this vowel and the next
        const currentVowel = vowelPositions[i];
        const nextVowel = vowelPositions[i + 1];

        // Break after the vowel, before the consonant cluster
        let breakPoint = currentVowel + 1;

        // If there are multiple consonants between vowels, split them
        if (nextVowel - currentVowel > 2) {
            breakPoint = Math.floor((currentVowel + nextVowel) / 2) + 1;
        }

        result.push(originalWord.slice(start, breakPoint));
        start = breakPoint;
    }

    // Add the remaining part
    if (start < originalWord.length) {
        result.push(originalWord.slice(start));
    }

    return result;
}

/**
 * Split a word into roughly even parts
 */
function splitEvenly(word: string, parts: number): string[] {
    const partLength = Math.ceil(word.length / parts);
    const result: string[] = [];

    for (let i = 0; i < word.length; i += partLength) {
        result.push(word.slice(i, Math.min(i + partLength, word.length)));
    }

    return result;
}

/**
 * Fetch syllables for a word from the Free Dictionary API
 */
export async function getSyllables(word: string): Promise<string[]> {
    try {
        const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
            {
                headers: { 'Accept': 'application/json' },
                // Don't wait too long
                signal: AbortSignal.timeout(5000)
            }
        );

        if (!response.ok) {
            console.log(`[Dictionary API] Word not found: ${word}, using fallback`);
            return splitSyllablesFallback(word);
        }

        const data: DictionaryResponse[] = await response.json();

        if (data && data.length > 0) {
            // Look for phonetic with syllable markers
            const entry = data[0];

            // Try main phonetic first
            if (entry.phonetic) {
                const syllables = parsePhoneticToSyllables(entry.phonetic, word);
                if (syllables && syllables.length > 1) {
                    return syllables;
                }
            }

            // Try phonetics array
            if (entry.phonetics) {
                for (const phonetic of entry.phonetics) {
                    if (phonetic.text) {
                        const syllables = parsePhoneticToSyllables(phonetic.text, word);
                        if (syllables && syllables.length > 1) {
                            return syllables;
                        }
                    }
                }
            }
        }

        // Couldn't parse syllables from phonetics, use fallback
        console.log(`[Dictionary API] No syllable data for: ${word}, using fallback`);
        return splitSyllablesFallback(word);

    } catch (error) {
        console.error(`[Dictionary API] Error fetching syllables for "${word}":`, error);
        return splitSyllablesFallback(word);
    }
}

/**
 * Fetch syllables for multiple words in parallel
 */
export async function getSyllablesForWords(words: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    // Process in parallel with a concurrency limit
    const batchSize = 5;
    for (let i = 0; i < words.length; i += batchSize) {
        const batch = words.slice(i, i + batchSize);
        const promises = batch.map(async (word) => {
            const syllables = await getSyllables(word);
            results.set(word.toLowerCase(), syllables);
        });
        await Promise.all(promises);
    }

    return results;
}
