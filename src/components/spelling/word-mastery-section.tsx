"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    BarChart3,
    ChevronDown,
    ChevronUp,
    Loader2,
    Trophy,
    Target,
    Users,
    TrendingUp,
} from "lucide-react";

interface StudentWordStats {
    studentId: string;
    firstName: string;
    lastName: string;
    attempts: number;
    wins: number;
    losses: number;
    avgWrongGuesses: number;
    totalWrongGuesses: number;
    winRate: number;
}

interface WordMasteryData {
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
    studentsAttempted: number;
    students: StudentWordStats[];
}

interface SpellingListOption {
    id: string;
    title: string;
    weekNumber: number | null;
}

interface MasteryResponse {
    classId: string;
    totalStudents: number;
    totalAttempts: number;
    overallWinRate: number;
    spellingLists: SpellingListOption[];
    wordMastery: WordMasteryData[];
}

interface WordMasterySectionProps {
    classId: string;
    defaultExpanded?: boolean;
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

export function WordMasterySection({ classId, defaultExpanded = false }: WordMasterySectionProps) {
    const [data, setData] = useState<MasteryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [selectedList, setSelectedList] = useState<string>("all");
    const [expandedWords, setExpandedWords] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isExpanded) {
            fetchMastery();
        }
    }, [classId, isExpanded, selectedList]);

    const fetchMastery = async () => {
        setLoading(true);
        try {
            const listParam = selectedList !== "all" ? `&listId=${selectedList}` : "";
            const response = await fetch(`/api/classes/${classId}/word-mastery?classId=${classId}${listParam}`);
            if (response.ok) {
                const result = await response.json();
                setData(result);
            }
        } catch (error) {
            console.error("Error fetching word mastery:", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleWordExpanded = (wordId: string) => {
        setExpandedWords((prev) => {
            const next = new Set(prev);
            if (next.has(wordId)) next.delete(wordId);
            else next.add(wordId);
            return next;
        });
    };

    return (
        <Card>
            <CardHeader
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <BarChart3 className="w-5 h-5 text-purple-600" />
                        Spelling Word Mastery
                        {data && data.totalAttempts > 0 && (
                            <Badge variant="outline" className="ml-2 font-normal">
                                {data.overallWinRate}% overall
                            </Badge>
                        )}
                    </CardTitle>
                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="pt-0 border-t">
                    {/* Filter */}
                    {data && data.spellingLists.length > 0 && (
                        <div className="flex items-center gap-3 mb-4 pt-4">
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
                            <p className="text-gray-600 font-medium">No game data yet</p>
                            <p className="text-sm text-gray-500 mt-1">
                                Word mastery stats will appear once students play the spelling game.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-4">
                            {/* Summary stats */}
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-blue-600">{data.totalAttempts}</div>
                                    <p className="text-xs text-gray-500">Total Attempts</p>
                                </div>
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-green-600">{data.overallWinRate}%</div>
                                    <p className="text-xs text-gray-500">Win Rate</p>
                                </div>
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <div className="text-2xl font-bold text-purple-600">{data.wordMastery.length}</div>
                                    <p className="text-xs text-gray-500">Words Practiced</p>
                                </div>
                            </div>

                            {/* Per-word breakdown */}
                            <div className="space-y-2">
                                {data.wordMastery.map((word) => (
                                    <div key={word.wordId} className="border rounded-lg overflow-hidden">
                                        {/* Word row */}
                                        <div
                                            className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                            onClick={() => toggleWordExpanded(word.wordId)}
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
                                            <span className="text-xs text-gray-400 min-w-[80px] text-right">
                                                {word.wins}/{word.totalAttempts} wins
                                            </span>
                                            <span className="text-xs text-gray-400 min-w-[40px] text-right">
                                                <Users className="w-3 h-3 inline mr-0.5" />
                                                {word.studentsAttempted}
                                            </span>
                                            {expandedWords.has(word.wordId) ? (
                                                <ChevronUp className="w-4 h-4 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>

                                        {/* Expanded student breakdown */}
                                        {expandedWords.has(word.wordId) && (
                                            <div className="border-t bg-gray-50 px-4 py-3">
                                                <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    Student Breakdown
                                                </div>
                                                {word.students.length === 0 ? (
                                                    <p className="text-xs text-gray-400">No attempts yet</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {word.students.map((student) => (
                                                            <div
                                                                key={student.studentId}
                                                                className="flex items-center gap-3 text-sm"
                                                            >
                                                                <span className="text-xs">
                                                                    {getMasteryIcon(student.winRate)}
                                                                </span>
                                                                <span className="text-gray-700 min-w-[120px]">
                                                                    {student.firstName} {student.lastName}
                                                                </span>
                                                                <div className="flex-1">
                                                                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                                        <div
                                                                            className={`h-1.5 rounded-full ${getMasteryBarColor(student.winRate)}`}
                                                                            style={{ width: getMasteryBarWidth(student.winRate) }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs text-gray-500 min-w-[40px] text-right">
                                                                    {student.winRate}%
                                                                </span>
                                                                <span className="text-xs text-gray-400 min-w-[70px] text-right">
                                                                    {student.wins}/{student.attempts} wins
                                                                </span>
                                                                <span className="text-xs text-gray-400 min-w-[60px] text-right">
                                                                    ~{student.avgWrongGuesses} misses
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
