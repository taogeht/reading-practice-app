"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RecordingAudioPlayer } from "@/components/recordings/recording-audio-player";
import {
  ChevronDown,
  ChevronRight,
  Mic,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface AnalysisJson {
  matched?: number;
  substituted?: number;
  missed?: number;
  inserted?: number;
  expectedWordCount?: number;
  transcribedWordCount?: number;
  accuracyScore?: number;
  letterGrade?: string;
  hallucinationSuspected?: boolean;
  expectedView?: { word: string; op: "match" | "sub" | "del"; heard?: string }[];
  heardView?: { word: string; op: "match" | "sub" | "ins"; expected?: string }[];
  durationSec?: number;
  processedAt?: string;
  error?: string;
}

export interface AttemptCardData {
  /** recordings.id — used to fetch the presigned download URL for
   *  playback. Optional only for back-compat with callers that
   *  haven't been updated to pass it; when missing, the audio
   *  player is hidden. */
  id?: string;
  /** Direct audio URL override. When set, the card plays this URL
   *  via a native <audio> element instead of calling the recordings
   *  presigned-URL endpoint. Used by the passage-page recording
   *  flow, which serves audio through the /api/audio/[...key]
   *  proxy and doesn't need a recordings.id. */
  audioUrl?: string;
  attemptNumber: number | null;
  status: "pending" | "reviewed" | "flagged" | "submitted";
  accuracyScore: number | null;
  wpmScore: number | null;
  letterGrade: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  teacherFeedback: string | null;
  teacherReplyAudioUrl: string | null;
  teacherReplyDurationSeconds: number | null;
  /** Stored duration for the seek bar before metadata loads. */
  audioDurationSeconds?: number | null;
  transcript: string | null;
  analysisJson: AnalysisJson | null;
  // Phase 7 fluency fields — student view shows WCPM + ESL band only.
  // Native band is NEVER surfaced to students (teacher-only diagnostic).
  wcpm?: number | null;
  fluencyScore?: number | null;
  eslWcpmBand?: 'concern' | 'developing' | 'on_target' | 'above_target' | null;
  phrasingScore?: number | null;
  smoothnessScore?: number | null;
  paceScore?: number | null;
}

// Kid-friendly band labels — no "concern" word on the student side. We frame
// everything as growth-oriented.
const STUDENT_BAND_LABEL: Record<'concern' | 'developing' | 'on_target' | 'above_target', string> = {
  concern: 'Keep practicing',
  developing: 'Getting there',
  on_target: 'Great job!',
  above_target: 'Awesome!',
};

const STUDENT_BAND_COLOR: Record<'concern' | 'developing' | 'on_target' | 'above_target', string> = {
  concern: 'bg-orange-100 text-orange-800 border-orange-300',
  developing: 'bg-amber-100 text-amber-800 border-amber-300',
  on_target: 'bg-green-100 text-green-800 border-green-300',
  above_target: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

function gradeColor(grade: string | null): string {
  if (!grade) return "bg-gray-100 text-gray-700";
  if (grade.startsWith("A")) return "bg-green-100 text-green-800 border-green-300";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (grade.startsWith("C")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (grade.startsWith("D")) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-red-100 text-red-800 border-red-300";
}

export function StudentAttemptCard({ attempt }: { attempt: AttemptCardData }) {
  const analysis = attempt.analysisJson;
  const hasAnalysis =
    !!analysis && (!!analysis.expectedView?.length || analysis.matched !== undefined);
  const hasFeedback = !!attempt.teacherFeedback || !!attempt.teacherReplyAudioUrl;
  // The student can play back their own audio whenever a recording id
  // or a direct audioUrl is on the card — independent of AI analysis /
  // teacher feedback, so even a still-pending submission opens to a
  // "listen back" view.
  const hasAudio = !!attempt.id || !!attempt.audioUrl;
  const expandable = hasAudio || hasAnalysis || !!attempt.transcript || hasFeedback;

  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={`w-full text-left px-2 py-2 flex items-center gap-1.5 flex-wrap ${
          expandable ? "cursor-pointer hover:bg-gray-50" : "cursor-default"
        }`}
        disabled={!expandable}
      >
        {expandable &&
          (open ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          ))}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
          Attempt #{attempt.attemptNumber}
        </Badge>
        {attempt.letterGrade && (
          <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0 h-5 font-bold">
            {attempt.letterGrade}
          </Badge>
        )}
        {attempt.accuracyScore !== null && (
          <Badge className="bg-green-600 text-[10px] px-1.5 py-0 h-5">
            {attempt.accuracyScore}%
          </Badge>
        )}
        {attempt.wcpm != null ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {attempt.wcpm} WCPM
          </Badge>
        ) : attempt.wpmScore !== null ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
            {attempt.wpmScore} WPM
          </Badge>
        ) : null}
        {attempt.eslWcpmBand && (
          <Badge className={`${STUDENT_BAND_COLOR[attempt.eslWcpmBand]} border text-[10px] px-1.5 py-0 h-5`}>
            {STUDENT_BAND_LABEL[attempt.eslWcpmBand]}
          </Badge>
        )}
        {hasFeedback && (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 h-5"
          >
            Feedback
          </Badge>
        )}
        {hasAnalysis && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-purple-700">
            <Sparkles className="w-3 h-3" />
            AI feedback
          </span>
        )}
      </button>

      {open && expandable && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-3 space-y-3">
          {hasAudio && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                <Mic className="w-3 h-3 text-gray-500" />
                Listen back to your recording
              </p>
              <div className="bg-white rounded p-2 border">
                {attempt.audioUrl ? (
                  <audio
                    controls
                    preload="none"
                    src={attempt.audioUrl}
                    className="w-full"
                  />
                ) : attempt.id ? (
                  <RecordingAudioPlayer
                    recordingId={attempt.id}
                    fallbackDurationSeconds={attempt.audioDurationSeconds ?? null}
                  />
                ) : null}
              </div>
            </div>
          )}

          {hasAnalysis && analysis && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-purple-900">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                AI feedback
              </div>

              <div className="flex flex-wrap gap-1.5">
                {attempt.letterGrade && (
                  <Badge
                    className={`${gradeColor(attempt.letterGrade)} border text-sm px-2 py-0.5`}
                  >
                    {attempt.letterGrade}
                  </Badge>
                )}
                {attempt.accuracyScore !== null && (
                  <Badge variant="outline" className="text-xs">
                    {attempt.accuracyScore}% accuracy
                  </Badge>
                )}
                {attempt.wpmScore !== null && (
                  <Badge variant="outline" className="text-xs">
                    {attempt.wpmScore} WPM
                  </Badge>
                )}
                {analysis.hallucinationSuspected && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                  >
                    Try recording again — we couldn&rsquo;t hear you well
                  </Badge>
                )}
              </div>

              <div className="text-[11px] text-gray-600">
                {analysis.matched ?? 0} correct ·{" "}
                {analysis.substituted ?? 0} mispronounced ·{" "}
                {analysis.missed ?? 0} skipped ·{" "}
                {analysis.inserted ?? 0} extra
              </div>

              {analysis.expectedView && analysis.expectedView.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-700 mb-1">
                    Story (with mistakes highlighted)
                  </h4>
                  <p className="text-sm leading-relaxed bg-white rounded p-3 border">
                    {analysis.expectedView.map((tok, i) => {
                      const sep = i > 0 ? " " : "";
                      if (tok.op === "match") {
                        return (
                          <span key={i}>
                            {sep}
                            {tok.word}
                          </span>
                        );
                      }
                      if (tok.op === "sub") {
                        return (
                          <span
                            key={i}
                            className="bg-yellow-200 text-yellow-900 rounded px-0.5"
                            title={`Heard: "${tok.heard ?? ""}"`}
                          >
                            {sep}
                            {tok.word}
                          </span>
                        );
                      }
                      return (
                        <span
                          key={i}
                          className="bg-red-100 text-red-700 line-through rounded px-0.5"
                          title="Skipped"
                        >
                          {sep}
                          {tok.word}
                        </span>
                      );
                    })}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-500">
                    <span>
                      <span className="bg-yellow-200 px-1 rounded">word</span> mispronounced
                    </span>
                    <span>
                      <span className="bg-red-100 line-through px-1 rounded">word</span> skipped
                    </span>
                  </div>
                </div>
              )}

              {attempt.transcript && (
                <div>
                  <h4 className="text-[11px] font-semibold text-gray-700 mb-1">
                    What we heard you say
                  </h4>
                  <p className="text-sm text-gray-800 bg-white rounded p-3 border whitespace-pre-wrap">
                    {attempt.transcript}
                  </p>
                </div>
              )}
            </div>
          )}

          {!hasAnalysis && attempt.transcript && (
            <div>
              <h4 className="text-[11px] font-semibold text-gray-700 mb-1">
                What we heard you say
              </h4>
              <p className="text-sm text-gray-800 bg-white rounded p-3 border whitespace-pre-wrap">
                {attempt.transcript}
              </p>
            </div>
          )}

          {!hasAnalysis && !attempt.transcript && analysis?.error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertCircle className="w-3.5 h-3.5" />
              We couldn&rsquo;t analyze this recording.
            </div>
          )}

          {hasFeedback && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded space-y-1.5">
              {attempt.teacherFeedback && (
                <p className="text-xs text-blue-900 leading-snug">
                  &ldquo;{attempt.teacherFeedback}&rdquo;
                </p>
              )}
              {attempt.teacherReplyAudioUrl && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-blue-700 flex items-center gap-1">
                    <Mic className="w-3 h-3" />
                    Voice message from your teacher
                  </p>
                  <audio
                    src={attempt.teacherReplyAudioUrl}
                    controls
                    className="w-full h-8"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
