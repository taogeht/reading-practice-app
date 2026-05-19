// Barrel for the fluency analysis pipeline. Import from this rather than
// reaching into individual files — keeps the public surface stable if we
// rearrange internals.

export { computeMetrics, LONG_PAUSE_THRESHOLD_MS } from './compute-metrics';
export type { FluencyMetrics, ComputeMetricsArgs } from './compute-metrics';

export {
    classifyWcpm,
    ESL_WCPM_OFFSET,
    NATIVE_WCPM_50TH,
    NATIVE_WCPM_CONCERN,
} from './benchmarks';
export type { WcpmBand } from './benchmarks';

export { scoreProsody } from './prosody';
export type { ProsodyScore, ProsodyScores } from './prosody';

export { computeFluencyScore, FLUENCY_VERSION } from './score';
export type { ComputeFluencyScoreArgs } from './score';

export { analyzeWithClaude } from './claude-analyzer';
export type {
    ClaudeAnalysis,
    ClaudeError,
    ClaudeProsody,
    AnalyzeWithClaudeArgs,
} from './claude-analyzer';
