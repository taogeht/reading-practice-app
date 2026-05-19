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
// Idempotent: rows with wcpm IS NOT NULL are skipped. Re-running only picks
// up still-null rows.

import 'dotenv/config';
import { eq, isNull } from 'drizzle-orm';
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
            storyText: stories.content,
            readingLevelRaw: stories.readingLevel,
        })
        .from(recordings)
        .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
        .innerJoin(stories, eq(assignments.storyId, stories.id))
        .where(isNull(recordings.wcpm));

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
            // Historical rows don't have word timestamps stored, so pause stats
            // come out as zeros. Pass an empty whisperWords array — the metrics
            // function handles it (no inter-word gaps to walk).
            const metrics = computeMetrics({
                whisperWords: [],
                passageText: row.storyText,
                correctWords: grade.breakdown.matched,
                durationSeconds: row.duration,
            });
            const level = parseStoryLevel(row.readingLevelRaw);
            const eslBand = level != null ? classifyWcpm(metrics.wcpm, level, true) : null;
            const nativeBand = level != null ? classifyWcpm(metrics.wcpm, level, false) : null;
            const prosody = level != null && eslBand ? scoreProsody(metrics, eslBand) : null;
            const fluencyScore = prosody
                ? computeFluencyScore({
                      accuracyPct: metrics.accuracyPct,
                      phrasingScore: prosody.phrasingScore,
                      smoothnessScore: prosody.smoothnessScore,
                      paceScore: prosody.paceScore,
                      selfCorrectionCount: 0,
                  })
                : null;

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
                    phrasingScore: prosody?.phrasingScore ?? null,
                    smoothnessScore: prosody?.smoothnessScore ?? null,
                    paceScore: prosody?.paceScore ?? null,
                    fluencyScore: fluencyScore != null ? fluencyScore.toFixed(1) : null,
                    fluencyVersion: FLUENCY_VERSION,
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
            pageText: storyPages.text,
            readingLevel: readingPassages.readingLevel,
        })
        .from(passagePageRecordings)
        .innerJoin(storyPages, eq(passagePageRecordings.pageId, storyPages.id))
        .innerJoin(readingPassages, eq(passagePageRecordings.passageId, readingPassages.id))
        .where(isNull(passagePageRecordings.wcpm));

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
            const metrics = computeMetrics({
                whisperWords: [],
                passageText: row.pageText,
                correctWords: grade.breakdown.matched,
                durationSeconds: durationSec,
            });
            const level = row.readingLevel;
            const eslBand = level != null ? classifyWcpm(metrics.wcpm, level, true) : null;
            const nativeBand = level != null ? classifyWcpm(metrics.wcpm, level, false) : null;
            const prosody = level != null && eslBand ? scoreProsody(metrics, eslBand) : null;
            const fluencyScore = prosody
                ? computeFluencyScore({
                      accuracyPct: metrics.accuracyPct,
                      phrasingScore: prosody.phrasingScore,
                      smoothnessScore: prosody.smoothnessScore,
                      paceScore: prosody.paceScore,
                      selfCorrectionCount: 0,
                  })
                : null;

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
                    phrasingScore: prosody?.phrasingScore ?? null,
                    smoothnessScore: prosody?.smoothnessScore ?? null,
                    paceScore: prosody?.paceScore ?? null,
                    fluencyScore: fluencyScore != null ? fluencyScore.toFixed(1) : null,
                    fluencyVersion: FLUENCY_VERSION,
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
