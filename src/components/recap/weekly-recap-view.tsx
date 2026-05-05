"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, CalendarDays, BookOpen, Sparkles } from "lucide-react";
import {
  BEHAVIORS,
  BEHAVIOR_RATING_COLOR,
  BEHAVIOR_RATING_LABEL,
  type BehaviorFormat,
  type BehaviorRating,
  type BehaviorRatingsMap,
} from "@/lib/recap/behaviors";

interface RecapData {
  id: string;
  classId: string;
  className?: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  pagesCovered: string | null;
  vocabulary: string | null;
  spellingTestInfo: string | null;
  grammarTestInfo: string | null;
  homework: string | null;
  behaviorFormat: BehaviorFormat;
  status: 'draft' | 'published';
  submittedAt: string | null;
}

interface EntryData {
  id: string;
  recapId: string;
  studentId: string;
  behaviorRatings: BehaviorRatingsMap | null;
  teacherComment: string | null;
  parentConfirmedAt: string | null;
}

interface HistoryItem {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  className: string;
}

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getMonth() === e.getMonth();
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${sStr} – ${eStr}`;
}

export function WeeklyRecapView() {
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const load = async (week?: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = week ? `/api/student/weekly-recap?week=${week}` : '/api/student/weekly-recap';
      const [currentRes, historyRes] = await Promise.all([
        fetch(url),
        fetch('/api/student/weekly-recap?history=true'),
      ]);
      const data = await currentRes.json();
      if (!currentRes.ok) throw new Error(data?.error || 'Load failed');
      setRecap(data.recap);
      setEntry(data.entry);
      const hist = await historyRes.json();
      setHistory(hist.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirmReview = async () => {
    if (!recap) return;
    setConfirming(true);
    try {
      const res = await fetch('/api/student/weekly-recap?action=confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recapId: recap.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Confirm failed');
      setEntry((prev) =>
        prev ? { ...prev, parentConfirmedAt: data.parentConfirmedAt } : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }

  if (!recap) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-500">
          <CalendarDays className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-sm">Your teacher hasn&apos;t posted this week&apos;s recap yet.</p>
          <p className="text-xs text-gray-400 mt-1">Check back later or ask in class.</p>
        </CardContent>
      </Card>
    );
  }

  const confirmed = !!entry?.parentConfirmedAt;
  const isCurrent = !selectedWeek || selectedWeek === recap.weekNumber;
  const otherWeeks = history.filter((h) => h.weekNumber !== recap.weekNumber);

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <Card className="border-indigo-200 bg-gradient-to-b from-indigo-50/40 to-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                Week {recap.weekNumber}
                <span className="text-sm font-normal text-gray-500">
                  · {formatRange(recap.startDate, recap.endDate)}
                </span>
              </CardTitle>
              {recap.className && (
                <div className="text-xs text-gray-500 mt-0.5">{recap.className}</div>
              )}
            </div>
            {!isCurrent && (
              <Button variant="outline" size="sm" onClick={() => { setSelectedWeek(null); load(); }}>
                Back to current week
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {recap.pagesCovered && (
            <Section icon={<BookOpen className="w-4 h-4" />} title="Pages covered">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{recap.pagesCovered}</pre>
            </Section>
          )}
          {recap.vocabulary && (
            <Section title="Vocabulary">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{recap.vocabulary}</p>
            </Section>
          )}
          {(recap.spellingTestInfo || recap.grammarTestInfo) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recap.spellingTestInfo && (
                <Section title="Spelling test">
                  <p className="text-sm text-gray-800">{recap.spellingTestInfo}</p>
                </Section>
              )}
              {recap.grammarTestInfo && (
                <Section title="Grammar test">
                  <p className="text-sm text-gray-800">{recap.grammarTestInfo}</p>
                </Section>
              )}
            </div>
          )}
          {recap.homework && (
            <Section title="Homework">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{recap.homework}</p>
            </Section>
          )}

          {/* Behavior section — shape depends on the recap's format */}
          {entry && (
            <div className="border-t pt-4 mt-2">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                From your teacher
              </div>
              {recap.behaviorFormat === 'checklist' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BEHAVIORS.map((b) => {
                    const v = (entry.behaviorRatings ?? {})[b.key];
                    return (
                      <div key={b.key} className="flex items-center justify-between bg-white border rounded px-3 py-2">
                        <span className="text-sm text-gray-800">{b.label}</span>
                        {v ? (
                          <Badge className={`${BEHAVIOR_RATING_COLOR[v as BehaviorRating]} border`}>
                            {BEHAVIOR_RATING_LABEL[v as BehaviorRating]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : entry.teacherComment ? (
                <p className="text-sm text-gray-800 bg-white rounded border p-3 leading-relaxed">
                  {entry.teacherComment}
                </p>
              ) : (
                <p className="text-xs text-gray-400 italic">No comment from teacher this week.</p>
              )}
            </div>
          )}

          {/* Parent confirmation */}
          <div className="border-t pt-4">
            {confirmed ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Check className="w-4 h-4" />
                Parent reviewed on{' '}
                {new Date(entry!.parentConfirmedAt!).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            ) : (
              <Button
                onClick={confirmReview}
                disabled={confirming}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {confirming ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Parent: I&apos;ve reviewed this week
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {otherWeeks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Previous weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {otherWeeks.map((h) => (
                <Button
                  key={h.id}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedWeek(h.weekNumber);
                    load(h.weekNumber);
                  }}
                >
                  Week {h.weekNumber}
                  <span className="ml-2 text-xs text-gray-500">{formatRange(h.startDate, h.endDate)}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
