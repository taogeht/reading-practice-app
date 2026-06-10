'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { getBook, type BookSlug } from '@/lib/practice/books';
import {
  EXERCISE_META,
  type TestDocument,
  type TestItem,
  type TestSection,
} from '@/lib/practice/test-types';

type TestRow = {
  id: string;
  title: string;
  bookSlug: BookSlug;
  units: number[];
  document: TestDocument;
  createdAt: string;
};

// Part labels: Part A, Part B, … by section order.
const PART_LETTERS = 'ABCDEFGH'.split('');

// Deterministic order for circle-the-word choices so they don't reshuffle on
// every re-render. Sorts by a cheap hash of (itemId + word).
function seededOrder(itemId: string, words: string[]): string[] {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  return [...words].sort((a, b) => hash(itemId + a) - hash(itemId + b));
}

// Splits a prompt on its "____" blank so we can render a styled fill line.
function renderBlank(prompt: string, kind: 'short' | 'long') {
  const parts = prompt.split('____');
  const line = kind === 'long' ? 'inline-block w-32 border-b border-gray-800' : 'inline-block w-16 border-b border-gray-800';
  return (
    <span>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className={`${line} align-baseline`}>&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

export default function TestPrintPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [test, setTest] = useState<TestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/tests/${id}`);
        const data = await res.json();
        if (res.ok) setTest(data.test);
        else setError(data?.error || 'Failed to load test');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Flatten items with a running question number + the owning section.
  const numbered = useMemo(() => {
    if (!test) return [];
    let n = 0;
    return test.document.sections.map((section) => ({
      section,
      items: section.items.map((item) => ({ item, number: ++n })),
    }));
  }, [test]);

  // Poll while any item still lacks its image (background generation).
  const pendingImages = useMemo(
    () =>
      test
        ? test.document.sections.flatMap((s) => s.items).some((it) => it.imagePrompt && !it.imageUrl)
        : false,
    [test],
  );
  useEffect(() => {
    if (!pendingImages) return;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > 3 * 60 * 1000) {
        clearInterval(interval);
        return;
      }
      load(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [pendingImages, load]);

  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (!t) return;
    const res = await fetch(`/api/tests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t }),
    });
    if (res.ok) {
      setTest((prev) => (prev ? { ...prev, title: t } : prev));
      setEditingTitle(false);
    }
  };

  const regenerate = async (item: TestItem) => {
    setBusyItem(item.id);
    try {
      const res = await fetch(`/api/tests/${id}/regenerate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTest((prev) => prev && patchItem(prev, item.id, { imageUrl: data.imageUrl }));
      }
    } finally {
      setBusyItem(null);
    }
  };

  const removeItem = async (item: TestItem) => {
    if (!confirm('Remove this question from the test?')) return;
    setBusyItem(item.id);
    try {
      const res = await fetch(`/api/tests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeItemId: item.id }),
      });
      const data = await res.json();
      if (res.ok) setTest(data.test);
    } finally {
      setBusyItem(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-gray-500">Loading…</div>;
  }
  if (error || !test) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-500">
        {error || 'Test not found'}
      </div>
    );
  }

  const book = getBook(test.bookSlug);
  const unitsLabel = [...test.units].sort((a, b) => a - b).join(', ');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Print rules: hide everything except #worksheet, page-break the key. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #worksheet, #worksheet * { visibility: visible !important; }
          #worksheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .answer-key { break-before: page; }
          .test-item { break-inside: avoid; }
          @page { margin: 1.4cm; }
          img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="max-w-[820px] mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/teacher/tests')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            All tests
          </Button>
          <div className="flex items-center gap-2">
            {pendingImages && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Drawing pictures…
              </span>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>

      {/* The sheet */}
      <div className="max-w-[820px] mx-auto p-4 sm:p-8">
        <div id="worksheet" className="bg-white shadow-sm rounded-lg p-8 sm:p-10 text-[15px] leading-relaxed text-gray-900">
          {/* Header */}
          <div className="border-b-2 border-gray-900 pb-3 mb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                {editingTitle ? (
                  <div className="no-print flex items-center gap-2">
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-lg font-bold"
                      autoFocus
                    />
                    <Button size="icon" className="h-7 w-7" onClick={saveTitle}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditingTitle(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    {test.title}
                    <button
                      className="no-print text-gray-400 hover:text-gray-700"
                      onClick={() => {
                        setTitleDraft(test.title);
                        setEditingTitle(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </h1>
                )}
                <div className="text-xs text-gray-600 mt-1">
                  {book?.title} · Unit{test.units.length > 1 ? 's' : ''} {unitsLabel}
                </div>
              </div>
              <div className="text-sm text-right whitespace-nowrap">
                <div>Name: ____________</div>
                <div className="mt-2">Date: ____________</div>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {numbered.map(({ section, items }, si) => (
              <section key={si} className="space-y-3">
                <h2 className="font-bold text-gray-900">
                  Part {PART_LETTERS[si]} — {section.instruction}
                </h2>
                <div className="space-y-4">
                  {items.map(({ item, number }) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      number={number}
                      type={section.type}
                      busy={busyItem === item.id}
                      onRegenerate={() => regenerate(item)}
                      onRemove={() => removeItem(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Answer key (new page) */}
          <div className="answer-key mt-10 pt-6 border-t-2 border-gray-900">
            <h2 className="font-bold text-gray-900 mb-3">Answer Key</h2>
            <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
              {numbered.flatMap(({ items }) =>
                items.map(({ item, number }) => (
                  <li key={item.id} className="flex gap-2">
                    <span className="font-semibold text-gray-500">{number}.</span>
                    <span>{formatAnswer(item)}</span>
                  </li>
                )),
              )}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAnswer(item: TestItem): string {
  const a = item.correctAnswer;
  if (a === 'true') return 'True';
  if (a === 'false') return 'False';
  return a;
}

function patchItem(test: TestRow, itemId: string, patch: Partial<TestItem>): TestRow {
  return {
    ...test,
    document: {
      sections: test.document.sections.map((s) => ({
        ...s,
        items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
      })),
    },
  };
}

function ItemRow({
  item,
  number,
  type,
  busy,
  onRegenerate,
  onRemove,
}: {
  item: TestItem;
  number: number;
  type: TestSection['type'];
  busy: boolean;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="test-item flex items-start gap-3 group">
      <span className="font-semibold text-gray-700 pt-0.5 w-5 shrink-0">{number}.</span>

      {/* Image (if any) */}
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-24 w-24 rounded border border-gray-200 object-contain shrink-0 bg-white"
        />
      ) : item.imagePrompt ? (
        <div className="no-print h-24 w-24 rounded border border-dashed border-gray-300 bg-gray-50 grid place-items-center text-[10px] text-gray-400 shrink-0">
          drawing…
        </div>
      ) : null}

      {/* Body */}
      <div className="flex-1 min-w-0 space-y-2">
        {type === 'circle_word' && (
          <>
            <div>{renderBlank(item.prompt, 'short')}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-900">
              {seededOrder(item.id, [item.correctAnswer, ...item.distractors]).map((w, i) => (
                <span key={i} className="px-1">
                  {w}
                </span>
              ))}
            </div>
          </>
        )}

        {type === 'write_word' && <div>{renderBlank(item.prompt, 'long')}</div>}

        {type === 'true_false' && (
          <div className="flex items-center gap-6">
            <span>{item.prompt}</span>
            <span className="text-gray-900 whitespace-nowrap">True&nbsp;&nbsp;/&nbsp;&nbsp;False</span>
          </div>
        )}

        {type === 'unscramble' && (
          <>
            <div className="text-gray-900">
              {(item.tokens ?? []).map((tok, i) => (
                <span key={i} className="inline-block mr-3 border border-gray-300 rounded px-2 py-0.5 text-sm">
                  {tok}
                </span>
              ))}
            </div>
            <div className="border-b border-gray-800 h-5" />
          </>
        )}
      </div>

      {/* Per-item controls (screen only) */}
      <div className="no-print flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
        {item.imagePrompt && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRegenerate}
            disabled={busy}
            title="Regenerate picture"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRemove}
          disabled={busy}
          title="Remove question"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </Button>
      </div>
    </div>
  );
}
