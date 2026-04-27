"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart3, Loader2, Target } from "lucide-react";

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

interface MasteryResponse {
  studentId: string;
  totalAttempts: number;
  overallWinRate: number;
  spellingLists: SpellingListOption[];
  wordMastery: WordMastery[];
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

export function StudentWordMasterySection({ studentId }: { studentId: string }) {
  const [data, setData] = useState<MasteryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<string>("all");

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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
