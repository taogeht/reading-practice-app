"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCw, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

// Mirror of the persisted analysis_json shape. Kept loose because we may
// extend it; the panel only needs a few fields.
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
}

interface Props {
  recordingId: string;
  letterGrade: string | null;
  accuracyScore: number | null;
  wpmScore: number | null;
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

export function AIAnalysisPanel({
  recordingId,
  letterGrade,
  accuracyScore,
  wpmScore,
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
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-purple-900 text-sm">AI Analysis</span>
          {hasResults && (
            <div className="flex items-center gap-2">
              <Badge className={`${gradeColor(letterGrade)} border`}>{letterGrade ?? '—'}</Badge>
              {accuracyScore !== null && (
                <span className="text-xs text-gray-700">{accuracyScore}% accuracy</span>
              )}
              {wpmScore !== null && (
                <span className="text-xs text-gray-500">· {wpmScore} WPM</span>
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
              <div className="flex flex-wrap gap-2 pt-3">
                <Badge className={`${gradeColor(letterGrade)} border text-base px-3 py-1`}>
                  {letterGrade ?? '—'}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {accuracyScore ?? 0}% accuracy
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {wpmScore ?? 0} WPM
                </Badge>
                {analysisJson.hallucinationSuspected && (
                  <Badge variant="outline" className="text-sm bg-amber-50 text-amber-800 border-amber-300">
                    Possibly silent — re-record
                  </Badge>
                )}
              </div>

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
