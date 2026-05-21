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

// Mandarin pairs with English at equal size and weight throughout — not as
// a subtitle. The native stack keeps glyph proportions correct.
const ZH = 'font-["PingFang_TC","Noto_Sans_TC","Microsoft_JhengHei",sans-serif]';

// System serif used only on prose surfaces (teacher_summary, passage,
// transcript) where reading authority matters. UI labels and data stay
// sans, per product register.
const SERIF = 'font-serif';

// Single accent (rose-700, a deep madder) carries positive / urgent signal.
// Amber is a quieter warning. Everything else is stone (warm neutral).
function gradeTone(grade: string | null): string {
  if (!grade) return 'bg-stone-300';
  if (grade.startsWith('A')) return 'bg-rose-700';
  if (grade.startsWith('B')) return 'bg-stone-700';
  if (grade.startsWith('C')) return 'bg-amber-700';
  if (grade.startsWith('D')) return 'bg-amber-800';
  return 'bg-rose-800';
}

const BAND_LABEL: Record<NonNullable<WcpmBand>, string> = {
  concern: 'Concern',
  developing: 'Developing',
  on_target: 'On target',
  above_target: 'Above target',
};

const BAND_TONE: Record<NonNullable<WcpmBand>, { dot: string; text: string }> = {
  concern: { dot: 'bg-rose-700', text: 'text-rose-800' },
  developing: { dot: 'bg-amber-700', text: 'text-amber-800' },
  on_target: { dot: 'bg-stone-700', text: 'text-stone-800' },
  above_target: { dot: 'bg-rose-700', text: 'text-rose-800' },
};

// Prosody score (1–4) rendered as a small horizontal scale with a tick at
// the position. Replaces the conventional "dots" with something that
// reads as a measurement on a scale rather than a count.
function ProsodyScale({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  // tick position from 0..100% based on 1..4 score
  const pct = ((score - 1) / 3) * 100;
  return (
    <div className="grid grid-cols-[6rem_1fr_2.25rem] items-center gap-4 py-1.5">
      <span className="text-[11px] text-stone-500">{label}</span>
      <div className="relative h-px bg-stone-200">
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-3 bg-stone-900"
          style={{ left: `${pct}%` }}
          aria-hidden
        />
        <span className="absolute left-0 -top-1 w-px h-2 bg-stone-300" aria-hidden />
        <span className="absolute right-0 -top-1 w-px h-2 bg-stone-300" aria-hidden />
      </div>
      <span className="text-[11px] tabular-nums text-stone-700 text-right">
        {score}<span className="text-stone-400">/4</span>
      </span>
    </div>
  );
}

function SectionCaption({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-3">
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
    <div className="mt-4 border border-stone-200 bg-stone-50/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-stone-100/60 transition-colors duration-150"
      >
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500 shrink-0">
            AI analysis
          </span>
          {hasResults && (
            <div className="flex items-baseline gap-3 flex-wrap text-[13px] text-stone-700">
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${gradeTone(letterGrade)}`} />
                <span className="font-medium text-stone-900">{letterGrade ?? '—'}</span>
              </span>
              {hasFluency ? (
                <>
                  <span className="text-stone-300">·</span>
                  <span>
                    <span className="font-medium text-stone-900 tabular-nums">{wcpm}</span>
                    <span className="text-stone-500"> wcpm</span>
                  </span>
                  {accuracyScore !== null && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className="tabular-nums">{accuracyScore}%</span>
                    </>
                  )}
                  {fluencyScore != null && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className="tabular-nums">{fluencyScore}<span className="text-stone-400">/100</span></span>
                    </>
                  )}
                  {eslWcpmBand && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${BAND_TONE[eslWcpmBand].dot}`} />
                        <span className={BAND_TONE[eslWcpmBand].text}>{BAND_LABEL[eslWcpmBand]}</span>
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  {accuracyScore !== null && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className="tabular-nums">{accuracyScore}%</span>
                    </>
                  )}
                  {wpmScore !== null && (
                    <>
                      <span className="text-stone-300">·</span>
                      <span><span className="tabular-nums">{wpmScore}</span><span className="text-stone-500"> wpm</span></span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {hasError && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-800">
              <AlertCircle className="w-3.5 h-3.5" /> Analysis failed
            </span>
          )}
          {isPending && (
            <span className="text-xs text-stone-400 italic">analyzing</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="px-5 pt-6 pb-8 space-y-9 bg-white border-t border-stone-200">
          {hasResults && analysisJson && (
            <>
              {/* TEACHER'S READ — the human summary opens the panel as
                  prose, set in serif and paired in EN + ZH at parity.
                  Mandarin is not a subtitle; it's the same size and
                  weight as English. */}
              {teacherSummary && (
                <section>
                  <SectionCaption>Teacher's read</SectionCaption>
                  <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-stone-200 gap-y-4">
                    <p className={`${SERIF} text-[17px] leading-[1.55] text-stone-900 md:pr-7 max-w-[58ch]`}>
                      {teacherSummary}
                    </p>
                    {teacherSummaryZh && (
                      <p
                        lang="zh-Hant"
                        className={`${ZH} text-[17px] leading-[1.6] text-stone-900 md:pl-7 max-w-[58ch]`}
                      >
                        {teacherSummaryZh}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* METRICS — five cells separated by 1px verticals. Numeric
                  hierarchy lives in size + weight; no card chrome. The
                  ESL band cell carries the L1-norm note as a second
                  line, so teachers see both at a glance. */}
              <section className="border-y border-stone-200">
                <div className="grid grid-cols-2 md:grid-cols-5 md:divide-x divide-stone-200 -mx-1">
                  <div className="px-4 py-4">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">Grade</div>
                    <div className="flex items-baseline gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${gradeTone(letterGrade)}`} />
                      <span className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                        {letterGrade ?? '—'}
                      </span>
                    </div>
                  </div>
                  {hasFluency ? (
                    <>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">WCPM</div>
                        <div className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                          {wcpm}
                        </div>
                      </div>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">Accuracy</div>
                        <div className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                          {accuracyScore ?? 0}<span className="text-base text-stone-400">%</span>
                        </div>
                      </div>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">Fluency</div>
                        <div className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                          {fluencyScore ?? 0}<span className="text-base text-stone-400">/100</span>
                        </div>
                      </div>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">Pace band</div>
                        {eslWcpmBand ? (
                          <>
                            <div className="flex items-baseline gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${BAND_TONE[eslWcpmBand].dot}`} />
                              <span className={`text-base font-medium leading-none ${BAND_TONE[eslWcpmBand].text}`}>
                                {BAND_LABEL[eslWcpmBand]}
                              </span>
                            </div>
                            {nativeWcpmBand && nativeWcpmBand !== eslWcpmBand && (
                              <div className="text-[11px] text-stone-500 mt-2 leading-tight">
                                L1 norm: <span className="text-stone-700">{BAND_LABEL[nativeWcpmBand]}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-base text-stone-400">—</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">Accuracy</div>
                        <div className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                          {accuracyScore ?? 0}<span className="text-base text-stone-400">%</span>
                        </div>
                      </div>
                      <div className="px-4 py-4">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5">WPM</div>
                        <div className="text-2xl font-medium text-stone-900 tabular-nums leading-none">
                          {wpmScore ?? 0}
                        </div>
                      </div>
                      <div className="px-4 py-4 col-span-2 md:col-span-3 flex items-center">
                        <span className="text-[11px] text-stone-500">
                          Pre-Phase-7 recording. Re-analyze for full fluency profile.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {analysisJson.hallucinationSuspected && (
                <div className="flex items-start gap-2 text-[13px] text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>This recording may be silent or off-passage. Consider asking the student to re-record.</span>
                </div>
              )}

              {/* PROSODY — three measurement scales with a tick at the
                  score, plus per-dimension Claude notes paired EN + ZH
                  in two columns. The scale reads as a calibrated
                  measurement rather than a count. */}
              {(phrasingScore != null || smoothnessScore != null || paceScore != null) && (
                <section>
                  <SectionCaption>Prosody</SectionCaption>
                  <div className="space-y-1.5 max-w-md">
                    <ProsodyScale label="Phrasing" score={phrasingScore} />
                    <ProsodyScale label="Smoothness" score={smoothnessScore} />
                    <ProsodyScale label="Pace" score={paceScore} />
                  </div>

                  {(analysisJson.claude?.prosody?.phrasingNotes ||
                    analysisJson.claude?.prosody?.smoothnessNotes) && (
                    <div className="mt-7 space-y-6">
                      {analysisJson.claude?.prosody?.phrasingNotes && (
                        <div className="grid grid-cols-1 md:grid-cols-[5rem_1fr_1fr] md:divide-x divide-stone-200 gap-y-3">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 pt-1">
                            Phrasing
                          </div>
                          <p className={`${SERIF} text-[15px] leading-[1.6] text-stone-800 md:px-6 max-w-[55ch]`}>
                            {analysisJson.claude.prosody.phrasingNotes}
                          </p>
                          {analysisJson.claude.prosody.phrasingNotesZh && (
                            <p
                              lang="zh-Hant"
                              className={`${ZH} text-[15px] leading-[1.65] text-stone-800 md:px-6 max-w-[55ch]`}
                            >
                              {analysisJson.claude.prosody.phrasingNotesZh}
                            </p>
                          )}
                        </div>
                      )}
                      {analysisJson.claude?.prosody?.smoothnessNotes && (
                        <div className="grid grid-cols-1 md:grid-cols-[5rem_1fr_1fr] md:divide-x divide-stone-200 gap-y-3">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 pt-1">
                            Smoothness
                          </div>
                          <p className={`${SERIF} text-[15px] leading-[1.6] text-stone-800 md:px-6 max-w-[55ch]`}>
                            {analysisJson.claude.prosody.smoothnessNotes}
                          </p>
                          {analysisJson.claude.prosody.smoothnessNotesZh && (
                            <p
                              lang="zh-Hant"
                              className={`${ZH} text-[15px] leading-[1.65] text-stone-800 md:px-6 max-w-[55ch]`}
                            >
                              {analysisJson.claude.prosody.smoothnessNotesZh}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* STRENGTHS + FOCUS — two columns, Roman-numeral gutters,
                  EN + ZH at parity beneath each item. No tinted card
                  backgrounds. The single rose dot marks strengths; an
                  amber dot marks focus areas. */}
              {(analysisJson.claude?.prosody?.strengths?.length ||
                analysisJson.claude?.prosody?.focusAreas?.length) ? (
                <section className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-stone-200 gap-y-8">
                  {analysisJson.claude?.prosody?.strengths?.length ? (
                    <div className="md:pr-8">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-700" />
                        <span className="text-[10px] uppercase tracking-[0.14em] text-stone-700">
                          Strengths
                        </span>
                      </div>
                      <ol className="space-y-5">
                        {analysisJson.claude.prosody.strengths.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="grid grid-cols-[2rem_1fr] gap-4">
                              <span className="text-[11px] tabular-nums text-stone-400 pt-1 tracking-wider">
                                {toRoman(i + 1)}
                              </span>
                              <div className="space-y-1.5">
                                <p className={`${SERIF} text-[14px] leading-[1.55] text-stone-900 max-w-[52ch]`}>
                                  {en}
                                </p>
                                {zh && (
                                  <p
                                    lang="zh-Hant"
                                    className={`${ZH} text-[14px] leading-[1.6] text-stone-900 max-w-[52ch]`}
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
                    <div className="md:pl-8">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-700" />
                        <span className="text-[10px] uppercase tracking-[0.14em] text-stone-700">
                          Focus areas
                        </span>
                      </div>
                      <ol className="space-y-5">
                        {analysisJson.claude.prosody.focusAreas.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="grid grid-cols-[2rem_1fr] gap-4">
                              <span className="text-[11px] tabular-nums text-stone-400 pt-1 tracking-wider">
                                {toRoman(i + 1)}
                              </span>
                              <div className="space-y-1.5">
                                <p className={`${SERIF} text-[14px] leading-[1.55] text-stone-900 max-w-[52ch]`}>
                                  {en}
                                </p>
                                {zh && (
                                  <p
                                    lang="zh-Hant"
                                    className={`${ZH} text-[14px] leading-[1.6] text-stone-900 max-w-[52ch]`}
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

              {/* PASSAGE — set as a single column of running prose with
                  proofreader's marks: wavy rose underline for
                  substitutions, faded strike for skips. No tinted
                  highlight boxes. */}
              {analysisJson.expectedView && analysisJson.expectedView.length > 0 && (
                <section>
                  <SectionCaption>Passage</SectionCaption>
                  <p className={`${SERIF} text-[16px] leading-[1.85] text-stone-900 max-w-[68ch]`}>
                    {analysisJson.expectedView.map((tok, i) => {
                      const sep = i > 0 ? ' ' : '';
                      if (tok.op === 'match') return <span key={i}>{sep}{tok.word}</span>;
                      if (tok.op === 'sub')
                        return (
                          <span
                            key={i}
                            className="underline decoration-rose-700 decoration-wavy decoration-1 underline-offset-[5px]"
                            title={`Heard: "${tok.heard ?? ''}"`}
                          >
                            {sep}{tok.word}
                          </span>
                        );
                      return (
                        <span
                          key={i}
                          className="text-stone-400 line-through decoration-stone-400 decoration-1"
                          title="Skipped"
                        >
                          {sep}{tok.word}
                        </span>
                      );
                    })}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[11px] text-stone-500">
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="underline decoration-rose-700 decoration-wavy decoration-1 underline-offset-[3px] px-0.5">
                        word
                      </span>
                      mispronounced
                    </span>
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="text-stone-400 line-through decoration-stone-400 decoration-1 px-0.5">
                        word
                      </span>
                      skipped
                    </span>
                  </div>
                </section>
              )}

              {/* TRANSCRIPT — what we heard. Set in serif italic so it
                  reads as a quoted utterance, indented from the column
                  edge. */}
              {transcript && (
                <section>
                  <SectionCaption>Transcript</SectionCaption>
                  <p className={`${SERIF} italic text-[15px] leading-[1.7] text-stone-700 max-w-[65ch] pl-4 border-l border-stone-200 whitespace-pre-wrap`}>
                    {transcript}
                  </p>
                </section>
              )}

              {/* TALLY — quiet footer of the article: caption-sized
                  counts in a single line, separated by middle dots. */}
              <div className="flex flex-wrap items-baseline gap-x-4 text-[11px] text-stone-500 pt-2 border-t border-stone-200">
                <span><span className="tabular-nums text-stone-700">{analysisJson.matched ?? 0}</span> correct</span>
                <span className="text-stone-300">·</span>
                <span><span className="tabular-nums text-stone-700">{analysisJson.substituted ?? 0}</span> mispronounced</span>
                <span className="text-stone-300">·</span>
                <span><span className="tabular-nums text-stone-700">{analysisJson.missed ?? 0}</span> skipped</span>
                <span className="text-stone-300">·</span>
                <span><span className="tabular-nums text-stone-700">{analysisJson.inserted ?? 0}</span> extra</span>
              </div>
            </>
          )}

          {hasError && (
            <div className="text-[13px] text-rose-800 bg-rose-50/60 border border-rose-200 px-4 py-3">
              {analysisJson?.error}
            </div>
          )}

          {reanalyzeError && (
            <div className="text-[13px] text-rose-800 bg-rose-50/60 border border-rose-200 px-4 py-3">
              {reanalyzeError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={reanalyze}
              disabled={reanalyzing}
              className="h-auto px-0 gap-1.5 text-[12px] text-stone-600 hover:text-stone-900 hover:bg-transparent"
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

// Small helper: 1..N to Roman numerals for the strengths / focus lists.
// Caps at N=20 (we never expect more than ~5 items, but be defensive).
function toRoman(n: number): string {
  if (n < 1) return '';
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let rem = n;
  for (const [v, s] of map) {
    while (rem >= v) {
      out += s;
      rem -= v;
    }
  }
  return out;
}
