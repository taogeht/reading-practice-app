"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Loader2,
  Target,
} from "lucide-react";

interface WordMastery {
  wordId: string;
  word: string;
  listTitle: string;
  listWeek: number | null;
  totalAttempts: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWrongGuesses: number;
  avgTimeSeconds: number | null;
}

interface SpellingListOption {
  id: string;
  title: string;
  weekNumber: number | null;
}

interface AttemptRow {
  wordId: string;
  word: string;
  listTitle: string;
  listWeek: number | null;
  won: boolean;
  wrongGuesses: number;
  timeSeconds: number | null;
  activityType: string | null;
  createdAt: string | null;
}

interface MasteryResponse {
  studentId: string;
  totalAttempts: number;
  overallWinRate: number;
  spellingLists: SpellingListOption[];
  wordMastery: WordMastery[];
  attempts: AttemptRow[];
}

interface DayGroup {
  dayKey: string;
  date: Date;
  label: string;
  attempts: AttemptRow[];
  totalAttempts: number;
  wins: number;
  winRate: number;
  uniqueWords: number;
}

const RECENT_DAY_LIMIT = 5;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKeyFor(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d: Date): string {
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(d);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupAttemptsByDay(attempts: AttemptRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const a of attempts) {
    if (!a.createdAt) continue;
    const dt = new Date(a.createdAt);
    const key = dayKeyFor(dt);
    let group = map.get(key);
    if (!group) {
      group = {
        dayKey: key,
        date: startOfLocalDay(dt),
        label: formatDayLabel(dt),
        attempts: [],
        totalAttempts: 0,
        wins: 0,
        winRate: 0,
        uniqueWords: 0,
      };
      map.set(key, group);
    }
    group.attempts.push(a);
    group.totalAttempts++;
    if (a.won) group.wins++;
  }
  for (const g of map.values()) {
    g.winRate = g.totalAttempts > 0 ? Math.round((g.wins / g.totalAttempts) * 100) : 0;
    g.uniqueWords = new Set(g.attempts.map((a) => a.wordId)).size;
  }
  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

interface PerWordRow {
  wordId: string;
  word: string;
  attempts: number;
  wins: number;
  winRate: number;
  totalWrongGuesses: number;
}

function summarizeByWord(attempts: AttemptRow[]): PerWordRow[] {
  const map = new Map<string, PerWordRow>();
  for (const a of attempts) {
    let row = map.get(a.wordId);
    if (!row) {
      row = {
        wordId: a.wordId,
        word: a.word,
        attempts: 0,
        wins: 0,
        winRate: 0,
        totalWrongGuesses: 0,
      };
      map.set(a.wordId, row);
    }
    row.attempts++;
    if (a.won) row.wins++;
    row.totalWrongGuesses += a.wrongGuesses;
  }
  for (const r of map.values()) {
    r.winRate = r.attempts > 0 ? Math.round((r.wins / r.attempts) * 100) : 0;
  }
  return Array.from(map.values()).sort((a, b) => a.winRate - b.winRate);
}

function getMasteryColor(winRate: number): string {
  if (winRate >= 80) return "text-green-700 bg-green-50 border-green-200";
  if (winRate >= 50) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function getMasteryIcon(winRate: number): string {
  if (winRate >= 80) return "🟢";
  if (winRate >= 50) return "🟡";
  return "🔴";
}

function getMasteryBarWidth(winRate: number): string {
  return `${Math.max(4, winRate)}%`;
}

function getMasteryBarColor(winRate: number): string {
  if (winRate >= 80) return "bg-green-500";
  if (winRate >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function DayCard({
  group,
  defaultOpen,
}: {
  group: DayGroup;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const perWord = useMemo(() => summarizeByWord(group.attempts), [group]);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <span className="font-medium text-gray-900">{group.label}</span>
        <span className="text-xs text-gray-500">
          {group.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {group.totalAttempts} {group.totalAttempts === 1 ? "attempt" : "attempts"}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {group.uniqueWords} {group.uniqueWords === 1 ? "word" : "words"}
          </Badge>
          <Badge
            variant="outline"
            className={`font-normal ${getMasteryColor(group.winRate)}`}
          >
            {group.winRate}%
          </Badge>
        </div>
      </button>
      {open && (
        <div className="border-t bg-gray-50/50 px-3 py-2 space-y-1">
          {perWord.map((row) => (
            <div
              key={row.wordId}
              className="flex items-center gap-3 text-sm py-1"
            >
              <span className="text-base">{getMasteryIcon(row.winRate)}</span>
              <span className="font-medium text-gray-900 min-w-[100px]">
                {row.word}
              </span>
              <span className="text-xs text-gray-600">
                {row.wins}/{row.attempts} wins
              </span>
              <span className="text-xs text-gray-400">
                {row.totalWrongGuesses} {row.totalWrongGuesses === 1 ? "miss" : "misses"}
              </span>
              <Badge
                variant="outline"
                className={`ml-auto text-xs ${getMasteryColor(row.winRate)}`}
              >
                {row.winRate}%
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveCard({ groups }: { groups: DayGroup[] }) {
  const [open, setOpen] = useState(false);
  const totalAttempts = groups.reduce((sum, g) => sum + g.totalAttempts, 0);
  const totalWins = groups.reduce((sum, g) => sum + g.wins, 0);
  const archiveWinRate =
    totalAttempts > 0 ? Math.round((totalWins / totalAttempts) * 100) : 0;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <Archive className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="font-medium text-gray-900">Archive</span>
        <span className="text-xs text-gray-500">
          {groups.length} earlier {groups.length === 1 ? "day" : "days"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {totalAttempts} {totalAttempts === 1 ? "attempt" : "attempts"}
          </Badge>
          <Badge
            variant="outline"
            className={`font-normal ${getMasteryColor(archiveWinRate)}`}
          >
            {archiveWinRate}%
          </Badge>
        </div>
      </button>
      {open && (
        <div className="border-t bg-gray-50/50 p-2 space-y-2">
          {groups.map((g) => (
            <DayCard key={g.dayKey} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StudentWordMasterySection({ studentId }: { studentId: string }) {
  const [data, setData] = useState<MasteryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<string>("all");

  const dayGroups = useMemo<DayGroup[]>(
    () => (data ? groupAttemptsByDay(data.attempts ?? []) : []),
    [data]
  );
  const recentDays = dayGroups.slice(0, RECENT_DAY_LIMIT);
  const archivedDays = dayGroups.slice(RECENT_DAY_LIMIT);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const listParam = selectedList !== "all" ? `?listId=${selectedList}` : "";
        const res = await fetch(
          `/api/teacher/students/${studentId}/word-mastery${listParam}`
        );
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        }
      } catch (e) {
        console.error("Error fetching student word mastery:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studentId, selectedList]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          Spelling Word Mastery
          {data && data.totalAttempts > 0 && (
            <Badge variant="outline" className="ml-2 font-normal">
              {data.overallWinRate}% overall
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && data.spellingLists.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Filter by list:</span>
            <Select value={selectedList} onValueChange={setSelectedList}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All lists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lists</SelectItem>
                {data.spellingLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.title}
                    {list.weekNumber ? ` (Week ${list.weekNumber})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !data || data.totalAttempts === 0 ? (
          <div className="text-center py-8">
            <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No spelling game data yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Word mastery stats will appear once this student plays the spelling game.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{data.totalAttempts}</div>
                <p className="text-xs text-gray-500">Total Attempts</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{data.overallWinRate}%</div>
                <p className="text-xs text-gray-500">Win Rate</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {data.wordMastery.length}
                </div>
                <p className="text-xs text-gray-500">Words Practiced</p>
              </div>
            </div>

            <div className="space-y-2">
              {data.wordMastery.map((word) => (
                <div
                  key={word.wordId}
                  className="border rounded-lg p-3 flex items-center gap-3"
                >
                  <span className="text-base" title={`${word.winRate}% mastery`}>
                    {getMasteryIcon(word.winRate)}
                  </span>
                  <span className="font-medium text-gray-900 min-w-[100px]">
                    {word.word}
                  </span>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getMasteryBarColor(word.winRate)}`}
                        style={{ width: getMasteryBarWidth(word.winRate) }}
                      />
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs min-w-[52px] justify-center ${getMasteryColor(word.winRate)}`}
                  >
                    {word.winRate}%
                  </Badge>
                  <span className="text-xs text-gray-500 min-w-[80px] text-right">
                    {word.wins}/{word.totalAttempts} wins
                  </span>
                  <span className="text-xs text-gray-400 min-w-[70px] text-right">
                    ~{word.avgWrongGuesses} misses
                  </span>
                </div>
              ))}
            </div>

            {dayGroups.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <CalendarDays className="w-4 h-4 text-gray-500" />
                  Practice by day
                </div>
                <div className="space-y-2">
                  {recentDays.map((g, idx) => (
                    <DayCard key={g.dayKey} group={g} defaultOpen={idx === 0} />
                  ))}
                  {archivedDays.length > 0 && <ArchiveCard groups={archivedDays} />}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
