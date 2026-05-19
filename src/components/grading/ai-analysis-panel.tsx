"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCw, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

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

function gradeColor(grade: string | null): string {
  if (!grade) return 'bg-gray-100 text-gray-700';
  if (grade.startsWith('A')) return 'bg-green-100 text-green-800 border-green-300';
  if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800 border-blue-300';
  if (grade.startsWith('C')) return 'bg-amber-100 text-amber-800 border-amber-300';
  if (grade.startsWith('D')) return 'bg-orange-100 text-orange-800 border-orange-300';
  return 'bg-red-100 text-red-800 border-red-300';
}

const BAND_LABEL: Record<NonNullable<WcpmBand>, string> = {
  concern: 'Concern',
  developing: 'Developing',
  on_target: 'On Target',
  above_target: 'Above Target',
};

const BAND_COLOR: Record<NonNullable<WcpmBand>, string> = {
  concern: 'bg-red-100 text-red-800 border-red-300',
  developing: 'bg-amber-100 text-amber-800 border-amber-300',
  on_target: 'bg-green-100 text-green-800 border-green-300',
  above_target: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

// Renders a 1-4 prosody score as four dots. Filled dots = score value.
function ProsodyMeter({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[70px]">
      <div className="flex gap-0.5" aria-label={`${label} score: ${score} of 4`}>
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`block w-2 h-2 rounded-full ${
              n <= score ? 'bg-purple-600' : 'bg-purple-200'
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] text-gray-600 uppercase tracking-wide">{label}</span>
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
    <div className="mt-4 border border-purple-200 bg-purple-50/50 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-purple-100/40 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-purple-900 text-sm">AI Analysis</span>
          {hasResults && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${gradeColor(letterGrade)} border`}>{letterGrade ?? '—'}</Badge>
              {hasFluency ? (
                <>
                  <span className="text-xs text-gray-700">
                    <span className="font-semibold">{wcpm}</span> WCPM
                  </span>
                  {accuracyScore !== null && (
                    <span className="text-xs text-gray-500">· {accuracyScore}% accuracy</span>
                  )}
                  {fluencyScore != null && (
                    <span className="text-xs text-gray-500">· Fluency {fluencyScore}/100</span>
                  )}
                  {eslWcpmBand && (
                    <Badge className={`${BAND_COLOR[eslWcpmBand]} border text-[11px]`}>
                      {BAND_LABEL[eslWcpmBand]} (ESL)
                    </Badge>
                  )}
                </>
              ) : (
                <>
                  {accuracyScore !== null && (
                    <span className="text-xs text-gray-700">{accuracyScore}% accuracy</span>
                  )}
                  {wpmScore !== null && (
                    <span className="text-xs text-gray-500">· {wpmScore} WPM</span>
                  )}
                </>
              )}
            </div>
          )}
          {hasError && (
            <span className="flex items-center gap-1 text-xs text-red-700">
              <AlertCircle className="w-3 h-3" /> Analysis failed
            </span>
          )}
          {isPending && (
            <span className="text-xs text-gray-500 italic">analyzing…</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-purple-100">
          {hasResults && analysisJson && (
            <>
              <div className="flex flex-wrap gap-2 pt-3 items-center">
                <Badge className={`${gradeColor(letterGrade)} border text-base px-3 py-1`}>
                  {letterGrade ?? '—'}
                </Badge>
                {hasFluency && (
                  <Badge variant="outline" className="text-sm">
                    <span className="font-semibold">{wcpm}</span>&nbsp;WCPM
                  </Badge>
                )}
                <Badge variant="outline" className="text-sm">
                  {accuracyScore ?? 0}% accuracy
                </Badge>
                {hasFluency && fluencyScore != null ? (
                  <Badge variant="outline" className="text-sm">
                    Fluency {fluencyScore}/100
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-sm">
                    {wpmScore ?? 0} WPM
                  </Badge>
                )}
                {analysisJson.hallucinationSuspected && (
                  <Badge variant="outline" className="text-sm bg-amber-50 text-amber-800 border-amber-300">
                    Possibly silent — re-record
                  </Badge>
                )}
              </div>

              {/* Band chip with native parenthetical for teacher reference. */}
              {eslWcpmBand && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <Badge className={`${BAND_COLOR[eslWcpmBand]} border`}>
                    {BAND_LABEL[eslWcpmBand]} — ESL
                  </Badge>
                  {nativeWcpmBand && nativeWcpmBand !== eslWcpmBand && (
                    <span className="text-xs text-gray-600">
                      L1 norm: <span className="font-medium">{BAND_LABEL[nativeWcpmBand]}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Prosody trio + per-dimension Claude notes. The dot meters
                  give the at-a-glance score; the notes underneath explain
                  what the model heard in 1-2 sentences. Pace has no note —
                  it's wholly derived from the WCPM band already shown above. */}
              {(phrasingScore != null || smoothnessScore != null || paceScore != null) && (
                <div className="bg-white border rounded-lg p-3 space-y-3">
                  <div className="flex gap-4">
                    <ProsodyMeter label="Phrasing" score={phrasingScore} />
                    <ProsodyMeter label="Smoothness" score={smoothnessScore} />
                    <ProsodyMeter label="Pace" score={paceScore} />
                  </div>
                  {(analysisJson.claude?.prosody?.phrasingNotes ||
                    analysisJson.claude?.prosody?.smoothnessNotes) && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      {analysisJson.claude?.prosody?.phrasingNotes && (
                        <div className="text-sm space-y-0.5">
                          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide">
                            Phrasing
                          </span>
                          <p className="text-gray-800 leading-relaxed">
                            {analysisJson.claude.prosody.phrasingNotes}
                          </p>
                          {analysisJson.claude.prosody.phrasingNotesZh && (
                            <p lang="zh-Hant" className="text-xs text-gray-500 leading-relaxed">
                              {analysisJson.claude.prosody.phrasingNotesZh}
                            </p>
                          )}
                        </div>
                      )}
                      {analysisJson.claude?.prosody?.smoothnessNotes && (
                        <div className="text-sm space-y-0.5">
                          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide">
                            Smoothness
                          </span>
                          <p className="text-gray-800 leading-relaxed">
                            {analysisJson.claude.prosody.smoothnessNotes}
                          </p>
                          {analysisJson.claude.prosody.smoothnessNotesZh && (
                            <p lang="zh-Hant" className="text-xs text-gray-500 leading-relaxed">
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
                <div className="bg-white border rounded-lg p-3 space-y-1">
                  <h4 className="text-xs font-medium text-gray-700">Teacher notes</h4>
                  <p className="text-sm text-gray-800 leading-relaxed">{teacherSummary}</p>
                  {teacherSummaryZh && (
                    <p
                      lang="zh-Hant"
                      className="text-sm text-gray-500 leading-relaxed"
                    >
                      {teacherSummaryZh}
                    </p>
                  )}
                </div>
              )}

              {/* Strengths + focus areas from the Claude prosody block. Each
                  item is ONE sentence in English with a Traditional Mandarin
                  translation right below it for Taiwanese teachers. Legacy
                  string-only items still render — bilingual() handles both. */}
              {(analysisJson.claude?.prosody?.strengths?.length ||
                analysisJson.claude?.prosody?.focusAreas?.length) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {analysisJson.claude?.prosody?.strengths?.length ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-green-800 mb-1 uppercase tracking-wide">
                        Strengths
                      </h4>
                      <ul className="space-y-1.5">
                        {analysisJson.claude.prosody.strengths.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="text-gray-800">
                              <span className="block">• {en}</span>
                              {zh && (
                                <span
                                  lang="zh-Hant"
                                  className="block pl-3 text-xs text-gray-500"
                                >
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
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-amber-800 mb-1 uppercase tracking-wide">
                        Focus areas
                      </h4>
                      <ul className="space-y-1.5">
                        {analysisJson.claude.prosody.focusAreas.map((raw, i) => {
                          const { en, zh } = bilingual(raw);
                          return (
                            <li key={i} className="text-gray-800">
                              <span className="block">• {en}</span>
                              {zh && (
                                <span
                                  lang="zh-Hant"
                                  className="block pl-3 text-xs text-gray-500"
                                >
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

              <div className="text-xs text-gray-600">
                {analysisJson.matched ?? 0} correct ·{' '}
                {analysisJson.substituted ?? 0} mispronounced ·{' '}
                {analysisJson.missed ?? 0} skipped ·{' '}
                {analysisJson.inserted ?? 0} extra
              </div>

              {analysisJson.expectedView && analysisJson.expectedView.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-1">Story (with errors highlighted)</h4>
                  <p className="text-sm leading-relaxed bg-white rounded p-3 border">
                    {analysisJson.expectedView.map((tok, i) => {
                      const sep = i > 0 ? ' ' : '';
                      if (tok.op === 'match') return <span key={i}>{sep}{tok.word}</span>;
                      if (tok.op === 'sub')
                        return (
                          <span
                            key={i}
                            className="bg-yellow-200 text-yellow-900 rounded px-0.5"
                            title={`Heard: "${tok.heard ?? ''}"`}
                          >
                            {sep}{tok.word}
                          </span>
                        );
                      // del
                      return (
                        <span
                          key={i}
                          className="bg-red-100 text-red-700 line-through rounded px-0.5"
                          title="Skipped"
                        >
                          {sep}{tok.word}
                        </span>
                      );
                    })}
                  </p>
                  <div className="flex gap-3 mt-1 text-[11px] text-gray-500">
                    <span><span className="bg-yellow-200 px-1 rounded">word</span> mispronounced</span>
                    <span><span className="bg-red-100 line-through px-1 rounded">word</span> skipped</span>
                  </div>
                </div>
              )}

              {transcript && (
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-1">Transcript</h4>
                  <p className="text-sm text-gray-800 bg-white rounded p-3 border whitespace-pre-wrap">
                    {transcript}
                  </p>
                </div>
              )}
            </>
          )}

          {hasError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {analysisJson?.error}
            </div>
          )}

          {reanalyzeError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              {reanalyzeError}
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reanalyze}
            disabled={reanalyzing}
            className="gap-2"
          >
            <RotateCw className={`w-3 h-3 ${reanalyzing ? 'animate-spin' : ''}`} />
            {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
          </Button>
        </div>
      )}
    </div>
  );
}
