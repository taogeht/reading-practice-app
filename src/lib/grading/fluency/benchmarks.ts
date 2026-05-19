// Hasbrouck & Tindal 2017 50th-percentile WCPM norms, mapped to the
// app's readingLevel smallint (1=Emerging through 5=Confident). ESL bands
// subtract a fixed offset — research consensus for Chinese L1 learners.
// To tune per-class later, factor `eslOffset` into a per-class settings row;
// the function already takes a boolean toggle and is the only consumer of
// the constant, so the surface is small.

// Named tuning constants — both are documented "starting points" and can move
// once we have real class data. The offset is from research on Chinese L1
// English readers; the per-level concern thresholds are derived from the
// 10th-percentile H&T columns.
export const ESL_WCPM_OFFSET = 25;

// 50th-percentile WCPM, spring administration, per H&T 2017. Key is the app's
// readingLevel column (1..5). Level 1 (Emerging / Starter) uses the Grade 1
// spring number; we don't bench kindergarten in this product.
export const NATIVE_WCPM_50TH: Record<number, number> = {
    1: 53,
    2: 53,
    3: 89,
    4: 107,
    5: 123,
};

// Threshold below which a reader is flagged as "concern" (~10th percentile in
// H&T). Same key as NATIVE_WCPM_50TH. Lowered slightly for L1 grade 1 to
// avoid false alarms on early readers.
export const NATIVE_WCPM_CONCERN: Record<number, number> = {
    1: 15,
    2: 15,
    3: 40,
    4: 55,
    5: 65,
};

export type WcpmBand = 'concern' | 'developing' | 'on_target' | 'above_target';

// Returns the highest readingLevel ≤ requested that has a norm entry. If the
// caller passes 99, we fall back to the top defined level rather than 0.
function nearestLevelKey(readingLevel: number): number {
    const known = Object.keys(NATIVE_WCPM_50TH).map(Number).sort((a, b) => a - b);
    let best = known[0];
    for (const k of known) {
        if (k <= readingLevel) best = k;
    }
    return best;
}

export function classifyWcpm(
    wcpm: number,
    readingLevel: number,
    eslAdjusted: boolean,
): WcpmBand {
    const key = nearestLevelKey(readingLevel);
    const native50 = NATIVE_WCPM_50TH[key];
    const concern = NATIVE_WCPM_CONCERN[key];
    const target = eslAdjusted ? native50 - ESL_WCPM_OFFSET : native50;

    // Band thresholds (matches the build prompt). The "developing" floor is
    // pinned to the concern threshold so a kid below the H&T 10th never lands
    // higher than 'developing' even with ESL adjustment.
    const concernThreshold = eslAdjusted ? Math.max(0, concern - ESL_WCPM_OFFSET) : concern;
    if (wcpm < concernThreshold) return 'concern';
    if (wcpm < target - 15) return 'developing';
    if (wcpm <= target + 20) return 'on_target';
    return 'above_target';
}
