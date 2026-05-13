import { db } from '@/lib/db';
import { recordings, assignments, stories, passagePageRecordings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { transcribeAudio, WhisperError } from './whisper-client';
import { gradeRecording } from './align';

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
  hallucinationSuspected: boolean;
  error?: string;
}

interface RecordingContext {
  recordingId: string;
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
}

// Pulls the full context needed to analyze one recording. Used by the
// re-analyze endpoint where we don't have the buffer in memory.
async function loadContextFromR2(recordingId: string): Promise<RecordingContext | null> {
  const rows = await db
    .select({
      recordingId: recordings.id,
      audioUrl: recordings.audioUrl,
      storyText: stories.content,
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

// Pure analyzer: Whisper + grade + assemble the analysis_json blob. No DB
// writes — both the recordings flow and the passage_page_recordings flow
// wrap this and persist into their own table.
export interface RawAnalysis {
  transcript: string;
  durationSec: number;
  letterGrade: string | null;
  accuracyScore: number;
  wpmScore: number;
  hallucinationSuspected: boolean;
  analysisJson: Record<string, unknown>;
}

export async function analyzeAudioBuffer(opts: {
  audioBuffer: Buffer;
  audioMime: string;
  audioExtension: string;
  storyText: string;
}): Promise<RawAnalysis> {
  const filename = `recording.${opts.audioExtension}`;
  const whisper = await transcribeAudio(opts.audioBuffer, filename, opts.audioMime);
  const grade = gradeRecording({
    storyText: opts.storyText,
    transcript: whisper.text,
    durationSec: whisper.duration,
  });
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
    },
  };
}

async function analyze(ctx: RecordingContext): Promise<AnalysisStored> {
  const raw = await analyzeAudioBuffer({
    audioBuffer: ctx.audioBuffer,
    audioMime: ctx.audioMime,
    audioExtension: ctx.audioExtension,
    storyText: ctx.storyText,
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
      updatedAt: new Date(),
    })
    .where(eq(recordings.id, ctx.recordingId));

  return {
    recordingId: ctx.recordingId,
    letterGrade: raw.letterGrade,
    accuracyScore: raw.accuracyScore,
    wpmScore: raw.wpmScore,
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
}): Promise<AnalysisStored> {
  try {
    return await analyze(opts);
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
}): Promise<AnalysisStored> {
  try {
    const raw = await analyzeAudioBuffer({
      audioBuffer: opts.audioBuffer,
      audioMime: opts.audioMime,
      audioExtension: opts.audioExtension,
      storyText: opts.pageText,
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
        updatedAt: new Date(),
      })
      .where(eq(passagePageRecordings.id, opts.recordingId));

    return {
      recordingId: opts.recordingId,
      letterGrade: raw.letterGrade,
      accuracyScore: raw.accuracyScore,
      wpmScore: raw.wpmScore,
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
}): void {
  queueMicrotask(() => {
    void analyzePageRecordingFromBuffer(opts);
  });
}
