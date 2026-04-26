'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Target } from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

type UnitStat = {
  unit: number;
  attempts: number;
  correct: number;
  accuracy: number;
  lastAttemptAt: string | null;
};

type StatsResponse = {
  unitStats: UnitStat[];
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracy: number;
};

export function PracticeStatsCard() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/student/practice/stats');
        if (!res.ok) return;
        const json = (await res.json()) as StatsResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data || data.totalAttempts === 0) return null;

  return (
    <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Trophy className="w-5 h-5 text-amber-500" />
          Your Practice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/70 p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{data.totalAttempts}</div>
            <div className="text-xs font-medium text-amber-900/80">Questions answered</div>
          </div>
          <div className="rounded-lg bg-white/70 p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{data.totalCorrect}</div>
            <div className="text-xs font-medium text-green-900/80">Got right</div>
          </div>
          <div className="rounded-lg bg-white/70 p-3 text-center">
            <div className="text-2xl font-bold text-indigo-700">{data.overallAccuracy}%</div>
            <div className="text-xs font-medium text-indigo-900/80">Overall</div>
          </div>
        </div>

        <div className="space-y-2">
          {data.unitStats.map((u) => {
            const info = UNITS.find((x) => x.unit === u.unit);
            return (
              <div
                key={u.unit}
                className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{info?.emoji ?? '📖'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      Unit {u.unit}
                      {info?.topic ? ` — ${info.topic}` : ''}
                    </div>
                    <div className="text-xs text-gray-500">
                      {u.correct} / {u.attempts} correct
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold text-gray-700 shrink-0">
                  <Target className="w-3.5 h-3.5 text-indigo-500" />
                  {u.accuracy}%
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
