// Backfill Phase 7 fluency metrics for existing recordings + per-page rows.
// Recomputes everything that's deterministic from stored data (transcript +
// duration + passage text). Skips the Claude pass entirely — historical rows
// keep null teacher_summary / claude analysis JSON. That's the explicit
// tradeoff: re-Whispering audio to get word timestamps for prosody would
// 10x the cost vs the value.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-fluency-metrics.ts
//
// Idempotent: processes rows whose fluency_version is null or below the current
// FLUENCY_VERSION, then stamps them to the current version — so a re-run after a
// completed pass finds nothing. Bump FLUENCY_VERSION and re-run to re-derive
// every row against a new formula.

import 'dotenv/config';
import { eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../src/lib/db';
import {
    assignments,
    passagePageRecordings,
    readingPassages,
    recordings,
    stories,
    storyPages,
} from '../src/lib/db/schema';
import { gradeRecording } from '../src/lib/grading/align';
import {
    classifyWcpm,
    computeFluencyScore,
    computeMetrics,
    DEFAULT_READING_LEVEL,
    FLUENCY_VERSION,
    scoreProsody,
} from '../src/lib/grading/fluency';

function parseStoryLevel(raw: string | null): number | null {
    if (!raw) return null;
    const m = raw.match(/[1-5]/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// Pull word timestamps out of a stored analysis_json blob. Rows analyzed by the
// live pipeline carry these; rows from the very first backfill don't. When they
// exist, the WCPM speech-span fix and pause stats become accurate; when they
// don't, computeMetrics falls back to the clip duration (WCPM unchanged).
type StoredTiming = { word: string; start: number; end: number };
function storedWordTimings(analysisJson: unknown): StoredTiming[] {
    const wt = (analysisJson as { wordTimings?: unknown } | null)?.wordTimings;
    if (!Array.isArray(wt)) return [];
    return wt.filter(
        (w): w is StoredTiming =>
            !!w &&
            typeof w === 'object' &&
            typeof (w as StoredTiming).start === 'number' &&
            typeof (w as StoredTiming).end === 'number',
    );
}

interface BackfillStats {
    table: string;
    candidates: number;
    backfilled: number;
    skipped: number;
    errors: number;
}

async function backfillRecordings(): Promise<BackfillStats> {
    const stats: BackfillStats = {
        table: 'recordings',
        candidates: 0,
        backfilled: 0,
        skipped: 0,
        errors: 0,
    };

    const rows = await db
        .select({
            id: recordings.id,
            transcript: recordings.transcript,
            duration: recordings.audioDurationSeconds,
            analysisJson: recordings.analysisJson,
            storyText: stories.content,
            readingLevelRaw: stories.readingLevel,
        })
        .from(recordings)
        .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
        .innerJoin(stories, eq(assignments.storyId, stories.id))
        .where(
            or(
                isNull(recordings.fluencyVersion),
                lt(recordings.fluencyVersion, FLUENCY_VERSION),
            ),
        );

    stats.candidates = rows.length;

    for (const row of rows) {
        if (!row.transcript || !row.duration || !row.storyText) {
            stats.skipped++;
            continue;
        }
        try {
            const grade = gradeRecording({
                storyText: row.storyText,
                transcript: row.transcript,
                durationSec: row.duration,
            });
            // Use stored word timings when present — gives an accurate
            // speech-span WCPM and real pause stats. Rows without them fall back
            // to the clip duration and zero pauses (handled by computeMetrics).
            const timings = storedWordTimings(row.analysisJson);
            const metrics = computeMetrics({
                whisperWords: timings,
                passageText: row.storyText,
                correctWords: grade.breakdown.matched,
                durationSeconds: row.duration,
            });
            const level = parseStoryLevel(row.readingLevelRaw);
            const eslBand = level != null ? classifyWcpm(metrics.wcpm, level, true) : null;
            const nativeBand = level != null ? classifyWcpm(metrics.wcpm, level, false) : null;
            // Prosody + score compute even when the level is unknown (pace falls
            // back to a default level); the bands above stay null.
            const paceBand = classifyWcpm(metrics.wcpm, level ?? DEFAULT_READING_LEVEL, true);
            const prosody = scoreProsody(metrics, paceBand);
            const fluencyScore = computeFluencyScore({
                accuracyPct: metrics.accuracyPct,
                phrasingScore: prosody.phrasingScore,
                smoothnessScore: prosody.smoothnessScore,
                paceScore: prosody.paceScore,
                selfCorrectionCount: 0,
            });

            await db
                .update(recordings)
                .set({
                    wcpm: metrics.wcpm.toFixed(2),
                    totalWords: metrics.totalWords,
                    correctWords: metrics.correctWords,
                    substitutionCount: grade.breakdown.substituted,
                    omissionCount: grade.breakdown.missed,
                    insertionCount: grade.breakdown.inserted,
                    eslWcpmBand: eslBand,
                    nativeWcpmBand: nativeBand,
                    passageLevel: level,
                    phrasingScore: prosody.phrasingScore,
                    smoothnessScore: prosody.smoothnessScore,
                    paceScore: prosody.paceScore,
                    fluencyScore: fluencyScore.toFixed(1),
                    fluencyVersion: FLUENCY_VERSION,
                    // Only refresh pause stats when we actually recomputed them
                    // from real timings — never zero out a timed row's data.
                    ...(timings.length > 0
                        ? {
                              longPauseCount: metrics.longPauseCount,
                              intrusionPauseCount: metrics.intrusionPauseCount,
                              pauseAtPunctuationPct: metrics.pauseAtPunctuationPct.toFixed(2),
                              avgPauseMs: metrics.avgPauseMs,
                          }
                        : {}),
                })
                .where(eq(recordings.id, row.id));
            stats.backfilled++;
        } catch (err) {
            stats.errors++;
            console.error(`[backfill recordings] ${row.id}:`, err instanceof Error ? err.message : err);
        }
    }

    return stats;
}

async function backfillPageRecordings(): Promise<BackfillStats> {
    const stats: BackfillStats = {
        table: 'passage_page_recordings',
        candidates: 0,
        backfilled: 0,
        skipped: 0,
        errors: 0,
    };

    const rows = await db
        .select({
            id: passagePageRecordings.id,
            transcript: passagePageRecordings.transcript,
            duration: passagePageRecordings.audioDurationSeconds,
            analysisJson: passagePageRecordings.analysisJson,
            pageText: storyPages.text,
            readingLevel: readingPassages.readingLevel,
        })
        .from(passagePageRecordings)
        .innerJoin(storyPages, eq(passagePageRecordings.pageId, storyPages.id))
        .innerJoin(readingPassages, eq(passagePageRecordings.passageId, readingPassages.id))
        .where(
            or(
                isNull(passagePageRecordings.fluencyVersion),
                lt(passagePageRecordings.fluencyVersion, FLUENCY_VERSION),
            ),
        );

    stats.candidates = rows.length;

    for (const row of rows) {
        if (!row.transcript || !row.duration || !row.pageText) {
            stats.skipped++;
            continue;
        }
        try {
            const durationSec = Number(row.duration);
            const grade = gradeRecording({
                storyText: row.pageText,
                transcript: row.transcript,
                durationSec,
            });
            const timings = storedWordTimings(row.analysisJson);
            const metrics = computeMetrics({
                whisperWords: timings,
                passageText: row.pageText,
                correctWords: grade.breakdown.matched,
                durationSeconds: durationSec,
            });
            const level = row.readingLevel;
            const eslBand = level != null ? classifyWcpm(metrics.wcpm, level, true) : null;
            const nativeBand = level != null ? classifyWcpm(metrics.wcpm, level, false) : null;
            const paceBand = classifyWcpm(metrics.wcpm, level ?? DEFAULT_READING_LEVEL, true);
            const prosody = scoreProsody(metrics, paceBand);
            const fluencyScore = computeFluencyScore({
                accuracyPct: metrics.accuracyPct,
                phrasingScore: prosody.phrasingScore,
                smoothnessScore: prosody.smoothnessScore,
                paceScore: prosody.paceScore,
                selfCorrectionCount: 0,
            });

            await db
                .update(passagePageRecordings)
                .set({
                    wcpm: metrics.wcpm.toFixed(2),
                    totalWords: metrics.totalWords,
                    correctWords: metrics.correctWords,
                    substitutionCount: grade.breakdown.substituted,
                    omissionCount: grade.breakdown.missed,
                    insertionCount: grade.breakdown.inserted,
                    eslWcpmBand: eslBand,
                    nativeWcpmBand: nativeBand,
                    passageLevel: level,
                    phrasingScore: prosody.phrasingScore,
                    smoothnessScore: prosody.smoothnessScore,
                    paceScore: prosody.paceScore,
                    fluencyScore: fluencyScore.toFixed(1),
                    fluencyVersion: FLUENCY_VERSION,
                    ...(timings.length > 0
                        ? {
                              longPauseCount: metrics.longPauseCount,
                              intrusionPauseCount: metrics.intrusionPauseCount,
                              pauseAtPunctuationPct: metrics.pauseAtPunctuationPct.toFixed(2),
                              avgPauseMs: metrics.avgPauseMs,
                          }
                        : {}),
                })
                .where(eq(passagePageRecordings.id, row.id));
            stats.backfilled++;
        } catch (err) {
            stats.errors++;
            console.error(`[backfill ppr] ${row.id}:`, err instanceof Error ? err.message : err);
        }
    }

    return stats;
}

async function main() {
    console.log('Backfilling fluency metrics for existing recordings...\n');

    const recStats = await backfillRecordings();
    console.log(`recordings: ${recStats.backfilled} backfilled, ${recStats.skipped} skipped (missing data), ${recStats.errors} errors of ${recStats.candidates} candidates\n`);

    const pageStats = await backfillPageRecordings();
    console.log(`passage_page_recordings: ${pageStats.backfilled} backfilled, ${pageStats.skipped} skipped, ${pageStats.errors} errors of ${pageStats.candidates} candidates\n`);

    console.log('Done.');
    process.exit(0);
}

main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
});
