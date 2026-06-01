'use client';

import { Mic, ChevronRight } from 'lucide-react';
import { RecordingAudioPlayer } from '@/components/recordings/recording-audio-player';
import { ReadAloudLabel } from './read-aloud-label';
import { UI_STRINGS } from '@/lib/i18n/ui-strings';

export type LatestRecording = {
  id: string;
  assignmentTitle: string;
  storyTitle: string;
  letterGrade: string | null;
  bestScore: number | null;
  hasFeedback: boolean;
  audioDurationSeconds: number | null;
};

// Surfaces the child's most recent recording with a one-tap play button right
// on the landing surface (no expanding a buried collapsible). Self-only audio —
// RecordingAudioPlayer fetches an auth-gated presigned URL per recording id.
export function LatestRecordingCard({
  recording,
  onSeeAll,
}: {
  recording: LatestRecording | null;
  onSeeAll: () => void;
}) {
  if (!recording) {
    return (
      <section className="kid-rise rounded-3xl border-2 border-violet-100 bg-white/70 p-5 text-center">
        <div className="text-4xl mb-1" aria-hidden>🎙️</div>
        <ReadAloudLabel id="latest.none" size="md" tone="violet" />
      </section>
    );
  }

  return (
    <section className="kid-rise rounded-3xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 shadow-[0_8px_0_rgba(139,92,246,0.15)]">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-violet-500 text-white shrink-0" aria-hidden>
            <Mic className="w-5 h-5" />
          </span>
          <ReadAloudLabel id="latest.title" size="md" tone="violet" />
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-100 transition-colors"
        >
          {UI_STRINGS['latest.more'].en}
          <span lang="zh-Hant" className="font-[family-name:var(--font-kid-zh)] text-violet-400 text-xs">
            {UI_STRINGS['latest.more'].zh}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 border border-violet-100">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-kid-display)] font-semibold text-slate-800 truncate">
              {recording.assignmentTitle}
            </p>
            <p className="text-sm text-slate-500 truncate">{recording.storyTitle}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {recording.letterGrade && (
              <span className="rounded-full bg-violet-600 text-white text-xs font-bold px-2 py-0.5">
                {recording.letterGrade}
              </span>
            )}
            {recording.bestScore != null && (
              <span className="rounded-full bg-emerald-500 text-white text-xs font-bold px-2 py-0.5">
                {recording.bestScore}%
              </span>
            )}
            {recording.hasFeedback && (
              <span className="rounded-full bg-sky-100 text-sky-700 text-xs font-semibold px-2 py-0.5">
                {UI_STRINGS['status.feedback'].en}
              </span>
            )}
          </div>
        </div>
        <RecordingAudioPlayer
          recordingId={recording.id}
          fallbackDurationSeconds={recording.audioDurationSeconds}
        />
      </div>
    </section>
  );
}
