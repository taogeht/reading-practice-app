'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Loader2, Sparkles, BookOpen, SpellCheck2, Headphones, Trophy, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SubjectMinutes {
  reading: number;
  spelling: number;
  assignment: number;
  practice: number;
  general: number;
}

interface ActivityResponse {
  isCurrentlyOnline: boolean;
  currentActivity: {
    type: string;
    label: string | null;
  } | null;
  lastActivityAt: string | null;
  today: {
    totalMinutes: number;
    breakdown: SubjectMinutes;
  };
  thisWeek: {
    totalMinutes: number;
    breakdown: SubjectMinutes;
  };
  thisMonth: {
    totalMinutes: number;
    breakdown: SubjectMinutes;
  };
  recentDailyHistory: Array<{
    date: string;
    totalMinutes: number;
    readingMinutes: number;
    spellingMinutes: number;
    assignmentMinutes: number;
    practiceMinutes: number;
    generalMinutes: number;
  }>;
}

export function StudentTimeActivityCard({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'week' | 'month'>('week');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/students/${studentId}/activity`);
        if (!res.ok) throw new Error('Failed to load student activity');
        const json = await res.json();
        if (!cancelled) setData(json as ActivityResponse);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load activity');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-5 h-5 text-blue-600" />
            Time & Learning Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
          <span className="text-sm text-gray-500">Loading learning time...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null; // Gracefully omit if error occurs
  }

  const activeBreakdown = timeframe === 'week' ? data.thisWeek.breakdown : data.thisMonth.breakdown;
  const activeTotal = timeframe === 'week' ? data.thisWeek.totalMinutes : data.thisMonth.totalMinutes;
  const maxCategoryMinutes = Math.max(
    activeBreakdown.reading,
    activeBreakdown.spelling,
    activeBreakdown.assignment,
    activeBreakdown.practice,
    1
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-5 h-5 text-blue-600" />
            Time & Learning Activity
          </CardTitle>

          {/* Real-time Status Badge */}
          {data.isCurrentlyOnline ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online Now</span>
              {data.currentActivity?.label && (
                <span className="text-emerald-600 font-normal">
                  · {data.currentActivity.label}
                </span>
              )}
            </span>
          ) : data.lastActivityAt ? (
            <span className="text-xs text-gray-500 self-start sm:self-auto">
              Last active {formatDistanceToNow(new Date(data.lastActivityAt), { addSuffix: true })}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Metric Boxes */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
            <span className="text-xs text-gray-500 block font-medium">Today</span>
            <span className="text-xl font-bold text-gray-900 mt-1 block">
              {data.today.totalMinutes}
              <span className="text-xs font-normal text-gray-500 ml-1">min</span>
            </span>
          </div>
          <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-center">
            <span className="text-xs text-blue-800 block font-medium">This Week</span>
            <span className="text-xl font-bold text-blue-900 mt-1 block">
              {data.thisWeek.totalMinutes}
              <span className="text-xs font-normal text-blue-600 ml-1">min</span>
            </span>
          </div>
          <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-200 text-center">
            <span className="text-xs text-indigo-800 block font-medium">This Month</span>
            <span className="text-xl font-bold text-indigo-900 mt-1 block">
              {data.thisMonth.totalMinutes}
              <span className="text-xs font-normal text-indigo-600 ml-1">min</span>
            </span>
          </div>
        </div>

        {/* Subject Breakdown Area */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Subject Time Breakdown
            </h4>
            <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-100 text-xs">
              <button
                type="button"
                onClick={() => setTimeframe('week')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                  timeframe === 'week' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                This week
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('month')}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                  timeframe === 'month' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                This month
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* Reading */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                  Reading Practice
                </span>
                <span className="font-semibold text-gray-900">{activeBreakdown.reading} min</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(activeBreakdown.reading / maxCategoryMinutes) * 100}%` }}
                />
              </div>
            </div>

            {/* Spelling */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-sky-800">
                  <SpellCheck2 className="w-3.5 h-3.5 text-sky-600" />
                  Spelling Games
                </span>
                <span className="font-semibold text-gray-900">{activeBreakdown.spelling} min</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${(activeBreakdown.spelling / maxCategoryMinutes) * 100}%` }}
                />
              </div>
            </div>

            {/* Assignment Practice */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-indigo-800">
                  <Headphones className="w-3.5 h-3.5 text-indigo-600" />
                  Assignment Rehearsal
                </span>
                <span className="font-semibold text-gray-900">{activeBreakdown.assignment} min</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${(activeBreakdown.assignment / maxCategoryMinutes) * 100}%` }}
                />
              </div>
            </div>

            {/* Grammar / Unit Practice */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 font-medium text-purple-800">
                  <Trophy className="w-3.5 h-3.5 text-purple-600" />
                  Grammar & Unit Practice
                </span>
                <span className="font-semibold text-gray-900">{activeBreakdown.practice} min</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${(activeBreakdown.practice / maxCategoryMinutes) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Daily Consistency Timeline (Past 14 Days) */}
        {data.recentDailyHistory.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>Recent Active Days (Past 14 Days)</span>
            </div>
            <div className="flex items-end gap-1 h-14 bg-gray-50/80 p-2 rounded-lg border border-gray-200 overflow-x-auto">
              {data.recentDailyHistory.slice(0, 14).reverse().map((day) => {
                const heightPct = Math.min(Math.max((day.totalMinutes / 60) * 100, 15), 100);
                const shortDate = day.date.slice(5); // "MM-DD"
                return (
                  <div
                    key={day.date}
                    className="flex flex-col items-center flex-1 min-w-[28px] group relative"
                  >
                    <div
                      className="w-full bg-blue-500 hover:bg-blue-600 rounded-t transition-all"
                      style={{ height: `${heightPct}%` }}
                      title={`${day.date}: ${day.totalMinutes} min (Reading: ${day.readingMinutes}m, Spelling: ${day.spellingMinutes}m)`}
                    />
                    <span className="text-[9px] text-gray-400 mt-1 whitespace-nowrap">{shortDate}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
