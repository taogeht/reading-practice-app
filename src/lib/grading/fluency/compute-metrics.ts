// Deterministic Whisper-output processor. Pure function — no I/O, no Claude.
// Produces the metrics that drive WCPM, the prosody scorer, and the composite
// fluency score. Re-uses the Wagner-Fischer alignment from ../align so the
// "correct words" count is consistent with what the rest of the pipeline sees.

import type { WhisperWord } from '../whisper-client';
import { tokenize } from '../align';

// Inter-word gaps at or above this threshold count as "long pauses." Tunable.
// At 1.5s, short hesitations (a quarter-second between words) are ignored, but
// the deliberate pauses that hurt phrasing get flagged.
export const LONG_PAUSE_THRESHOLD_MS = 1500;

// The punctuation set whose presence on the END of the word preceding a long
// pause makes that pause "phrase-respecting" rather than an intrusion. Comma
// is included even though many fluency rubrics treat it as borderline — it
// matches the prompt and lets us count pauses at appositive boundaries.
const PHRASE_END_PUNCT = new Set(['.', ',', '?', '!', ':', ';']);

export interface FluencyMetrics {
    durationSeconds: number;
    totalWords: number;
    correctWords: number;
    wcpm: number;
    accuracyPct: number;
    longPauseCount: number;
    intrusionPauseCount: number;
    pauseAtPunctuationPct: number;
    avgPauseMs: number;
    // Stored on analysis_json so backfills and prosody re-scoring don't need
    // to re-call Whisper. Each entry is a Whisper word with its start/end.
    wordTimings: Array<{ word: string; start: number; end: number }>;
}

export interface ComputeMetricsArgs {
    whisperWords: WhisperWord[];
    passageText: string;
    // Already-computed by the existing align()+summarize() pipeline. Avoids
    // re-running Wagner-Fischer here — pass breakdown.matched in.
    correctWords: number;
    durationSeconds: number;
}

export function computeMetrics({
    whisperWords,
    passageText,
    correctWords,
    durationSeconds,
}: ComputeMetricsArgs): FluencyMetrics {
    const totalWords = tokenize(passageText).length;
    const wcpm = durationSeconds > 0 ? (correctWords * 60) / durationSeconds : 0;
    const accuracyPct = totalWords > 0 ? (correctWords / totalWords) * 100 : 0;

    let longPauseCount = 0;
    let intrusionPauseCount = 0;
    let pauseAtPunctuation = 0;
    let totalPauseMs = 0;
    let pauseSamples = 0;

    for (let i = 0; i < whisperWords.length - 1; i++) {
        const here = whisperWords[i];
        const next = whisperWords[i + 1];
        const gapMs = Math.max(0, (next.start - here.end) * 1000);
        totalPauseMs += gapMs;
        pauseSamples++;

        if (gapMs >= LONG_PAUSE_THRESHOLD_MS) {
            longPauseCount++;
            // Strip whitespace then look at the final non-space char. Whisper
            // commonly includes a leading space on its word tokens (" hello")
            // so the trailing punctuation we care about is at end-of-string.
            const lastChar = here.word.trim().slice(-1);
            if (PHRASE_END_PUNCT.has(lastChar)) {
                pauseAtPunctuation++;
            } else {
                intrusionPauseCount++;
            }
        }
    }

    const pauseAtPunctuationPct =
        longPauseCount > 0 ? (pauseAtPunctuation / longPauseCount) * 100 : 0;
    const avgPauseMs = pauseSamples > 0 ? Math.round(totalPauseMs / pauseSamples) : 0;

    return {
        durationSeconds,
        totalWords,
        correctWords,
        wcpm: Math.round(wcpm * 100) / 100,
        accuracyPct: Math.round(accuracyPct * 100) / 100,
        longPauseCount,
        intrusionPauseCount,
        pauseAtPunctuationPct: Math.round(pauseAtPunctuationPct * 100) / 100,
        avgPauseMs,
        wordTimings: whisperWords.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    };
}
