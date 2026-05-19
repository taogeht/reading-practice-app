import { db } from '@/lib/db';
import {
  recordings,
  assignments,
  stories,
  passagePageRecordings,
  readingPassages,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { transcribeAudio, WhisperError } from './whisper-client';
import { gradeRecording } from './align';
import {
  analyzeWithClaude,
  classifyWcpm,
  computeFluencyScore,
  computeMetrics,
  FLUENCY_VERSION,
  scoreProsody,
  type ClaudeAnalysis,
  type FluencyMetrics,
  type WcpmBand,
} from './fluency';

// Read of the runtime feature flag. Belt-and-suspenders: even if a row exists
// with recording_mode='ai_graded', we don't burn Whisper minutes unless this
// is true. Setting ENABLE_AI_GRADING=false in prod stops billing immediately
// without a deploy.
export function aiGradingEnabled(): boolean {
  return process.env.ENABLE_AI_GRADING === 'true';
}

export interface AnalysisStored {
  recordingId: string;
  letterGrade: string | null;
  accuracyScore: number;
  wpmScore: number;
  wcpm: number | null;
  fluencyScore: number | null;
  eslWcpmBand: WcpmBand | null;
  hallucinationSuspected: boolean;
  error?: string;
}

interface RecordingContext {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
  // The reading level (1–5) of the story/passage. Drives WCPM band
  // classification — null skips the fluency pipeline silently.
  passageLevel: number | null;
}

// Pulls the full context needed to analyze one recording. Used by the
// re-analyze endpoint where we don't have the buffer in memory.
// Stories use a varchar(50) readingLevel (legacy free-text); reading_passages
// use a smallint. Best-effort parse: an integer 1-5 in the string drops in
// as the H&T grade key, anything else means null + skip band classification.
function parseStoryLevel(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/[1-5]/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

async function loadContextFromR2(recordingId: string): Promise<RecordingContext | null> {
  const rows = await db
    .select({
      recordingId: recordings.id,
      audioUrl: recordings.audioUrl,
      storyText: stories.content,
      readingLevelRaw: stories.readingLevel,
    })
    .from(recordings)
    .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
    .innerJoin(stories, eq(assignments.storyId, stories.id))
    .where(eq(recordings.id, recordingId))
    .limit(1);

  if (!rows.length) return null;
  const row = rows[0];

  // audioUrl is the proxy URL "/api/audio/<key>". Strip the prefix to get the
  // R2 object key.
  const key = row.audioUrl.replace(/^\/api\/audio\//, '');
  const obj = await r2Client.getObject(key);
  if (!obj || !obj.body) return null;

  const reader = obj.body.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const audioBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const audioMime = obj.contentType ?? 'audio/webm';
  const ext = key.split('.').pop() ?? 'webm';

  return {
    recordingId: row.recordingId,
    audioBuffer,
    audioMime,
    audioExtension: ext,
    storyText: row.storyText ?? '',
    passageLevel: parseStoryLevel(row.readingLevelRaw),
  };
}

async function persistFailure(recordingId: string, error: string): Promise<void> {
  await db
    .update(recordings)
    .set({
      analysisJson: {
        error,
        processedAt: new Date().toISOString(),
        model: 'whisper-1',
      },
      updatedAt: new Date(),
    })
    .where(eq(recordings.id, recordingId));
}

// Pure analyzer: Whisper → align → fluency pipeline → (optional Claude pass).
// No DB writes — both the recordings flow and the passage_page_recordings
// flow wrap this and persist into their own table. The fluency pipeline
// degrades gracefully: if Claude fails or is unconfigured, deterministic
// metrics (WCPM, bands, prosody scores) still land.
export interface RawAnalysis {
  transcript: string;
  durationSec: number;
  letterGrade: string | null;
  accuracyScore: number;
  wpmScore: number;
  hallucinationSuspected: boolean;
  analysisJson: Record<string, unknown>;
  // Phase 7 fluency fields. All nullable so a hallucinated transcript or a
  // missing readingLevel doesn't break the upload pipeline.
  wcpm: number | null;
  totalWords: number | null;
  correctWords: number | null;
  longPauseCount: number | null;
  intrusionPauseCount: number | null;
  pauseAtPunctuationPct: number | null;
  avgPauseMs: number | null;
  substitutionCount: number | null;
  omissionCount: number | null;
  insertionCount: number | null;
  selfCorrectionCount: number | null;
  eslWcpmBand: WcpmBand | null;
  nativeWcpmBand: WcpmBand | null;
  phrasingScore: number | null;
  smoothnessScore: number | null;
  paceScore: number | null;
  fluencyScore: number | null;
  fluencyVersion: number | null;
  teacherSummary: string | null;
}

export async function analyzeAudioBuffer(opts: {
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
  // readingLevel of the passage being read (1–5). Null only when the caller
  // can't determine it; falls back to skipping band classification.
  passageLevel: number | null;
}): Promise<RawAnalysis> {
  const filename = `recording.${opts.audioExtension}`;
  const whisper = await transcribeAudio(opts.audioBuffer, filename, opts.audioMime);
  const grade = gradeRecording({
    storyText: opts.storyText,
    transcript: whisper.text,
    durationSec: whisper.duration,
  });

  // Fluency pipeline. Skip entirely on hallucination (no point computing
  // WCPM on near-silent audio). Skip Claude when the analysis is shallow —
  // there's nothing to classify and the cost adds up over a class roster.
  let metrics: FluencyMetrics | null = null;
  let eslBand: WcpmBand | null = null;
  let nativeBand: WcpmBand | null = null;
  let prosody: ReturnType<typeof scoreProsody> | null = null;
  let claude: ClaudeAnalysis | null = null;
  let fluencyScore: number | null = null;

  if (!grade.hallucinationSuspected) {
    metrics = computeMetrics({
      whisperWords: whisper.words,
      passageText: opts.storyText,
      correctWords: grade.breakdown.matched,
      durationSeconds: whisper.duration,
    });

    if (opts.passageLevel != null) {
      eslBand = classifyWcpm(metrics.wcpm, opts.passageLevel, true);
      nativeBand = classifyWcpm(metrics.wcpm, opts.passageLevel, false);
      prosody = scoreProsody(metrics, eslBand);
    }

    // Claude call is best-effort. Failures stay null on the row.
    claude = await analyzeWithClaude({
      passageText: opts.storyText,
      transcript: whisper.text,
      metrics,
      whisperWords: whisper.words,
    });

    if (prosody) {
      const selfCorrections =
        claude?.errors.filter((e) => e.type === 'self_correction').length ?? 0;
      fluencyScore = computeFluencyScore({
        accuracyPct: metrics.accuracyPct,
        phrasingScore: prosody.phrasingScore,
        smoothnessScore: prosody.smoothnessScore,
        paceScore: prosody.paceScore,
        selfCorrectionCount: selfCorrections,
      });
    }
  }

  return {
    transcript: whisper.text,
    durationSec: whisper.duration,
    letterGrade: grade.letterGrade,
    accuracyScore: grade.accuracyScore,
    wpmScore: grade.wpmScore,
    hallucinationSuspected: grade.hallucinationSuspected,
    analysisJson: {
      ...grade.breakdown,
      durationSec: whisper.duration,
      model: 'whisper-1',
      processedAt: new Date().toISOString(),
      hallucinationSuspected: grade.hallucinationSuspected,
      wordTimings: metrics?.wordTimings ?? null,
      claude: claude
        ? {
            errors: claude.errors,
            prosody: claude.prosody,
            teacherSummary: claude.teacherSummary,
          }
        : null,
    },
    wcpm: metrics?.wcpm ?? null,
    totalWords: metrics?.totalWords ?? null,
    correctWords: metrics?.correctWords ?? null,
    longPauseCount: metrics?.longPauseCount ?? null,
    intrusionPauseCount: metrics?.intrusionPauseCount ?? null,
    pauseAtPunctuationPct: metrics?.pauseAtPunctuationPct ?? null,
    avgPauseMs: metrics?.avgPauseMs ?? null,
    substitutionCount: grade.breakdown.substituted,
    omissionCount: grade.breakdown.missed,
    insertionCount: grade.breakdown.inserted,
    selfCorrectionCount:
      claude?.errors.filter((e) => e.type === 'self_correction').length ?? null,
    eslWcpmBand: eslBand,
    nativeWcpmBand: nativeBand,
    phrasingScore: prosody?.phrasingScore ?? null,
    smoothnessScore: prosody?.smoothnessScore ?? null,
    paceScore: prosody?.paceScore ?? null,
    fluencyScore,
    fluencyVersion: metrics ? FLUENCY_VERSION : null,
    teacherSummary: claude?.teacherSummary ?? null,
  };
}

async function analyze(ctx: RecordingContext): Promise<AnalysisStored> {
  const raw = await analyzeAudioBuffer({
    audioBuffer: ctx.audioBuffer,
    audioMime: ctx.audioMime,
    audioExtension: ctx.audioExtension,
    storyText: ctx.storyText,
    passageLevel: ctx.passageLevel,
  });

  await db
    .update(recordings)
    .set({
      transcript: raw.transcript,
      letterGrade: raw.letterGrade,
      accuracyScore: raw.accuracyScore.toFixed(2),
      wpmScore: raw.wpmScore.toFixed(2),
      audioDurationSeconds: Math.round(raw.durationSec),
      analysisJson: raw.analysisJson,
      wcpm: raw.wcpm != null ? raw.wcpm.toFixed(2) : null,
      totalWords: raw.totalWords,
      correctWords: raw.correctWords,
      longPauseCount: raw.longPauseCount,
      intrusionPauseCount: raw.intrusionPauseCount,
      pauseAtPunctuationPct:
        raw.pauseAtPunctuationPct != null ? raw.pauseAtPunctuationPct.toFixed(2) : null,
      avgPauseMs: raw.avgPauseMs,
      substitutionCount: raw.substitutionCount,
      omissionCount: raw.omissionCount,
      insertionCount: raw.insertionCount,
      selfCorrectionCount: raw.selfCorrectionCount,
      eslWcpmBand: raw.eslWcpmBand,
      nativeWcpmBand: raw.nativeWcpmBand,
      passageLevel: ctx.passageLevel,
      phrasingScore: raw.phrasingScore,
      smoothnessScore: raw.smoothnessScore,
      paceScore: raw.paceScore,
      fluencyScore: raw.fluencyScore != null ? raw.fluencyScore.toFixed(1) : null,
      fluencyVersion: raw.fluencyVersion,
      teacherSummary: raw.teacherSummary,
      updatedAt: new Date(),
    })
    .where(eq(recordings.id, ctx.recordingId));

  return {
    recordingId: ctx.recordingId,
    letterGrade: raw.letterGrade,
    accuracyScore: raw.accuracyScore,
    wpmScore: raw.wpmScore,
    wcpm: raw.wcpm,
    fluencyScore: raw.fluencyScore,
    eslWcpmBand: raw.eslWcpmBand,
    hallucinationSuspected: raw.hallucinationSuspected,
  };
}

// Used by /api/recordings/upload — we already have the buffer.
export async function analyzeRecordingFromBuffer(opts: {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
  // Optional. When the caller doesn't pass it, we try to look it up via the
  // recording's join chain (recordings → assignments → stories). If the join
  // turns up nothing or the readingLevel string can't be parsed, fluency band
  // classification silently skips and the row carries null bands.
  passageLevel?: number | null;
}): Promise<AnalysisStored> {
  try {
    let level = opts.passageLevel ?? null;
    if (level == null) {
      const lookup = await db
        .select({ raw: stories.readingLevel })
        .from(recordings)
        .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
        .innerJoin(stories, eq(assignments.storyId, stories.id))
        .where(eq(recordings.id, opts.recordingId))
        .limit(1);
      level = parseStoryLevel(lookup[0]?.raw ?? null);
    }
    return await analyze({ ...opts, passageLevel: level });
  } catch (err) {
    const msg =
      err instanceof WhisperError
        ? `Whisper: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Unknown error during analysis';
    console.error('[analyzeRecordingFromBuffer]', opts.recordingId, msg);
    await persistFailure(opts.recordingId, msg).catch(() => {});
    return {
      recordingId: opts.recordingId,
      letterGrade: null,
      accuracyScore: 0,
      wpmScore: 0,
      wcpm: null,
      fluencyScore: null,
      eslWcpmBand: null,
      hallucinationSuspected: false,
      error: msg,
    };
  }
}

// Used by the teacher-facing "Re-analyze" endpoint.
export async function reanalyzeRecordingById(recordingId: string): Promise<AnalysisStored> {
  try {
    const ctx = await loadContextFromR2(recordingId);
    if (!ctx) {
      const msg = 'Recording or audio not found in R2';
      await persistFailure(recordingId, msg).catch(() => {});
      return {
        recordingId,
        letterGrade: null,
        accuracyScore: 0,
        wpmScore: 0,
        wcpm: null,
        fluencyScore: null,
        eslWcpmBand: null,
        hallucinationSuspected: false,
        error: msg,
      };
    }
    return await analyze(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[reanalyzeRecordingById]', recordingId, msg);
    await persistFailure(recordingId, msg).catch(() => {});
    return {
      recordingId,
      letterGrade: null,
      accuracyScore: 0,
      wpmScore: 0,
      wcpm: null,
      fluencyScore: null,
      eslWcpmBand: null,
      hallucinationSuspected: false,
      error: msg,
    };
  }
}

// Fire-and-forget wrapper. Does NOT await on caller side. Errors are caught
// and persisted to the recording's analysis_json so the teacher UI can surface
// them and offer Re-analyze.
export function analyzeRecordingInBackground(opts: {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
  passageLevel?: number | null;
}): void {
  // Use queueMicrotask + an async IIFE so we return immediately. Vercel
  // serverless functions may be killed after the response is sent — see
  // failure-mode notes in the plan; the re-analyze button is the recovery.
  queueMicrotask(() => {
    void analyzeRecordingFromBuffer(opts);
  });
}

// -------------------------------------------------------------
// Passage-page recordings — sibling pipeline writing to the new
// passage_page_recordings table.
// -------------------------------------------------------------

async function persistPageFailure(recordingId: string, error: string): Promise<void> {
  await db
    .update(passagePageRecordings)
    .set({
      analysisJson: {
        error,
        processedAt: new Date().toISOString(),
        model: 'whisper-1',
      },
      updatedAt: new Date(),
    })
    .where(eq(passagePageRecordings.id, recordingId));
}

export async function analyzePageRecordingFromBuffer(opts: {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  pageText: string;
  // Optional. When not passed we look it up via the passage_page_recordings →
  // reading_passages join. The cheap fallback keeps existing callers working
  // without each having to fetch the level too.
  passageLevel?: number | null;
}): Promise<AnalysisStored> {
  try {
    let level = opts.passageLevel ?? null;
    if (level == null) {
      const lookup = await db
        .select({ rl: readingPassages.readingLevel })
        .from(passagePageRecordings)
        .innerJoin(readingPassages, eq(passagePageRecordings.passageId, readingPassages.id))
        .where(eq(passagePageRecordings.id, opts.recordingId))
        .limit(1);
      level = lookup[0]?.rl ?? null;
    }

    const raw = await analyzeAudioBuffer({
      audioBuffer: opts.audioBuffer,
      audioMime: opts.audioMime,
      audioExtension: opts.audioExtension,
      storyText: opts.pageText,
      passageLevel: level,
    });

    await db
      .update(passagePageRecordings)
      .set({
        transcript: raw.transcript,
        letterGrade: raw.letterGrade,
        accuracyScore: raw.accuracyScore.toFixed(2),
        wpmScore: raw.wpmScore.toFixed(2),
        audioDurationSeconds: raw.durationSec.toFixed(2),
        analysisJson: raw.analysisJson,
        wcpm: raw.wcpm != null ? raw.wcpm.toFixed(2) : null,
        totalWords: raw.totalWords,
        correctWords: raw.correctWords,
        longPauseCount: raw.longPauseCount,
        intrusionPauseCount: raw.intrusionPauseCount,
        pauseAtPunctuationPct:
          raw.pauseAtPunctuationPct != null ? raw.pauseAtPunctuationPct.toFixed(2) : null,
        avgPauseMs: raw.avgPauseMs,
        substitutionCount: raw.substitutionCount,
        omissionCount: raw.omissionCount,
        insertionCount: raw.insertionCount,
        selfCorrectionCount: raw.selfCorrectionCount,
        eslWcpmBand: raw.eslWcpmBand,
        nativeWcpmBand: raw.nativeWcpmBand,
        passageLevel: level,
        phrasingScore: raw.phrasingScore,
        smoothnessScore: raw.smoothnessScore,
        paceScore: raw.paceScore,
        fluencyScore: raw.fluencyScore != null ? raw.fluencyScore.toFixed(1) : null,
        fluencyVersion: raw.fluencyVersion,
        teacherSummary: raw.teacherSummary,
        updatedAt: new Date(),
      })
      .where(eq(passagePageRecordings.id, opts.recordingId));

    return {
      recordingId: opts.recordingId,
      letterGrade: raw.letterGrade,
      accuracyScore: raw.accuracyScore,
      wpmScore: raw.wpmScore,
      wcpm: raw.wcpm,
      fluencyScore: raw.fluencyScore,
      eslWcpmBand: raw.eslWcpmBand,
      hallucinationSuspected: raw.hallucinationSuspected,
    };
  } catch (err) {
    const msg =
      err instanceof WhisperError
        ? `Whisper: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'Unknown error during analysis';
    console.error('[analyzePageRecordingFromBuffer]', opts.recordingId, msg);
    await persistPageFailure(opts.recordingId, msg).catch(() => {});
    return {
      recordingId: opts.recordingId,
      letterGrade: null,
      accuracyScore: 0,
      wpmScore: 0,
      wcpm: null,
      fluencyScore: null,
      eslWcpmBand: null,
      hallucinationSuspected: false,
      error: msg,
    };
  }
}

export function analyzePageRecordingInBackground(opts: {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  pageText: string;
  passageLevel?: number | null;
}): void {
  queueMicrotask(() => {
    void analyzePageRecordingFromBuffer(opts);
  });
}
