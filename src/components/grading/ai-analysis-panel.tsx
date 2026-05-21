"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RotateCw, ChevronDown, AlertCircle } from "lucide-react";

// Mirror of the persisted analysis_json shape. Kept loose because we may
// extend it; the panel only needs a few fields.
// Claude prosody entries are bilingual { en, zh } since the Phase-7-bilingual
// upgrade. Older rows may carry plain string[] from the original prompt; the
// reader below normalizes both shapes so the panel never crashes on legacy
// data. zh is a Traditional Mandarin translation for Taiwanese teachers.
type ClaudeStrengthOrFocus = string | { en: string; zh?: string };

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
  expectedView?: { word: string; op: 'match' | 'sub' | 'del'; heard?: string }[];
  heardView?: { word: string; op: 'match' | 'sub' | 'ins'; expected?: string }[];
  durationSec?: number;
  processedAt?: string;
  error?: string;
  // Claude-derived prose. Renders under "Teacher notes" when present.
  claude?: {
    prosody?: {
      phrasingNotes?: string;
      phrasingNotesZh?: string;
      smoothnessNotes?: string;
      smoothnessNotesZh?: string;
      strengths?: ClaudeStrengthOrFocus[];
      focusAreas?: ClaudeStrengthOrFocus[];
    };
  } | null;
}

function bilingual(line: ClaudeStrengthOrFocus): { en: string; zh?: string } {
  if (typeof line === 'string') return { en: line };
  return { en: line.en, zh: line.zh };
}

type WcpmBand = 'concern' | 'developing' | 'on_target' | 'above_target' | null;

interface Props {
  recordingId: string;
  letterGrade: string | null;
  accuracyScore: number | null;
  wpmScore: number | null;
  // Phase 7 — all optional. When wcpm is null we render the legacy WPM row
  // (older recordings before the fluency upgrade).
  wcpm?: number | null;
  fluencyScore?: number | null;
  eslWcpmBand?: WcpmBand;
  nativeWcpmBand?: WcpmBand;
  phrasingScore?: number | null;
  smoothnessScore?: number | null;
  paceScore?: number | null;
  teacherSummary?: string | null;
  teacherSummaryZh?: string | null;
  transcript: string | null;
  analysisJson: AnalysisJson | null;
  onReanalyzed?: () => void;
}

// Letter-grade chip. Subtle ring + soft background — sits beside other metrics
// without dominating the row. Color carries the signal; the chip itself stays
// quiet.
function gradeChipStyles(grade: string | null): string {
  const base =
    'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums';
  if (!grade) return `${base} bg-gray-50 text-gray-600 ring-gray-200`;
  if (grade.startsWith('A')) return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  if (grade.startsWith('B')) return `${base} bg-sky-50 text-sky-700 ring-sky-200`;
  if (grade.startsWith('C')) return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  if (grade.startsWith('D')) return `${base} bg-orange-50 text-orange-700 ring-orange-200`;
  return `${base} bg-rose-50 text-rose-700 ring-rose-200`;
}

const BAND_LABEL: Record<NonNullable<WcpmBand>, string> = {
  concern: 'Concern',
  developing: 'Developing',
  on_target: 'On Target',
  above_target: 'Above Target',
};

// Quieter palette than the previous saturated badges. The teacher reads this
// 30+ times per session; loud colors stop carrying meaning quickly.
const BAND_STYLES: Record<NonNullable<WcpmBand>, string> = {
  concern: 'bg-rose-50 text-rose-700 ring-rose-200',
  developing: 'bg-amber-50 text-amber-700 ring-amber-200',
  on_target: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  above_target: 'bg-teal-50 text-teal-700 ring-teal-200',
};

// Strong ease-out — fast initial response, settled finish. Stock easings are
// too weak; this is the curve every transition in the panel snaps to so
// motion feels cohesive.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// Class applied to every Mandarin paragraph. Proper font stack + tighter
// leading + thin left rule reads as "deliberate translation companion,"
// not "bolted-on subtitle". font-family stack falls through OS-native
// Traditional Mandarin faces (PingFang on macOS/iOS, Noto Sans TC on
// Linux/Android, Microsoft JhengHei on Windows).
const ZH_PROSE =
  'block leading-snug text-gray-500 border-l-2 border-purple-100/80 pl-2.5 ' +
  'font-["PingFang_TC","Noto_Sans_TC","Microsoft_JhengHei","sans-serif"]';

// 1-4 dot meter. Inactive dots keep a faint ring so the meter still reads as
// a scale at a glance, instead of one filled dot floating in space.
function ProsodyMeter({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  return (
    <div className="flex flex-col items-center gap-1 min-w-[76px]">
      <div className="flex gap-1" aria-label={`${label} score: ${score} of 4`}>
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`block h-2 w-2 rounded-full ${
              n <= score
                ? 'bg-purple-600'
                : 'bg-transparent ring-1 ring-purple-200'
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-[0.06em]">
        {label}
      </span>
    </div>
  );
}

export function AIAnalysisPanel({
  recordingId,
  letterGrade,
  accuracyScore,
  wpmScore,
  wcpm,
  fluencyScore,
  eslWcpmBand,
  nativeWcpmBand,
  phrasingScore,
  smoothnessScore,
  paceScore,
  teacherSummary,
  teacherSummaryZh,
  transcript,
  analysisJson,
  onReanalyzed,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  const hasResults = !!letterGrade || !!analysisJson?.expectedView?.length;
  const hasError = !!analysisJson?.error;
  const isPending = !hasResults && !hasError;
  // wcpm presence indicates a Phase-7+ analysis ran. Falls through to the
  // legacy WPM row when null (older recordings).
  const hasFluency = wcpm != null;

  const reanalyze = async () => {
    setReanalyzing(true);
    setReanalyzeError(null);
    try {
      const res = await fetch(`/api/recordings/${recordingId}/analyze`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.result?.error) {
        setReanalyzeError(body.result?.error || body.error || 'Analysis failed');
      } else {
        onReanalyzed?.();
      }
    } catch (e) {
      setReanalyzeError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        // Specific transition properties — `transition-all` paints every
        // unrelated style change, including the chevron rotation on the child.
        className="group w-full flex items-center justify-between gap-4 px-4 py-3 text-left
                   transition-[background-color] duration-150
                   hover:bg-gray-50
                   active:bg-gray-100
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 focus-visible:ring-offset-2"
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {/* Sparkles is the entire AI identity now — no tinted panel needed. */}
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium text-gray-900">AI analysis</span>

          {hasResults && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={gradeChipStyles(letterGrade)}>{letterGrade ?? '—'}</span>
              {hasFluency ? (
                <>
                  <span className="text-sm text-gray-700 tabular-nums">
                    <span className="font-semibold text-gray-900">{wcpm}</span>
                    <span className="text-gray-500"> WCPM</span>
                  </span>
                  {accuracyScore !== null && (
                    <span className="text-xs text-gray-400 tabular-nums">·  {accuracyScore}% acc</span>
                  )}
                  {fluencyScore != null && (
                    <span className="text-xs text-gray-400 tabular-nums">·  {fluencyScore}/100</span>
                  )}
                  {eslWcpmBand && (
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BAND_STYLES[eslWcpmBand]}`}
                    >
                      {BAND_LABEL[eslWcpmBand]}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {accuracyScore !== null && (
                    <span className="text-xs text-gray-600 tabular-nums">{accuracyScore}% acc</span>
                  )}
                  {wpmScore !== null && (
                    <span className="text-xs text-gray-400 tabular-nums">·  {wpmScore} WPM</span>
                  )}
                </>
              )}
            </div>
          )}

          {hasError && (
            <span className="inline-flex items-center gap-1 text-xs text-rose-700">
              <AlertCircle className="h-3 w-3" /> Analysis failed
            </span>
          )}
          {isPending && (
            <span className="text-xs italic text-gray-500">analyzing…</span>
          )}
        </div>

        {/* Single chevron that rotates. Inline style for the custom curve;
            Tailwind's stock easings are too weak for a 200ms rotate. */}
        <ChevronDown
          aria-hidden
          className="h-4 w-4 text-gray-400 shrink-0 group-hover:text-gray-600"
          style={{
            transition: `transform 200ms ${EASE_OUT}, color 150ms ease-out`,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {expanded && (
        // Whole expanded region fades + slides in 200ms. Inner sections
        // stagger 40ms each so the reveal reads as a cascade.
        <div
          className="px-4 pb-4 pt-4 border-t border-gray-100 space-y-4"
          style={{ animation: `panel-fade 200ms ${EASE_OUT}` }}
        >
          {hasResults && analysisJson && (
            <>
              {/* Primary metrics row — letter grade + WCPM + Fluency are the
                  hero numbers, accuracy + native band sit below in muted text. */}
              <div className="space-y-3" style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '0ms' }}>
                <div className="flex items-baseline gap-5 flex-wrap">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`${gradeChipStyles(letterGrade)} text-base px-2.5 py-1`}
                    >
                      {letterGrade ?? '—'}
                    </span>
                  </div>
                  {hasFluency && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">
                        {wcpm}
                      </span>
                      <span className="text-xs uppercase tracking-[0.08em] text-gray-500 font-medium">
                        WCPM
                      </span>
                    </div>
                  )}
                  {hasFluency && fluencyScore != null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">
                        {fluencyScore}
                      </span>
                      <span className="text-xs uppercase tracking-[0.08em] text-gray-500 font-medium">
                        Fluency
                      </span>
                    </div>
                  )}
                  {!hasFluency && wpmScore !== null && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">
                        {wpmScore}
                      </span>
                      <span className="text-xs uppercase tracking-[0.08em] text-gray-500 font-medium">
                        WPM
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
                  {accuracyScore !== null && (
                    <span className="tabular-nums">{accuracyScore}% accuracy</span>
                  )}
                  {eslWcpmBand && (
                    <>
                      <span aria-hidden>·</span>
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BAND_STYLES[eslWcpmBand]}`}
                      >
                        {BAND_LABEL[eslWcpmBand]} — ESL
                      </span>
                    </>
                  )}
                  {eslWcpmBand && nativeWcpmBand && nativeWcpmBand !== eslWcpmBand && (
                    <span className="text-gray-400">
                      L1 norm: <span className="font-medium text-gray-600">{BAND_LABEL[nativeWcpmBand]}</span>
                    </span>
                  )}
                  {analysisJson.hallucinationSuspected && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                      <AlertCircle className="h-3 w-3" /> Possibly silent — re-record
                    </span>
                  )}
                </div>
              </div>

              {/* Prosody trio + per-dimension Claude notes. The dot meters
                  give the at-a-glance score; the notes underneath explain
                  what the model heard in 1-2 sentences. Pace has no note —
                  it's wholly derived from the WCPM band already shown above. */}
              {(phrasingScore != null || smoothnessScore != null || paceScore != null) && (
                <div
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
                  style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '40ms' }}
                >
                  <div className="flex gap-5 flex-wrap">
                    <ProsodyMeter label="Phrasing" score={phrasingScore} />
                    <ProsodyMeter label="Smoothness" score={smoothnessScore} />
                    <ProsodyMeter label="Pace" score={paceScore} />
                  </div>
                  {(analysisJson.claude?.prosody?.phrasingNotes ||
                    analysisJson.claude?.prosody?.smoothnessNotes) && (
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      {analysisJson.claude?.prosody?.phrasingNotes && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-purple-700">
                            Phrasing
                          </span>
                          <p className="text-sm text-gray-800 leading-relaxed">
                            {analysisJson.claude.prosody.phrasingNotes}
                          </p>
                          {analysisJson.claude.prosody.phrasingNotesZh && (
                            <p lang="zh-Hant" className={`${ZH_PROSE} text-sm`}>
                              {analysisJson.claude.prosody.phrasingNotesZh}
                            </p>
                          )}
                        </div>
                      )}
                      {analysisJson.claude?.prosody?.smoothnessNotes && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-purple-700">
                            Smoothness
                          </span>
                          <p className="text-sm text-gray-800 leading-relaxed">
                            {analysisJson.claude.prosody.smoothnessNotes}
                          </p>
                          {analysisJson.claude.prosody.smoothnessNotesZh && (
                            <p lang="zh-Hant" className={`${ZH_PROSE} text-sm`}>
                              {analysisJson.claude.prosody.smoothnessNotesZh}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {teacherSummary && (
                <div
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-1.5"
                  style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '80ms' }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Teacher notes
                  </span>
                  <p className="text-sm text-gray-800 leading-relaxed">{teacherSummary}</p>
                  {teacherSummaryZh && (
                    <p lang="zh-Hant" className={`${ZH_PROSE} text-sm`}>
                      {teacherSummaryZh}
                    </p>
                  )}
                </div>
              )}

              {/* Strengths + focus areas: white cards with a colored left rule
                  (instead of green/amber tinted backgrounds). Identity comes
                  from the rule + tiny label — body stays quiet for the
                  bilingual prose. */}
              {(analysisJson.claude?.prosody?.strengths?.length ||
                analysisJson.claude?.prosody?.focusAreas?.length) && (
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '120ms' }}
                >
                  {analysisJson.claude?.prosody?.strengths?.length ? (
                    <div className="rounded-lg border border-gray-200 bg-white border-l-[3px] border-l-emerald-500 p-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                        Strengths
                      </span>
                      <ul className="mt-2 space-y-2">
                        {analysisJson.claude.prosody.strengths.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="text-sm text-gray-800">
                              <span className="block leading-relaxed">{en}</span>
                              {zh && (
                                <span lang="zh-Hant" className={`${ZH_PROSE} mt-0.5 text-xs`}>
                                  {zh}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {analysisJson.claude?.prosody?.focusAreas?.length ? (
                    <div className="rounded-lg border border-gray-200 bg-white border-l-[3px] border-l-amber-500 p-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                        Focus areas
                      </span>
                      <ul className="mt-2 space-y-2">
                        {analysisJson.claude.prosody.focusAreas.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="text-sm text-gray-800">
                              <span className="block leading-relaxed">{en}</span>
                              {zh && (
                                <span lang="zh-Hant" className={`${ZH_PROSE} mt-0.5 text-xs`}>
                                  {zh}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              <div
                className="flex items-center gap-3 text-xs text-gray-500 tabular-nums"
                style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '160ms' }}
              >
                <span><span className="font-semibold text-gray-700">{analysisJson.matched ?? 0}</span> correct</span>
                <span aria-hidden className="text-gray-300">·</span>
                <span>{analysisJson.substituted ?? 0} mispronounced</span>
                <span aria-hidden className="text-gray-300">·</span>
                <span>{analysisJson.missed ?? 0} skipped</span>
                <span aria-hidden className="text-gray-300">·</span>
                <span>{analysisJson.inserted ?? 0} extra</span>
              </div>

              {analysisJson.expectedView && analysisJson.expectedView.length > 0 && (
                <div
                  className="space-y-2"
                  style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '200ms' }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Story · errors highlighted
                  </span>
                  <p className="text-sm leading-relaxed rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-gray-800">
                    {analysisJson.expectedView.map((tok, i) => {
                      const sep = i > 0 ? ' ' : '';
                      if (tok.op === 'match') return <span key={i}>{sep}{tok.word}</span>;
                      if (tok.op === 'sub')
                        return (
                          <span
                            key={i}
                            className="rounded-sm bg-amber-100 px-0.5 text-amber-900"
                            title={`Heard: "${tok.heard ?? ''}"`}
                          >
                            {sep}{tok.word}
                          </span>
                        );
                      // del
                      return (
                        <span
                          key={i}
                          className="rounded-sm bg-rose-100 px-0.5 text-rose-700 line-through"
                          title="Skipped"
                        >
                          {sep}{tok.word}
                        </span>
                      );
                    })}
                  </p>
                  <div className="flex gap-4 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-sm bg-amber-100" />
                      mispronounced
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-sm bg-rose-100" />
                      skipped
                    </span>
                  </div>
                </div>
              )}

              {transcript && (
                <div
                  className="space-y-2"
                  style={{ animation: `section-in 300ms ${EASE_OUT} both`, animationDelay: '240ms' }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Transcript
                  </span>
                  <p className="text-sm text-gray-800 rounded-lg border border-gray-200 bg-gray-50/60 p-4 leading-relaxed whitespace-pre-wrap">
                    {transcript}
                  </p>
                </div>
              )}
            </>
          )}

          {hasError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">
              {analysisJson?.error}
            </div>
          )}

          {reanalyzeError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-800">
              {reanalyzeError}
            </div>
          )}

          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={reanalyze}
              disabled={reanalyzing}
              // Press feedback. Button component already brings focus-visible
              // ring; we add the active-scale + custom transition curve here.
              className="gap-2 transition-[transform,background-color,border-color] duration-150 active:scale-[0.97]"
              style={{ transitionTimingFunction: EASE_OUT }}
            >
              <RotateCw className={`h-3 w-3 ${reanalyzing ? 'animate-spin' : ''}`} />
              {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
            </Button>
          </div>
        </div>
      )}

      {/* Keyframes (`panel-fade`, `section-in`) live in app/globals.css so
          inline `animation: ...` references resolve. */}
    </div>
  );
}
