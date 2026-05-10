'use client';

// Teacher-side panel surfacing per-vocabulary reading mastery for one
// student. Mirrors the spelling word-mastery section's chrome so the
// per-student detail page reads consistently across features.

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, Target } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MasteryItem {
  vocabularyId: string;
  word: string;
  partOfSpeech: string;
  afFLevel: string | null;
  exposures: number;
  successes: number;
  failures: number;
  masteryScore: number;
  successRate: number | null;
  lastSeenAt: string | null;
}

type FilterMode = 'needs_work' | 'all' | 'mastered';
type SortMode = 'mastery_asc' | 'mastery_desc' | 'recent';

const NEEDS_WORK_THRESHOLD = 0.7;
const MASTERED_THRESHOLD = 0.85;

function masteryColor(score: number): string {
  if (score >= MASTERED_THRESHOLD) return 'bg-green-500';
  if (score >= NEEDS_WORK_THRESHOLD) return 'bg-yellow-400';
  if (score >= 0.4) return 'bg-orange-400';
  return 'bg-red-400';
}

function masteryBadgeClass(score: number): string {
  if (score >= MASTERED_THRESHOLD) return 'text-green-700 border-green-300';
  if (score >= NEEDS_WORK_THRESHOLD) return 'text-yellow-700 border-yellow-300';
  if (score >= 0.4) return 'text-orange-700 border-orange-300';
  return 'text-red-700 border-red-300';
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = (now - then) / 1000;
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StudentReadingMasterySection({
  studentId,
}: {
  studentId: string;
}) {
  const [items, setItems] = useState<MasteryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('needs_work');
  const [sort, setSort] = useState<SortMode>('mastery_asc');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/teacher/students/${studentId}/reading-mastery`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items: MasteryItem[] };
        if (!cancelled) setItems(body.items);
      } catch (err) {
        console.error('reading mastery fetch failed', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (filter === 'needs_work') {
      list = items.filter((i) => i.masteryScore < NEEDS_WORK_THRESHOLD);
    } else if (filter === 'mastered') {
      list = items.filter((i) => i.masteryScore >= MASTERED_THRESHOLD);
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'mastery_asc') return a.masteryScore - b.masteryScore;
      if (sort === 'mastery_desc') return b.masteryScore - a.masteryScore;
      // recent: lastSeenAt desc, nulls last
      const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bT - aT;
    });
    return sorted;
  }, [items, filter, sort]);

  const overall = useMemo(() => {
    if (!items || items.length === 0) return null;
    const mastered = items.filter((i) => i.masteryScore >= MASTERED_THRESHOLD).length;
    const needsWork = items.filter((i) => i.masteryScore < NEEDS_WORK_THRESHOLD).length;
    return { total: items.length, mastered, needsWork };
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          Reading Vocabulary Mastery
          {overall && (
            <Badge variant="outline" className="ml-2 font-normal">
              {overall.mastered} / {overall.total} mastered
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="text-center py-8">
            <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              No reading vocabulary data yet
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Mastery rows will appear once this student finishes a reading
              passage.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-600">Show:</span>
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="needs_work">
                    Needs work (&lt; {Math.round(NEEDS_WORK_THRESHOLD * 100)}%)
                  </SelectItem>
                  <SelectItem value="mastered">
                    Mastered (≥ {Math.round(MASTERED_THRESHOLD * 100)}%)
                  </SelectItem>
                  <SelectItem value="all">All words</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-gray-600 ml-2">Sort:</span>
              <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mastery_asc">Lowest mastery first</SelectItem>
                  <SelectItem value="mastery_desc">Highest mastery first</SelectItem>
                  <SelectItem value="recent">Most recent first</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No words match the current filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase tracking-wide">
                    <tr className="border-b">
                      <th className="text-left py-2 pr-2">Word</th>
                      <th className="text-left py-2 pr-2">POS</th>
                      <th className="text-right py-2 pr-2">Exposures</th>
                      <th className="text-right py-2 pr-2">Success</th>
                      <th className="text-left py-2 pr-2 w-48">Mastery</th>
                      <th className="text-right py-2">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const pct = Math.round(row.masteryScore * 100);
                      const successRatePct =
                        row.successRate !== null
                          ? Math.round(row.successRate * 100)
                          : null;
                      return (
                        <tr
                          key={row.vocabularyId}
                          className="border-b last:border-b-0 hover:bg-gray-50"
                        >
                          <td className="py-2 pr-2 font-semibold text-gray-900">
                            {row.word}
                          </td>
                          <td className="py-2 pr-2 text-gray-500">
                            {row.partOfSpeech}
                          </td>
                          <td className="py-2 pr-2 text-right text-gray-700">
                            {row.exposures}
                          </td>
                          <td className="py-2 pr-2 text-right text-gray-700">
                            {successRatePct !== null
                              ? `${successRatePct}% (${row.successes}/${row.successes + row.failures})`
                              : '—'}
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${masteryColor(row.masteryScore)} transition-all`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <Badge
                                variant="outline"
                                className={`font-normal ${masteryBadgeClass(row.masteryScore)}`}
                              >
                                {pct}%
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 text-right text-gray-500 text-xs">
                            {relativeDate(row.lastSeenAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
