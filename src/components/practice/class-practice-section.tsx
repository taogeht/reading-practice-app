'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

type UnitStat = {
  unit: number;
  attempts: number;
  correct: number;
  activeStudents: number;
  accuracy: number;
  lastAttemptAt: string | null;
};

type StudentStat = {
  studentId: string;
  firstName: string;
  lastName: string;
  attempts: number;
  correct: number;
  accuracy: number;
  lastAttemptAt: string | null;
};

type Response = {
  unitStats: UnitStat[];
  studentStats: StudentStat[];
};

interface ClassPracticeSectionProps {
  classId: string;
  defaultExpanded?: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function accuracyBadge(accuracy: number, attempts: number) {
  if (attempts === 0) return <span className="text-xs text-gray-400">no attempts</span>;
  const cls =
    accuracy >= 80
      ? 'bg-green-100 text-green-800 border-green-300'
      : accuracy >= 50
        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
        : 'bg-red-100 text-red-800 border-red-300';
  return <Badge className={cls}>{accuracy}%</Badge>;
}

export function ClassPracticeSection({
  classId,
  defaultExpanded = false,
}: ClassPracticeSectionProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/classes/${classId}/practice`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load practice rollup');
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
  }, [classId]);

  const totalAttempts = data?.studentStats.reduce((s, x) => s + x.attempts, 0) ?? 0;
  const activeStudents = data?.studentStats.filter((x) => x.attempts > 0).length ?? 0;

  return (
    <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <div>
            <h3 className="font-medium">Practice Activity</h3>
            <p className="text-sm text-gray-500">
              {totalAttempts > 0
                ? `${activeStudents} student${activeStudents !== 1 ? 's' : ''} have practiced — ${totalAttempts} total attempts`
                : 'No practice attempts yet'}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {isExpanded && (
        <CardContent className="pt-0 border-t space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {error && <div className="text-sm text-red-600 py-2">{error}</div>}

          {!loading && !error && data && (
            <>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 mt-4">
                  By unit
                </h4>
                {data.unitStats.length === 0 ? (
                  <p className="text-sm text-gray-600">No unit activity yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                          <th className="py-2 pr-4">Unit</th>
                          <th className="py-2 pr-4">Students</th>
                          <th className="py-2 pr-4">Attempts</th>
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
                              <td className="py-2 pr-4 text-gray-700">{u.activeStudents}</td>
                              <td className="py-2 pr-4 text-gray-700">{u.attempts}</td>
                              <td className="py-2 pr-4">{accuracyBadge(u.accuracy, u.attempts)}</td>
                              <td className="py-2 text-gray-600">{formatRelative(u.lastAttemptAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  By student
                </h4>
                {data.studentStats.length === 0 ? (
                  <p className="text-sm text-gray-600">No students enrolled yet.</p>
                ) : (
                  <div className="space-y-1">
                    {data.studentStats.map((s) => (
                      <div
                        key={s.studentId}
                        className="flex items-center justify-between gap-3 rounded border border-gray-100 bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {s.attempts} attempts · last {formatRelative(s.lastAttemptAt)}
                          </div>
                        </div>
                        <div className="shrink-0">{accuracyBadge(s.accuracy, s.attempts)}</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/teacher/students/${s.studentId}`);
                          }}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
