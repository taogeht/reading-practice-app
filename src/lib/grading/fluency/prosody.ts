// MDFS-aligned 1–4 prosody scores derived from the deterministic metrics.
// These are not full MDFS — that requires a human rater for expression and
// volume. Phrasing and smoothness come straight from pause statistics;
// pace mirrors the ESL band so a slow-but-on-track reader (band='developing')
// gets a 2, not the same score as a true 'concern' reader.

import type { FluencyMetrics } from './compute-metrics';
import type { WcpmBand } from './benchmarks';

export type ProsodyScore = 1 | 2 | 3 | 4;

export interface ProsodyScores {
    phrasingScore: ProsodyScore;
    smoothnessScore: ProsodyScore;
    paceScore: ProsodyScore;
}

// Pace mirrors the ESL band 1:1. We want a Mandarin-L1 child who reads slowly
// but on-target for ESL to score 3 here, not 1 — the composite fluency score
// already weights pace at only 15%, but using ESL bands keeps the rubric
// honest about what "good pace" means for our students.
const PACE_BY_BAND: Record<WcpmBand, ProsodyScore> = {
    concern: 1,
    developing: 2,
    on_target: 3,
    above_target: 4,
};

export function scoreProsody(metrics: FluencyMetrics, eslBand: WcpmBand): ProsodyScores {
    // Phrasing: pauses at punctuation (good) vs intrusion pauses (bad). The
    // intrusion count acts as a tiebreaker — a kid with 70% pauses at
    // punctuation but 8 intrusions still gets phrasing=2, not 3.
    let phrasing: ProsodyScore;
    if (metrics.pauseAtPunctuationPct > 75 && metrics.intrusionPauseCount <= 2) {
        phrasing = 4;
    } else if (metrics.pauseAtPunctuationPct > 50 && metrics.intrusionPauseCount <= 5) {
        phrasing = 3;
    } else if (metrics.pauseAtPunctuationPct > 25) {
        phrasing = 2;
    } else {
        phrasing = 1;
    }

    // Smoothness: long pauses normalized per 100 passage words. For a 50-word
    // passage with 4 long pauses that's 8 per 100 — band 2. The math handles
    // zero-word passages (shouldn't happen) by short-circuiting to 4.
    const per100 =
        metrics.totalWords > 0 ? (metrics.longPauseCount * 100) / metrics.totalWords : 0;
    let smoothness: ProsodyScore;
    if (per100 > 15) smoothness = 1;
    else if (per100 > 8) smoothness = 2;
    else if (per100 > 3) smoothness = 3;
    else smoothness = 4;

    return {
        phrasingScore: phrasing,
        smoothnessScore: smoothness,
        paceScore: PACE_BY_BAND[eslBand],
    };
}
