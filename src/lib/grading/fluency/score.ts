// Composite fluency score 0–100. Weighting is tuned for Chinese L1 ESL
// learners — prosody (phrasing + smoothness, 45% combined) outweighs pace
// (15%) because prosody better predicts comprehension at this proficiency.
// Accuracy is the single biggest term (30%) because it's the most reliable
// signal; the rest are derived. Self-corrections add up to 10pts on top —
// we treat them as a positive monitoring signal, never a deduction.
//
// Bump FLUENCY_VERSION whenever the formula changes. Stored on each row so a
// future re-score sweep can target only rows below the current version.

export const FLUENCY_VERSION = 1;

const SELF_CORRECTION_POINTS_PER = 2;
const SELF_CORRECTION_MAX_BONUS = 10;

export interface ComputeFluencyScoreArgs {
    accuracyPct: number;
    phrasingScore: number; // 1–4
    smoothnessScore: number; // 1–4
    paceScore: number; // 1–4
    selfCorrectionCount: number;
}

// Map a 1–4 score onto 0–100 so the weighted sum stays linear. 1 → 0, 2 → 33,
// 3 → 67, 4 → 100.
function normalize1to4(score: number): number {
    return ((Math.max(1, Math.min(4, score)) - 1) / 3) * 100;
}

export function computeFluencyScore({
    accuracyPct,
    phrasingScore,
    smoothnessScore,
    paceScore,
    selfCorrectionCount,
}: ComputeFluencyScoreArgs): number {
    const bonus = Math.min(
        SELF_CORRECTION_MAX_BONUS,
        Math.max(0, selfCorrectionCount) * SELF_CORRECTION_POINTS_PER,
    );

    const raw =
        accuracyPct * 0.3 +
        normalize1to4(phrasingScore) * 0.25 +
        normalize1to4(smoothnessScore) * 0.2 +
        normalize1to4(paceScore) * 0.15 +
        bonus;

    return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}
