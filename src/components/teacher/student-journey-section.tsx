"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, BookOpen, Sparkles, CalendarRange } from "lucide-react";

interface ReadingLevelEntry {
  level: string;
  changedAt: string;
  note: string | null;
  changedBy: string | null;
}
interface FluencyPoint {
  month: string;
  avgWcpm: number | null;
  avgFluency: number | null;
  avgAccuracy: number | null;
  count: number;
}
interface XpPoint { month: string; xp: number; events: number }
interface TermGroup {
  termId: string | null;
  termName: string;
  isCurrent: boolean;
  classes: { id: string; name: string; active: boolean; enrolledAt: string }[];
}
interface Journey {
  readingLevelHistory: ReadingLevelEntry[];
  fluencyTrend: FluencyPoint[];
  monthlyXp: XpPoint[];
  enrollmentsByTerm: TermGroup[];
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Minimal dependency-free line chart. Returns null for <2 points (the caller
// shows the single latest value instead).
function Sparkline({ points, stroke }: { points: { value: number }[]; stroke: string }) {
  const width = 280;
  const height = 60;
  const pad = 6;
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={stroke} />
      ))}
    </svg>
  );
}

export function StudentJourneySection({ studentId, refreshKey }: { studentId: string; refreshKey?: number }) {
  const [data, setData] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/students/${studentId}/journey`);
        if (!res.ok) throw new Error("Failed to load journey");
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load journey");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, refreshKey]);

  const wcpmPoints = (data?.fluencyTrend ?? []).filter((p) => p.avgWcpm != null).map((p) => ({ value: p.avgWcpm as number, month: p.month }));
  const latestWcpm = wcpmPoints.at(-1);
  const firstWcpm = wcpmPoints[0];
  const wcpmDelta = latestWcpm && firstWcpm ? Math.round(latestWcpm.value - firstWcpm.value) : null;

  const xp = data?.monthlyXp ?? [];
  const maxXp = Math.max(1, ...xp.map((p) => p.xp));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Progress Journey
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading journey…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            {/* Reading level over time */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <BookOpen className="w-4 h-4 text-gray-400" /> Reading level
              </h3>
              {data && data.readingLevelHistory.length > 0 ? (
                <ol className="relative border-l-2 border-gray-100 ml-1.5 space-y-3">
                  {data.readingLevelHistory.map((e, i) => (
                    <li key={i} className="ml-4">
                      <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{e.level}</Badge>
                        <span className="text-xs text-gray-500">
                          {new Date(e.changedAt).toLocaleDateString()}
                          {e.changedBy ? ` · ${e.changedBy}` : ""}
                          {e.note ? ` · ${e.note}` : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-500">No reading level recorded yet.</p>
              )}
            </section>

            {/* Fluency trend */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <TrendingUp className="w-4 h-4 text-gray-400" /> Fluency trend (WCPM)
              </h3>
              {wcpmPoints.length >= 2 ? (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold text-gray-900">{Math.round(latestWcpm!.value)}</span>
                    <span className="text-xs text-gray-500">WCPM latest</span>
                    {wcpmDelta != null && (
                      <span className={`text-xs font-medium ${wcpmDelta >= 0 ? "text-green-600" : "text-amber-600"}`}>
                        {wcpmDelta >= 0 ? "▲" : "▼"} {Math.abs(wcpmDelta)} since {monthLabel(firstWcpm!.month)}
                      </span>
                    )}
                  </div>
                  <Sparkline points={wcpmPoints} stroke="#2563eb" />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{monthLabel(wcpmPoints[0].month)}</span>
                    <span>{monthLabel(wcpmPoints.at(-1)!.month)}</span>
                  </div>
                </div>
              ) : latestWcpm ? (
                <p className="text-sm text-gray-700">
                  <span className="text-2xl font-bold">{Math.round(latestWcpm.value)}</span> WCPM
                  <span className="text-gray-500 text-xs"> (need more recordings for a trend)</span>
                </p>
              ) : (
                <p className="text-sm text-gray-500">No scored recordings yet.</p>
              )}
            </section>

            {/* Monthly activity (XP) */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Sparkles className="w-4 h-4 text-gray-400" /> Activity (XP / month)
              </h3>
              {xp.length > 0 ? (
                <div className="flex items-end gap-1.5 h-24">
                  {xp.slice(-12).map((p) => (
                    <div key={p.month} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${p.xp} XP · ${p.events} events`}>
                      <div className="w-full flex items-end justify-center" style={{ height: "72px" }}>
                        <div
                          className="w-full max-w-[28px] rounded-t bg-amber-400"
                          style={{ height: `${Math.max(3, (p.xp / maxXp) * 72)}px` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 truncate w-full text-center">{monthLabel(p.month)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No activity recorded yet.</p>
              )}
            </section>

            {/* Enrollment history by term */}
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <CalendarRange className="w-4 h-4 text-gray-400" /> Enrollment history
              </h3>
              {data && data.enrollmentsByTerm.length > 0 ? (
                <div className="space-y-3">
                  {data.enrollmentsByTerm.map((term) => (
                    <div key={term.termId ?? "ungrouped"}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-600">{term.termName}</span>
                        {term.isCurrent && <Badge className="h-4 px-1.5 text-[10px]">Current</Badge>}
                      </div>
                      <ul className="space-y-1">
                        {term.classes.map((c) => (
                          <li key={c.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-800">{c.name}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(c.enrolledAt).toLocaleDateString()}
                              {!c.active ? " · archived" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No enrollment history.</p>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
