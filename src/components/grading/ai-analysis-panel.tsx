"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCw, ChevronDown, AlertCircle } from "lucide-react";

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

// Traditional Mandarin gets a proper native font stack so it doesn't render
// in the Latin sans default. Reused on every zh-Hant block.
const ZH = 'font-["PingFang_TC","Noto_Sans_TC","Microsoft_JhengHei",sans-serif]';

// One singular accent (emerald) carries the AI identity. No purple
// (LILA BAN). Tone tokens drive a single colored dot + matching text
// — never a filled chip, which would compete with the typography.
function gradeTone(grade: string | null): { dot: string; text: string } {
  if (!grade) return { dot: 'bg-zinc-300', text: 'text-zinc-500' };
  if (grade.startsWith('A')) return { dot: 'bg-emerald-600', text: 'text-emerald-700' };
  if (grade.startsWith('B')) return { dot: 'bg-sky-600', text: 'text-sky-700' };
  if (grade.startsWith('C')) return { dot: 'bg-amber-600', text: 'text-amber-700' };
  if (grade.startsWith('D')) return { dot: 'bg-orange-600', text: 'text-orange-700' };
  return { dot: 'bg-rose-600', text: 'text-rose-700' };
}

const BAND_LABEL: Record<NonNullable<WcpmBand>, string> = {
  concern: 'Concern',
  developing: 'Developing',
  on_target: 'On Target',
  above_target: 'Above Target',
};

const BAND_TONE: Record<NonNullable<WcpmBand>, { dot: string; text: string }> = {
  concern: { dot: 'bg-rose-600', text: 'text-rose-700' },
  developing: { dot: 'bg-amber-600', text: 'text-amber-700' },
  on_target: { dot: 'bg-emerald-600', text: 'text-emerald-700' },
  above_target: { dot: 'bg-emerald-700', text: 'text-emerald-800' },
};

// A 1–4 prosody score rendered as four bar segments. Quieter than dots,
// reads as a row in an editorial chart. Filled = `bg-zinc-900`, empty =
// `bg-zinc-200` — no color on the meter itself; color is reserved for
// the band label.
function ProsodyRow({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-4">
      <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <div className="flex gap-[3px]" aria-label={`${label}: ${score} of 4`}>
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-[3px] flex-1 ${n <= score ? 'bg-zinc-900' : 'bg-zinc-200'}`}
          />
        ))}
      </div>
      <span className="font-mono tabular-nums text-[11px] text-zinc-600 text-right">
        {score}<span className="text-zinc-400">/4</span>
      </span>
    </div>
  );
}

// Tiny uppercase section caption that sits ABOVE its content like a
// gallery wall label. Spec lives here so spacing is consistent.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
      {children}
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

  const grade = gradeTone(letterGrade);

  return (
    <div className="mt-4 border-t border-zinc-900 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-zinc-50"
      >
        <div className="flex items-baseline gap-5 flex-wrap min-w-0">
          <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 shrink-0">
            AI Analysis
          </span>
          {hasResults && (
            <div className="flex items-baseline gap-5 flex-wrap min-w-0">
              <span className={`font-mono tabular-nums text-xl leading-none ${grade.text}`}>
                {letterGrade ?? '—'}
              </span>
              {hasFluency ? (
                <>
                  <span className="text-sm text-zinc-700">
                    <span className="font-mono tabular-nums font-medium text-zinc-900">{wcpm}</span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 ml-1.5">wcpm</span>
                  </span>
                  {accuracyScore !== null && (
                    <span className="text-sm text-zinc-500">
                      <span className="font-mono tabular-nums">{accuracyScore}</span>%
                    </span>
                  )}
                  {eslWcpmBand && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
                      <span className={`w-1.5 h-1.5 rounded-full ${BAND_TONE[eslWcpmBand].dot}`} />
                      <span className={BAND_TONE[eslWcpmBand].text}>{BAND_LABEL[eslWcpmBand]}</span>
                    </span>
                  )}
                </>
              ) : (
                <>
                  {accuracyScore !== null && (
                    <span className="text-sm text-zinc-700">
                      <span className="font-mono tabular-nums">{accuracyScore}</span>%
                    </span>
                  )}
                  {wpmScore !== null && (
                    <span className="text-sm text-zinc-500">
                      <span className="font-mono tabular-nums">{wpmScore}</span>
                      <span className="text-[10px] uppercase tracking-[0.14em] ml-1.5">wpm</span>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {hasError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-700">
              <AlertCircle className="w-3.5 h-3.5" /> Analysis failed
            </span>
          )}
          {isPending && (
            <span className="text-xs text-zinc-400 italic">analyzing…</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="pt-6 pb-8 space-y-10 border-t border-zinc-200">
          {hasResults && analysisJson && (
            <>
              {/* MASTHEAD — four monumental figures separated by hairline
                  rules. The numbers read as the headline; labels are
                  small uppercase captions above them. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-zinc-200">
                <div className="px-5 first:pl-0 last:pr-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                    Grade
                  </div>
                  <div className={`font-mono tabular-nums text-5xl leading-none ${grade.text}`}>
                    {letterGrade ?? '—'}
                  </div>
                </div>
                {hasFluency ? (
                  <>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        WCPM
                      </div>
                      <div className="font-mono tabular-nums text-5xl leading-none text-zinc-900">
                        {wcpm}
                      </div>
                    </div>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        Accuracy
                      </div>
                      <div className="font-mono tabular-nums text-5xl leading-none text-zinc-900">
                        {accuracyScore ?? 0}
                        <span className="text-2xl text-zinc-400 ml-1">%</span>
                      </div>
                    </div>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        Fluency
                      </div>
                      <div className="font-mono tabular-nums text-5xl leading-none text-zinc-900">
                        {fluencyScore ?? 0}
                        <span className="text-2xl text-zinc-400 ml-1">/100</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        Accuracy
                      </div>
                      <div className="font-mono tabular-nums text-5xl leading-none text-zinc-900">
                        {accuracyScore ?? 0}
                        <span className="text-2xl text-zinc-400 ml-1">%</span>
                      </div>
                    </div>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        WPM
                      </div>
                      <div className="font-mono tabular-nums text-5xl leading-none text-zinc-900">
                        {wpmScore ?? 0}
                      </div>
                    </div>
                    <div className="px-5 first:pl-0 last:pr-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        Status
                      </div>
                      <div className="text-2xl leading-none text-zinc-400 pt-3">—</div>
                    </div>
                  </>
                )}
              </div>

              {/* Band — type-only label with a colored dot. No fill, no
                  pill chrome. Native parenthetical sits next to it as
                  a quiet teacher reference. */}
              {eslWcpmBand && (
                <div className="flex items-baseline gap-4 flex-wrap">
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full ${BAND_TONE[eslWcpmBand].dot}`} />
                    <span className={`uppercase tracking-[0.14em] text-xs font-medium ${BAND_TONE[eslWcpmBand].text}`}>
                      {BAND_LABEL[eslWcpmBand]}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">ESL norm</span>
                  </span>
                  {nativeWcpmBand && nativeWcpmBand !== eslWcpmBand && (
                    <span className="text-xs text-zinc-500">
                      L1 norm:{' '}
                      <span className="text-zinc-800 font-medium">
                        {BAND_LABEL[nativeWcpmBand]}
                      </span>
                    </span>
                  )}
                  {analysisJson.hallucinationSuspected && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Possibly silent — consider re-recording
                    </span>
                  )}
                </div>
              )}

              {/* PROSODY — three horizontal bar rows. Reads as a row of
                  newspaper data chart entries rather than a colored
                  meter. Notes underneath are bilingual; each prosody
                  dimension labeled in tracked uppercase. */}
              {(phrasingScore != null || smoothnessScore != null || paceScore != null) && (
                <section>
                  <SectionLabel>Prosody</SectionLabel>
                  <div className="space-y-2 border-t border-zinc-200 pt-3">
                    <ProsodyRow label="Phrasing" score={phrasingScore} />
                    <ProsodyRow label="Smoothness" score={smoothnessScore} />
                    <ProsodyRow label="Pace" score={paceScore} />
                  </div>

                  {(analysisJson.claude?.prosody?.phrasingNotes ||
                    analysisJson.claude?.prosody?.smoothnessNotes) && (
                    <div className="mt-5 space-y-4">
                      {analysisJson.claude?.prosody?.phrasingNotes && (
                        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-zinc-200">
                          <div className="md:pr-6">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                              On phrasing
                            </div>
                            <p className="text-[15px] text-zinc-800 leading-relaxed max-w-[60ch]">
                              {analysisJson.claude.prosody.phrasingNotes}
                            </p>
                          </div>
                          {analysisJson.claude.prosody.phrasingNotesZh && (
                            <div className="md:pl-6 mt-3 md:mt-0">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5">
                                繁體中文
                              </div>
                              <p
                                lang="zh-Hant"
                                className={`${ZH} text-[15px] text-zinc-600 leading-relaxed max-w-[60ch]`}
                              >
                                {analysisJson.claude.prosody.phrasingNotesZh}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {analysisJson.claude?.prosody?.smoothnessNotes && (
                        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-zinc-200">
                          <div className="md:pr-6">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                              On smoothness
                            </div>
                            <p className="text-[15px] text-zinc-800 leading-relaxed max-w-[60ch]">
                              {analysisJson.claude.prosody.smoothnessNotes}
                            </p>
                          </div>
                          {analysisJson.claude.prosody.smoothnessNotesZh && (
                            <div className="md:pl-6 mt-3 md:mt-0">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5">
                                繁體中文
                              </div>
                              <p
                                lang="zh-Hant"
                                className={`${ZH} text-[15px] text-zinc-600 leading-relaxed max-w-[60ch]`}
                              >
                                {analysisJson.claude.prosody.smoothnessNotesZh}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* TEACHER NOTES — bilingual two-column grid with a
                  hairline rule between English and Mandarin. The
                  English block holds its own max-w so long sentences
                  don't run edge-to-edge. */}
              {teacherSummary && (
                <section>
                  <SectionLabel>Teacher notes</SectionLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-zinc-200 border-t border-zinc-200 pt-4">
                    <div className="md:pr-8">
                      <p className="text-[17px] text-zinc-900 leading-relaxed max-w-[58ch]">
                        {teacherSummary}
                      </p>
                    </div>
                    {teacherSummaryZh && (
                      <div className="md:pl-8 mt-4 md:mt-0">
                        <p
                          lang="zh-Hant"
                          className={`${ZH} text-[17px] text-zinc-700 leading-relaxed max-w-[58ch]`}
                        >
                          {teacherSummaryZh}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* STRENGTHS + FOCUS AREAS — editorial numbered lists.
                  No green / amber tinted backgrounds. The accent dot
                  carries the semantic meaning; numbering carries the
                  hierarchy; the bilingual pair sits as a typographic
                  unit. */}
              {(analysisJson.claude?.prosody?.strengths?.length ||
                analysisJson.claude?.prosody?.focusAreas?.length) ? (
                <section className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-zinc-200">
                  {analysisJson.claude?.prosody?.strengths?.length ? (
                    <div className="md:pr-8">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-700">
                          Strengths
                        </span>
                      </div>
                      <ol className="space-y-4">
                        {analysisJson.claude.prosody.strengths.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                              <span className="font-mono tabular-nums text-xs text-zinc-400 pt-0.5">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <div>
                                <p className="text-sm text-zinc-900 leading-relaxed">{en}</p>
                                {zh && (
                                  <p
                                    lang="zh-Hant"
                                    className={`${ZH} text-sm text-zinc-500 leading-relaxed mt-0.5`}
                                  >
                                    {zh}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : <div />}
                  {analysisJson.claude?.prosody?.focusAreas?.length ? (
                    <div className="md:pl-8 mt-8 md:mt-0">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-700">
                          Focus areas
                        </span>
                      </div>
                      <ol className="space-y-4">
                        {analysisJson.claude.prosody.focusAreas.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                              <span className="font-mono tabular-nums text-xs text-zinc-400 pt-0.5">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <div>
                                <p className="text-sm text-zinc-900 leading-relaxed">{en}</p>
                                {zh && (
                                  <p
                                    lang="zh-Hant"
                                    className={`${ZH} text-sm text-zinc-500 leading-relaxed mt-0.5`}
                                  >
                                    {zh}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {/* Word-op tally — quiet bottom line with tabular numerals
                  separated by dividers. Reads like a scoreline at the
                  foot of an article. */}
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-zinc-200 pt-4 text-xs">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono tabular-nums text-zinc-900 text-base">
                    {analysisJson.matched ?? 0}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">correct</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono tabular-nums text-zinc-900 text-base">
                    {analysisJson.substituted ?? 0}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">mispronounced</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono tabular-nums text-zinc-900 text-base">
                    {analysisJson.missed ?? 0}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">skipped</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono tabular-nums text-zinc-900 text-base">
                    {analysisJson.inserted ?? 0}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">extra</span>
                </span>
              </div>

              {/* PASSAGE — clean cream-paper card. The diff highlights
                  use a subtle yellow underline and a strike rather than
                  flat color blocks; reads as editor's marks rather
                  than alarm. */}
              {analysisJson.expectedView && analysisJson.expectedView.length > 0 && (
                <section>
                  <SectionLabel>Passage</SectionLabel>
                  <p className="text-[15px] leading-[1.85] text-zinc-900 bg-[#fafaf7] border-t border-b border-zinc-200 px-1 py-5">
                    {analysisJson.expectedView.map((tok, i) => {
                      const sep = i > 0 ? ' ' : '';
                      if (tok.op === 'match') return <span key={i}>{sep}{tok.word}</span>;
                      if (tok.op === 'sub')
                        return (
                          <span
                            key={i}
                            className="bg-yellow-200/60 underline decoration-amber-700 decoration-1 underline-offset-[3px] px-0.5"
                            title={`Heard: "${tok.heard ?? ''}"`}
                          >
                            {sep}{tok.word}
                          </span>
                        );
                      return (
                        <span
                          key={i}
                          className="text-rose-700 line-through decoration-rose-400 decoration-1 px-0.5"
                          title="Skipped"
                        >
                          {sep}{tok.word}
                        </span>
                      );
                    })}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-zinc-500">
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="bg-yellow-200/60 underline decoration-amber-700 decoration-1 underline-offset-[3px] px-1">word</span>
                      mispronounced
                    </span>
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-rose-700 line-through decoration-rose-400 decoration-1 px-1">word</span>
                      skipped
                    </span>
                  </div>
                </section>
              )}

              {/* TRANSCRIPT — verbatim. Reads as a quoted block. */}
              {transcript && (
                <section>
                  <SectionLabel>Transcript</SectionLabel>
                  <p className="text-[15px] text-zinc-700 leading-relaxed whitespace-pre-wrap border-l-2 border-zinc-300 pl-5 max-w-[68ch]">
                    {transcript}
                  </p>
                </section>
              )}
            </>
          )}

          {hasError && (
            <div className="border-l-2 border-rose-500 pl-4 py-1 text-sm text-rose-800">
              {analysisJson?.error}
            </div>
          )}

          {reanalyzeError && (
            <div className="border-l-2 border-rose-500 pl-4 py-1 text-sm text-rose-800">
              {reanalyzeError}
            </div>
          )}

          <div className="pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={reanalyze}
              disabled={reanalyzing}
              className="gap-2 px-0 h-auto text-zinc-700 hover:text-zinc-950 hover:bg-transparent uppercase tracking-[0.14em] text-[11px] font-medium"
            >
              <RotateCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />
              {reanalyzing ? 'Re-analyzing' : 'Re-analyze'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
