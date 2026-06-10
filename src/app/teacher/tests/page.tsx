'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Copy,
  FileText,
  Loader2,
  Minus,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { UNITS } from '@/lib/practice/units';
import { BOOKS, DEFAULT_BOOK_SLUG, getBook, type BookSlug } from '@/lib/practice/books';
import {
  ALL_EXERCISE_TYPES,
  DEFAULT_COMPOSITION,
  EXERCISE_META,
  type TestExerciseType,
} from '@/lib/practice/test-types';

type TestRow = {
  id: string;
  title: string;
  bookSlug: BookSlug;
  units: number[];
  active: boolean;
  createdAt: string;
};

const DEFAULT_COUNTS: Record<TestExerciseType, number> = ALL_EXERCISE_TYPES.reduce(
  (acc, t) => {
    acc[t] = DEFAULT_COMPOSITION.find((c) => c.type === t)?.count ?? 0;
    return acc;
  },
  {} as Record<TestExerciseType, number>,
);

export default function TestsPage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedBook, setSelectedBook] = useState<BookSlug>(DEFAULT_BOOK_SLUG);
  const currentBook = getBook(selectedBook);
  const availableUnits = useMemo(() => currentBook?.availableUnits ?? [], [currentBook]);
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Record<TestExerciseType, number>>(DEFAULT_COUNTS);
  const [title, setTitle] = useState('');

  const totalItems = ALL_EXERCISE_TYPES.reduce((sum, t) => sum + counts[t], 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tests');
      const data = await res.json();
      if (res.ok) setTests(data.tests);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset unit selection when switching books (unit numbers don't carry over).
  useEffect(() => {
    setSelectedUnits(new Set());
  }, [selectedBook]);

  const toggleUnit = (u: number) => {
    setSelectedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const bump = (t: TestExerciseType, delta: number) => {
    setCounts((prev) => ({ ...prev, [t]: Math.max(0, Math.min(20, prev[t] + delta)) }));
  };

  const generate = async () => {
    setError(null);
    if (selectedUnits.size === 0) {
      setError('Pick at least one unit.');
      return;
    }
    if (totalItems === 0) {
      setError('Add at least one question.');
      return;
    }
    setGenerating(true);
    try {
      const composition = ALL_EXERCISE_TYPES.filter((t) => counts[t] > 0).map((t) => ({
        type: t,
        count: counts[t],
      }));
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookSlug: selectedBook,
          units: [...selectedUnits].sort((a, b) => a - b),
          composition,
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate test');
      router.push(`/teacher/tests/${data.test.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate test');
      setGenerating(false);
    }
  };

  const clone = async (id: string) => {
    const res = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneFrom: id }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/teacher/tests/${data.test.id}`);
  };

  const archive = async (id: string) => {
    if (!confirm('Archive this test? It will be removed from your list.')) return;
    const res = await fetch(`/api/tests/${id}`, { method: 'DELETE' });
    if (res.ok) setTests((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push('/teacher/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Tests</h1>
        </div>

        {/* ---- New test ---- */}
        <Card>
          <CardHeader>
            <CardTitle>New test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Book */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Book
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {BOOKS.map((b) => {
                  const hasContent = b.availableUnits.length > 0;
                  return (
                    <button
                      key={b.slug}
                      onClick={() => hasContent && setSelectedBook(b.slug)}
                      disabled={!hasContent}
                      className={`text-left rounded-lg p-3 border-2 transition ${
                        selectedBook === b.slug
                          ? 'border-indigo-500 bg-indigo-50'
                          : hasContent
                            ? 'border-gray-200 bg-white hover:border-indigo-300'
                            : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="text-xs font-semibold text-indigo-700">{b.shortLabel}</div>
                      <div className="text-[11px] text-gray-600 mt-1">
                        {hasContent ? `${b.availableUnits.length} units` : 'No curriculum'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Units (multi-select) */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Units to cover{' '}
                {selectedUnits.size > 0 && (
                  <span className="text-indigo-600">({selectedUnits.size} selected)</span>
                )}
              </div>
              {availableUnits.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">No curriculum for this book yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableUnits.map((u) => {
                    const topic =
                      selectedBook === DEFAULT_BOOK_SLUG
                        ? UNITS.find((x) => x.unit === u)?.topic
                        : null;
                    const on = selectedUnits.has(u);
                    return (
                      <button
                        key={u}
                        onClick={() => toggleUnit(u)}
                        title={topic ?? undefined}
                        className={`rounded-full px-3 py-1.5 text-sm border-2 transition ${
                          on
                            ? 'border-indigo-500 bg-indigo-500 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                        }`}
                      >
                        Unit {u}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Composition */}
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Questions ({totalItems} total)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_EXERCISE_TYPES.map((t) => (
                  <div
                    key={t}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm font-medium text-gray-800">{EXERCISE_META[t].label}</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => bump(t, -1)}
                        disabled={counts[t] === 0}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">
                        {counts[t]}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => bump(t, 1)}
                        disabled={counts[t] >= 20}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Title + generate */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Title (optional)
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unit 12–13 Review Test"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <Button onClick={generate} disabled={generating} className="h-10">
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Generate test
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}
            {generating && (
              <div className="text-xs text-gray-500">
                Writing questions… pictures are drawn in the background and appear on the test page.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Saved tests ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Saved tests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading…</div>
            ) : tests.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No tests yet. Generate your first one above.
              </div>
            ) : (
              <div className="space-y-2">
                {tests.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => router.push(`/teacher/tests/${t.id}`)}
                    >
                      <div className="font-semibold text-gray-900">{t.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {getBook(t.bookSlug)?.shortLabel ?? t.bookSlug}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          Units {[...t.units].sort((a, b) => a - b).join(', ')} ·{' '}
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/teacher/tests/${t.id}`)}
                        title="Open & print"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => clone(t.id)} title="Duplicate">
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archive(t.id)}
                        title="Archive"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
