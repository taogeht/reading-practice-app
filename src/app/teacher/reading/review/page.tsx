"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, BookOpen, Loader2, Sparkles } from "lucide-react";
import { READING_LEVELS } from "@/lib/reading/levels";

interface PassageRow {
  id: string;
  title: string;
  readingLevel: number;
  status: 'draft' | 'review' | 'published' | 'archived';
  pageCount: number;
  coverImageKey: string | null;
  summary: string | null;
  generationMeta: {
    qualityReport?: {
      proseScore: number;
      questionsScore: number;
      imagesValid: boolean;
      passageReady: boolean;
    };
    totalInputTokens?: number;
    totalOutputTokens?: number;
  } | null;
  createdAt: string;
  questionCount: number;
}

type StatusFilter = 'review' | 'draft' | 'published' | 'archived' | 'all';
type SortKey = 'quality' | 'recency';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? '' : 's'} ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

function combinedScore(p: PassageRow): number {
  const q = p.generationMeta?.qualityReport;
  if (!q) return 0;
  return (q.proseScore + q.questionsScore) / 2;
}

function qualityVerdict(score: number): { label: string; className: string } {
  if (score >= 0.85)
    return { label: 'Likely OK', className: 'bg-green-100 text-green-800 border-green-300' };
  if (score >= 0.5)
    return { label: 'Needs review', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
  return { label: 'Needs work', className: 'bg-red-100 text-red-800 border-red-300' };
}

function levelLabel(id: number): string {
  const lv = READING_LEVELS.find((l) => l.id === id);
  return lv ? `Level ${lv.id} — ${lv.name}` : `Level ${id}`;
}

export default function ReadingReviewListPage() {
  const router = useRouter();
  const [passages, setPassages] = useState<PassageRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Read an optional `?status=` deep-link so the /teacher/reading hub
  // can drop the user into this page with a specific filter pre-set
  // ("Browse library" → ?status=published). Unknown values fall back
  // to the default of 'review' so a typo can't render an empty page.
  const searchParams = useSearchParams();
  const initialStatus: StatusFilter = (() => {
    const q = searchParams?.get('status');
    if (q === 'review' || q === 'draft' || q === 'published' || q === 'archived' || q === 'all') {
      return q;
    }
    return 'review';
  })();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('quality');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('status', statusFilter);
        params.set('sort', sort);
        if (levelFilter !== 'all') params.set('level', levelFilter);
        const res = await fetch(`/api/teacher/reading/passages?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setPassages(data.passages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, levelFilter, sort]);

  const list = useMemo(() => passages ?? [], [passages]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/teacher/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Reading library — review queue</h1>
                <p className="text-gray-600 mt-1 text-sm">
                  Generated passages waiting for teacher review. Approve to publish, reject to archive.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide">Status</label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-44 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide">Reading level</label>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-44 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {READING_LEVELS.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      Level {l.id} — {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-600 uppercase tracking-wide">Sort</label>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-44 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">Highest quality first</SelectItem>
                  <SelectItem value="recency">Newest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-red-700">Error: {error}</CardContent>
          </Card>
        ) : list.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-gray-600">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">No passages match the current filter.</p>
              <p className="text-sm text-gray-500 mt-1">
                Generate some via <code className="font-mono text-xs">npm run test:passage</code>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((p) => {
              const score = combinedScore(p);
              const verdict = qualityVerdict(score);
              const q = p.generationMeta?.qualityReport;
              return (
                <Link
                  key={p.id}
                  href={`/teacher/reading/review/${p.id}`}
                  className="block group"
                >
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      <div className="flex gap-3">
                        <div className="shrink-0 w-24 h-24 rounded bg-gray-100 border overflow-hidden flex items-center justify-center">
                          {p.coverImageKey ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/images/${p.coverImageKey}`}
                              alt={p.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <BookOpen className="w-8 h-8 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h2 className="font-bold text-gray-900 group-hover:text-blue-700 line-clamp-2">
                            {p.title}
                          </h2>
                          <p className="text-xs text-gray-500 mt-1">{levelLabel(p.readingLevel)}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {p.pageCount} pages
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {p.questionCount} Qs
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {p.status}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${verdict.className} border`}>
                          <Sparkles className="w-3 h-3 mr-1" />
                          {verdict.label} ({score.toFixed(2)})
                        </Badge>
                        {q && (
                          <span className="text-xs text-gray-500">
                            P {q.proseScore.toFixed(2)} · Q {q.questionsScore.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-auto pt-2">
                        <span className="text-xs text-gray-500">
                          {relativeTime(p.createdAt)}
                        </span>
                        <Button size="sm" variant="outline">
                          Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
