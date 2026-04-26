'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

type UnitStat = {
  unit: number;
  attempts: number;
  correct: number;
  accuracy: number;
  lastAttemptAt: string | null;
};

type FlaggedQuestion = {
  questionId: string;
  unit: number;
  prompt: string;
  correctAnswer: string;
  imageUrl: string | null;
  totalAttempts: number;
  wrongAttempts: number;
  lastWrongAt: string | null;
};

type Response = {
  unitStats: UnitStat[];
  flaggedQuestions: FlaggedQuestion[];
};

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TeacherStudentPracticeSection({ studentId }: { studentId: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/students/${studentId}/practice`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load practice activity');
        if (!cancelled) setData(json as Response);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          Practice Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && data && (
          <>
            {data.unitStats.length === 0 ? (
              <p className="text-sm text-gray-600">
                This student hasn't answered any practice questions yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                      <th className="py-2 pr-4">Unit</th>
                      <th className="py-2 pr-4">Attempts</th>
                      <th className="py-2 pr-4">Correct</th>
                      <th className="py-2 pr-4">Accuracy</th>
                      <th className="py-2">Last attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unitStats.map((u) => {
                      const info = UNITS.find((x) => x.unit === u.unit);
                      return (
                        <tr key={u.unit} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium text-gray-900">
                            <span className="mr-1">{info?.emoji ?? '📖'}</span>
                            Unit {u.unit}
                            {info?.topic && (
                              <span className="text-gray-500 font-normal"> — {info.topic}</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-gray-700">{u.attempts}</td>
                          <td className="py-2 pr-4 text-gray-700">{u.correct}</td>
                          <td className="py-2 pr-4">
                            <Badge
                              className={
                                u.accuracy >= 80
                                  ? 'bg-green-100 text-green-800 border-green-300'
                                  : u.accuracy >= 50
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                    : 'bg-red-100 text-red-800 border-red-300'
                              }
                            >
                              {u.accuracy}%
                            </Badge>
                          </td>
                          <td className="py-2 text-gray-600">
                            {formatRelative(u.lastAttemptAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Questions to review
                <span className="text-xs font-normal text-gray-500">
                  (got wrong at least once)
                </span>
              </h4>

              {data.flaggedQuestions.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No mistakes to review — every question this student has seen, they got right.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.flaggedQuestions.map((q) => (
                    <li
                      key={q.questionId}
                      className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3"
                    >
                      {q.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={q.imageUrl}
                          alt=""
                          className="h-14 w-14 rounded border border-gray-200 bg-white object-contain shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded border border-dashed border-gray-300 bg-white shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{q.prompt}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-gray-500">Unit {q.unit}</span>
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            answer: {q.correctAnswer}
                          </Badge>
                          <span className="text-red-700 font-medium">
                            wrong {q.wrongAttempts}/{q.totalAttempts}
                          </span>
                          <span className="text-gray-500">
                            last missed {formatRelative(q.lastWrongAt)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
