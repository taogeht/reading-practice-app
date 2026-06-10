"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ClipboardList } from "lucide-react";

interface ScoreRow {
  testId: string;
  testName: string;
  testType: string;
  testDate: string | null;
  className: string;
  score: number | null;
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-sky-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-500";
}

export function StudentScoresSection({ studentId }: { studentId: string }) {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/students/${studentId}/scores`);
        if (!res.ok) throw new Error("Failed to load test scores");
        const data = await res.json();
        if (!cancelled) setScores(data.scores || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load test scores");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const entered = scores.filter((s) => s.score != null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Test Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : entered.length === 0 ? (
          <p className="text-sm text-gray-500">No test scores recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {entered.map((s) => (
              <li key={s.testId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{s.testName}</span>
                  <span className="block text-xs text-gray-400">
                    {s.className}
                    {s.testDate ? ` · ${s.testDate}` : ""}
                    <span className="capitalize"> · {s.testType}</span>
                  </span>
                </span>
                <span className={`shrink-0 text-lg font-bold ${scoreColor(s.score as number)}`}>
                  {Math.round(s.score as number)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
