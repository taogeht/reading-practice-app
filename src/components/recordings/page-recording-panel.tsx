"use client";

// Per-page recording panel for the reading-passage reader. Shows
// attempts-used / 3, every attempt as an expandable card with
// transcript + word-level diff, and an inline recorder UI. Skipping
// is fine — the panel is purely additive.

import { useCallback, useEffect, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { StudentAttemptCard } from "@/components/student/student-attempt-card";

interface Attempt {
  id: string;
  attemptNumber: number;
  audioUrl: string;
  submittedAt: string;
  transcript: string | null;
  letterGrade: string | null;
  accuracyScore: number | null;
  wpmScore: number | null;
  analysisJson?: unknown;
}

interface PagePayload {
  pageNumber: number;
  attempts: Attempt[];
  best: {
    id: string;
    attemptNumber: number;
    letterGrade: string | null;
    accuracyScore: number | null;
    wpmScore: number | null;
  } | null;
}

interface PageRecordingPanelProps {
  passageId: string;
  pageNumber: number;
  maxAttempts?: number;
}

const DEFAULT_MAX = 3;
// Page text is short; 30 seconds is plenty for 2–5 sentences.
const MAX_DURATION_SEC = 30;

export function PageRecordingPanel({
  passageId,
  pageNumber,
  maxAttempts = DEFAULT_MAX,
}: PageRecordingPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<PagePayload | null>(null);
  // True once a recording is submitted and we're waiting for Whisper to
  // populate the grade. Stops on poll exit (success or timeout).
  const [grading, setGrading] = useState(false);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/student/reading/passages/${passageId}/recordings`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const body = (await res.json()) as { pages: PagePayload[] };
      const match = body.pages.find((p) => p.pageNumber === pageNumber);
      setPage(match ?? { pageNumber, attempts: [], best: null });
    } catch {
      setPage({ pageNumber, attempts: [], best: null });
    } finally {
      setLoading(false);
    }
  }, [passageId, pageNumber]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  // After a fresh attempt, the row exists with null grading columns.
  // Poll the recordings endpoint until the newest attempt for this page
  // has letterGrade non-null, or give up after ~20 seconds.
  const pollUntilGraded = useCallback(async () => {
    setGrading(true);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(
          `/api/student/reading/passages/${passageId}/recordings`,
        );
        if (res.ok) {
          const body = (await res.json()) as { pages: PagePayload[] };
          const match = body.pages.find((p) => p.pageNumber === pageNumber);
          if (match) {
            const latest = [...match.attempts].sort(
              (a, b) => b.attemptNumber - a.attemptNumber,
            )[0];
            if (latest && latest.letterGrade !== null) {
              setPage(match);
              setGrading(false);
              return;
            }
            // Surface the partial state so the user sees the attempt
            // even before the grade arrives.
            setPage(match);
          }
        }
      } catch {
        // ignore — try again
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    setGrading(false);
  }, [passageId, pageNumber]);

  const upload = useCallback(
    async (blob: Blob) => {
      const cleanMime = blob.type.split(";")[0].trim();
      const file = new File([blob], `page-${pageNumber}.webm`, { type: cleanMime });
      const fd = new FormData();
      fd.append("audio", file);
      try {
        const res = await fetch(
          `/api/student/reading/passages/${passageId}/pages/${pageNumber}/record`,
          { method: "POST", body: fd },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { success: false as const, error: body.error ?? `HTTP ${res.status}` };
        }
        const body = (await res.json()) as { recording: { id: string; audioUrl: string } };
        // Fire the poll without awaiting so the recorder can close itself
        // and the panel re-renders with a "Grading…" state.
        void pollUntilGraded();
        return {
          success: true as const,
          publicUrl: body.recording.audioUrl,
          key: body.recording.id,
        };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : "Upload failed",
        };
      }
    },
    [passageId, pageNumber, pollUntilGraded],
  );

  const attemptsUsed = page?.attempts.length ?? 0;
  const attemptsLeft = Math.max(maxAttempts - attemptsUsed, 0);
  const best = page?.best ?? null;
  const canRecord = attemptsLeft > 0;
  // Attempts come back from the API newest-first (sorted by attempt
  // number desc on the server). Reverse for display so the kid sees
  // their progression top-to-bottom.
  const attemptsAscending = page ? [...page.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber) : [];

  return (
    <div className="mt-3 mb-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Mic className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-gray-800">Record this page</span>
          {loading ? (
            <span className="text-xs text-gray-500">…</span>
          ) : (
            <span className="text-xs text-gray-500">
              {attemptsUsed} / {maxAttempts} attempts used
            </span>
          )}
          {grading && (
            <span className="text-xs text-blue-600 inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Grading…
            </span>
          )}
        </div>
        {best && best.letterGrade && (
          <div className="text-xs text-gray-700 inline-flex items-center gap-2">
            <span className="font-medium">Best: {best.letterGrade}</span>
            {best.accuracyScore != null && (
              <span className="text-gray-500">
                ({best.accuracyScore.toFixed(0)}% acc
                {best.wpmScore != null ? ` · ${best.wpmScore.toFixed(0)} wpm` : ""})
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!canRecord && !open}
          className="text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
        >
          {open ? "Hide recorder" : canRecord ? "Open recorder" : "No attempts left"}
        </button>
      </div>

      {/* Per-attempt cards. Each is tap-to-expand and shows the
          transcript + a word-level diff against the page text. Reusing
          the StudentAttemptCard pattern from the assignment flow keeps
          the highlighting style consistent for kids. */}
      {attemptsAscending.length > 0 && (
        <div className="mt-3 space-y-2">
          {attemptsAscending.map((a) => (
            <StudentAttemptCard
              key={a.id}
              attempt={{
                audioUrl: a.audioUrl,
                attemptNumber: a.attemptNumber,
                status: 'submitted',
                accuracyScore:
                  a.accuracyScore == null ? null : Math.round(a.accuracyScore),
                wpmScore: a.wpmScore == null ? null : Math.round(a.wpmScore),
                letterGrade: a.letterGrade,
                submittedAt: a.submittedAt,
                reviewedAt: null,
                teacherFeedback: null,
                teacherReplyAudioUrl: null,
                teacherReplyDurationSeconds: null,
                transcript: a.transcript,
                // The card narrowly types analysisJson; cast through
                // unknown because the page-recordings endpoint surfaces
                // it as `unknown` to avoid a duplicate type alias.
                analysisJson: a.analysisJson as never,
              }}
            />
          ))}
        </div>
      )}

      {open && canRecord && (
        <div className="mt-3">
          <AudioRecorder
            maxDurationSeconds={MAX_DURATION_SEC}
            showLivePreview={false}
            customUpload={upload}
            onRecordingComplete={(r) => {
              if (r.success) {
                // Recorder UI shows its own success state; we close the
                // panel after the poll resolves and the new grade is in.
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
