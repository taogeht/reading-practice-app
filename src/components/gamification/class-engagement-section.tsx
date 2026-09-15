"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ChevronDown,
    ChevronUp,
    Clock,
    Flame,
    Headphones,
    HelpCircle,
    Loader2,
    Sparkles,
    Trophy,
    UserCheck,
    UserX,
    Users,
    Activity,
    ArrowUpDown,
    ExternalLink,
} from "lucide-react";

export type ActivityStatus = 'online' | 'active' | 'slipping' | 'never';
export type TimeWindow = 'week' | 'month' | 'all';
export type FilterFilter = 'all' | 'needs_attention' | 'online' | 'active';
export type SortOption = 'xp' | 'needs_attention' | 'minutes' | 'actions' | 'streak' | 'name';

export interface StudentEngagementRow {
    studentId: string;
    firstName: string;
    lastName: string;
    avatarEmoji: string | null;
    animal: { key: string; displayName: string; image: string };
    currentLevel: number;
    totalXp: number;
    weekXp: number;
    monthXp: number;
    currentStreakDays: number;
    lastActivityDate: string | null;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    status: ActivityStatus;
    isCurrentlyOnline: boolean;
    currentActivity?: { type: string; label: string | null } | null;
    activeInWindow: boolean;
    totalMinutesOnline: number;
    timeBreakdown: {
        reading: number;
        spelling: number;
        assignment: number;
        practice: number;
        general: number;
    };
    recordingsCount: number;
    questionsAnswered: number;
    spellingGames: number;
    actionsCount: number;
}

export interface EngagementSummary {
    totalStudents: number;
    onlineCount: number;
    activeCount: number;
    slippingCount: number;
    neverCount: number;
    totalMinutesOnline: number;
    timeBreakdown?: {
        reading: number;
        spelling: number;
        assignment: number;
        practice: number;
        general: number;
    };
    totalRecordings: number;
    totalQuestions: number;
    totalSpellingGames: number;
    totalActions: number;
}

export interface EngagementResponse {
    students: StudentEngagementRow[];
    leaderboardEnabled: boolean;
    window: TimeWindow;
    weekTotalXp: number;
    monthTotalXp: number;
    allTimeTotalXp: number;
    summary: EngagementSummary;
}

interface ClassEngagementSectionProps {
    classId: string;
    defaultExpanded?: boolean;
}

export function ClassEngagementSection({
    classId,
    defaultExpanded = false,
}: ClassEngagementSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [data, setData] = useState<EngagementResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingToggle, setSavingToggle] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [timeWindow, setTimeWindow] = useState<TimeWindow>('week');
    const [filterStatus, setFilterStatus] = useState<FilterFilter>('all');
    const [sortBy, setSortBy] = useState<SortOption>('xp');
    const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set());

    const loadEngagement = useCallback(async (windowVal: TimeWindow) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/teacher/classes/${classId}/engagement?window=${windowVal}`);
            if (!res.ok) throw new Error("Failed to load engagement data");
            const json = (await res.json()) as EngagementResponse;
            setData(json);
            setError(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load engagement data";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => {
        loadEngagement(timeWindow);
    }, [loadEngagement, timeWindow]);

    const toggleLeaderboard = async () => {
        if (!data || savingToggle) return;
        const next = !data.leaderboardEnabled;
        setSavingToggle(true);
        try {
            const res = await fetch(`/api/teacher/classes/${classId}/engagement`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leaderboardEnabled: next }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setData({ ...data, leaderboardEnabled: next });
        } catch {
            // Revert state if failed
        } finally {
            setSavingToggle(false);
        }
    };

    const toggleStudentExpand = (studentId: string) => {
        setExpandedStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(studentId)) {
                next.delete(studentId);
            } else {
                next.add(studentId);
            }
            return next;
        });
    };

    const xpFor = useCallback((s: StudentEngagementRow) => {
        return timeWindow === 'all' ? s.totalXp : timeWindow === 'month' ? s.monthXp : s.weekXp;
    }, [timeWindow]);

    const isNeedsAttention = useCallback((s: StudentEngagementRow) => {
        return s.status === 'never' || s.status === 'slipping' || (s.actionsCount === 0 && !s.isCurrentlyOnline);
    }, []);

    const needsAttentionCount = useMemo(() => {
        if (!data) return 0;
        return data.students.filter(isNeedsAttention).length;
    }, [data, isNeedsAttention]);

    const filteredStudents = useMemo(() => {
        if (!data) return [];
        return data.students.filter((s) => {
            if (filterStatus === 'needs_attention') return isNeedsAttention(s);
            if (filterStatus === 'online') return s.isCurrentlyOnline;
            if (filterStatus === 'active') return s.status === 'active';
            return true;
        });
    }, [data, filterStatus, isNeedsAttention]);

    const sortedStudents = useMemo(() => {
        const list = [...filteredStudents];
        list.sort((a, b) => {
            if (sortBy === 'xp') {
                return xpFor(b) - xpFor(a);
            }
            if (sortBy === 'needs_attention') {
                const aUrgent = isNeedsAttention(a) ? 1 : 0;
                const bUrgent = isNeedsAttention(b) ? 1 : 0;
                if (bUrgent !== aUrgent) return bUrgent - aUrgent;
                return a.actionsCount - b.actionsCount;
            }
            if (sortBy === 'minutes') {
                return b.totalMinutesOnline - a.totalMinutesOnline;
            }
            if (sortBy === 'actions') {
                return b.actionsCount - a.actionsCount;
            }
            if (sortBy === 'streak') {
                return b.currentStreakDays - a.currentStreakDays;
            }
            if (sortBy === 'name') {
                return a.firstName.localeCompare(b.firstName);
            }
            return 0;
        });
        return list;
    }, [filteredStudents, sortBy, xpFor, isNeedsAttention]);

    const windowTotalXp = data
        ? timeWindow === 'all'
            ? data.allTimeTotalXp
            : timeWindow === 'month'
                ? data.monthTotalXp
                : data.weekTotalXp
        : 0;

    const windowLabel =
        timeWindow === 'all' ? 'all time' : timeWindow === 'month' ? 'this month' : 'this week';

    return (
        <Card className={`transition-all ${isExpanded ? "" : "hover:bg-gray-50"}`}>
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">Student Activity & Engagement</h3>
                            {data && data.summary.onlineCount > 0 && (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[11px] font-medium animate-pulse">
                                    ● {data.summary.onlineCount} Online
                                </Badge>
                            )}
                            {data && needsAttentionCount > 0 && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[11px] font-medium">
                                    ⚠️ {needsAttentionCount} Needs Attention
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {loading
                                ? "Loading activity..."
                                : data
                                    ? `${data.summary.activeCount + data.summary.onlineCount} active ${windowLabel} · ${data.summary.totalMinutesOnline}m online · ${windowTotalXp} XP`
                                    : "Activity data unavailable"}
                        </p>
                    </div>
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
            </div>

            {isExpanded && (
                <CardContent className="pt-0 border-t space-y-5">
                    {loading && !data && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
                            <span className="text-sm text-gray-500">Loading student activity...</span>
                        </div>
                    )}

                    {error && <div className="text-sm text-red-600 py-2">{error}</div>}

                    {data && (
                        <>
                            {/* Summary Metrics Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3">
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Users className="w-3.5 h-3.5" />
                                        <span>Active {windowLabel}</span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 mt-0.5">
                                        {data.summary.activeCount + data.summary.onlineCount}
                                        <span className="text-xs font-normal text-gray-500"> / {data.summary.totalStudents}</span>
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Time Online</span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 mt-0.5">
                                        {data.summary.totalMinutesOnline}
                                        <span className="text-xs font-normal text-gray-500"> min</span>
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <Headphones className="w-3.5 h-3.5" />
                                        <span>Recordings</span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 mt-0.5">
                                        {data.summary.totalRecordings}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <HelpCircle className="w-3.5 h-3.5" />
                                        <span>Questions</span>
                                    </div>
                                    <div className="text-lg font-bold text-gray-900 mt-0.5">
                                        {data.summary.totalQuestions}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 col-span-2 sm:col-span-1">
                                    <div className="flex items-center gap-1.5 text-xs text-amber-800">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        <span>Class XP</span>
                                    </div>
                                    <div className="text-lg font-bold text-amber-900 mt-0.5">
                                        {windowTotalXp}
                                    </div>
                                </div>
                            </div>

                            {/* Class Time by Subject Breakdown Strip */}
                            {data.summary.timeBreakdown && data.summary.totalMinutesOnline > 0 && (
                                <div className="flex items-center gap-3 text-xs text-gray-600 bg-gray-50/80 px-3.5 py-2 rounded-lg border border-gray-200 overflow-x-auto">
                                    <span className="font-semibold text-gray-700 shrink-0">Class Time ({windowLabel}):</span>
                                    <span className="flex items-center gap-1 shrink-0 text-emerald-700 font-medium">
                                        📖 Reading <strong>{data.summary.timeBreakdown.reading}m</strong>
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span className="flex items-center gap-1 shrink-0 text-sky-700 font-medium">
                                        🔤 Spelling <strong>{data.summary.timeBreakdown.spelling}m</strong>
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span className="flex items-center gap-1 shrink-0 text-indigo-700 font-medium">
                                        🎙️ Assignments <strong>{data.summary.timeBreakdown.assignment}m</strong>
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span className="flex items-center gap-1 shrink-0 text-purple-700 font-medium">
                                        🏆 Practice <strong>{data.summary.timeBreakdown.practice}m</strong>
                                    </span>
                                </div>
                            )}

                            {/* Controls: Time Window + Filters + Sort */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                                {/* Time Window Selector */}
                                <div
                                    className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-100 text-xs self-start"
                                    role="tablist"
                                    aria-label="Time window"
                                >
                                    {(['week', 'month', 'all'] as TimeWindow[]).map((w) => (
                                        <button
                                            key={w}
                                            type="button"
                                            role="tab"
                                            aria-selected={timeWindow === w}
                                            onClick={() => setTimeWindow(w)}
                                            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                                                timeWindow === w
                                                    ? 'bg-white text-gray-900 shadow-xs'
                                                    : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            {w === 'week' ? 'This week' : w === 'month' ? 'This month' : 'All time'}
                                        </button>
                                    ))}
                                </div>

                                {/* Filter Chips */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setFilterStatus('all')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                                            filterStatus === 'all'
                                                ? 'bg-gray-900 text-white border-gray-900'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        All ({data.summary.totalStudents})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterStatus('needs_attention')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                                            filterStatus === 'needs_attention'
                                                ? 'bg-amber-700 text-white border-amber-700'
                                                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                        }`}
                                    >
                                        ⚠️ Needs Attention ({needsAttentionCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterStatus('online')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                                            filterStatus === 'online'
                                                ? 'bg-emerald-700 text-white border-emerald-700'
                                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                        }`}
                                    >
                                        ● Online ({data.summary.onlineCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterStatus('active')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                                            filterStatus === 'active'
                                                ? 'bg-blue-700 text-white border-blue-700'
                                                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                                        }`}
                                    >
                                        Active ({data.summary.activeCount})
                                    </button>
                                </div>

                                {/* Sort Options */}
                                <div className="flex items-center gap-2 self-start md:self-auto text-xs text-gray-500">
                                    <ArrowUpDown className="w-3.5 h-3.5" />
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                                        className="border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                    >
                                        <option value="xp">Sort: XP</option>
                                        <option value="needs_attention">Sort: Needs Attention</option>
                                        <option value="minutes">Sort: Minutes Online</option>
                                        <option value="actions">Sort: Work Done (Actions)</option>
                                        <option value="streak">Sort: Streak Days</option>
                                        <option value="name">Sort: Name (A-Z)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Leaderboard toggle bar */}
                            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                                    <div>
                                        <p className="text-xs font-medium text-gray-900">Show student leaderboard</p>
                                        <p className="text-[11px] text-gray-500">
                                            Allow students in this class to see the top 10 leaderboard on their devices.
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant={data.leaderboardEnabled ? "default" : "outline"}
                                    size="sm"
                                    onClick={toggleLeaderboard}
                                    disabled={savingToggle}
                                    className="h-7 text-xs px-2.5"
                                >
                                    {savingToggle ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : data.leaderboardEnabled ? (
                                        "On"
                                    ) : (
                                        "Off"
                                    )}
                                </Button>
                            </div>

                            {/* Student Roster List */}
                            {sortedStudents.length === 0 ? (
                                <div className="text-center py-8 text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    No students match the selected filter.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sortedStudents.map((s, index) => {
                                        const isExpandedRow = expandedStudentIds.has(s.studentId);
                                        const xp = xpFor(s);

                                        return (
                                            <div
                                                key={s.studentId}
                                                className={`rounded-lg border transition-all ${
                                                    isExpandedRow
                                                        ? 'border-amber-300 bg-amber-50/20 shadow-xs'
                                                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                                                }`}
                                            >
                                                {/* Main Row */}
                                                <div className="flex items-center gap-3 p-3">
                                                    {/* Rank # */}
                                                    <span className="shrink-0 w-5 text-center text-xs font-bold text-gray-400">
                                                        {index + 1}
                                                    </span>

                                                    {/* Animal Avatar & Level Badge */}
                                                    <div className="relative shrink-0">
                                                        <img
                                                            src={s.animal.image}
                                                            alt={s.animal.displayName}
                                                            className="w-9 h-9 rounded-lg bg-white border border-gray-200 object-contain p-0.5"
                                                        />
                                                        {s.isCurrentlyOnline && (
                                                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
                                                        )}
                                                    </div>

                                                    {/* Name + Status + Streak */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link
                                                                href={`/teacher/students/${s.studentId}`}
                                                                className="font-medium text-sm text-gray-900 hover:text-blue-600 hover:underline truncate"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {s.firstName} {s.lastName}
                                                            </Link>

                                                            {/* Status Badge */}
                                                            {s.isCurrentlyOnline ? (
                                                                <span
                                                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"
                                                                    title={s.currentActivity?.label ? `Active now: ${s.currentActivity.label}` : 'Online now'}
                                                                >
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    <span>Online</span>
                                                                    {s.currentActivity?.label && (
                                                                        <span className="text-emerald-600 font-normal max-w-[180px] truncate hidden sm:inline">
                                                                            · {s.currentActivity.label}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : s.status === 'active' ? (
                                                                <span className="inline-flex items-center text-[11px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                                                                    Active
                                                                </span>
                                                            ) : s.status === 'slipping' ? (
                                                                <span className="inline-flex items-center text-[11px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                                                                    Slipping
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full border border-gray-200">
                                                                    Never Logged In
                                                                </span>
                                                            )}

                                                            {/* Streak */}
                                                            {s.currentStreakDays > 0 && (
                                                                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-orange-600">
                                                                    <Flame className="w-3 h-3 fill-orange-500 text-orange-500" />
                                                                    {s.currentStreakDays}d
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Activity Pill Highlights */}
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                                                            <span className="flex items-center gap-1" title="Estimated minutes actively engaged in the app">
                                                                <Clock className="w-3 h-3 text-gray-400" />
                                                                {s.totalMinutesOnline}m
                                                            </span>
                                                            <span className="text-gray-300">·</span>
                                                            <span className="flex items-center gap-1" title="Reading passage and assignment recordings submitted">
                                                                <Headphones className="w-3 h-3 text-gray-400" />
                                                                {s.recordingsCount} rec{s.recordingsCount === 1 ? '' : 's'}
                                                            </span>
                                                            <span className="text-gray-300">·</span>
                                                            <span className="flex items-center gap-1" title="Comprehension questions answered">
                                                                <HelpCircle className="w-3 h-3 text-gray-400" />
                                                                {s.questionsAnswered} qs
                                                            </span>
                                                            {s.spellingGames > 0 && (
                                                                <>
                                                                    <span className="text-gray-300">·</span>
                                                                    <span title="Spelling rounds completed">
                                                                        {s.spellingGames} spelling
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* XP + Total */}
                                                    <div className="text-right shrink-0">
                                                        <div className="text-sm font-bold text-amber-700 flex items-center justify-end gap-1">
                                                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                                            {xp} XP
                                                        </div>
                                                        <div className="text-[11px] text-gray-400">
                                                            {timeWindow === 'all' ? `Lvl ${s.currentLevel}` : `${s.totalXp} all-time`}
                                                        </div>
                                                    </div>

                                                    {/* Expand chevron */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleStudentExpand(s.studentId)}
                                                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                                                        aria-label="Toggle student details"
                                                    >
                                                        {isExpandedRow ? (
                                                            <ChevronUp className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Expanded Breakdown Drawer */}
                                                {isExpandedRow && (
                                                    <div className="px-4 py-3 bg-gray-50/70 border-t border-gray-200 text-xs space-y-3 rounded-b-lg">
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                            <div>
                                                                <span className="text-gray-500">Last login:</span>
                                                                <p className="font-medium text-gray-900 mt-0.5">
                                                                    {s.lastLoginAt
                                                                        ? formatDistanceToNow(new Date(s.lastLoginAt), { addSuffix: true })
                                                                        : 'Never'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-500">Last active heartbeat:</span>
                                                                <p className="font-medium text-gray-900 mt-0.5">
                                                                    {s.lastActivityAt
                                                                        ? formatDistanceToNow(new Date(s.lastActivityAt), { addSuffix: true })
                                                                        : 'No recorded activity'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-500">Gamification Rank:</span>
                                                                <p className="font-medium text-gray-900 mt-0.5">
                                                                    Level {s.currentLevel} ({s.animal.displayName})
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Granular Time by Activity */}
                                                        <div className="pt-2 border-t border-gray-200/60">
                                                            <span className="text-gray-500 font-medium block mb-1.5">
                                                                Time by Subject ({windowLabel}):
                                                            </span>
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                                <div className="p-2 rounded-md bg-white border border-gray-200">
                                                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">📖 Reading</span>
                                                                    <span className="text-sm font-semibold text-emerald-700">{s.timeBreakdown?.reading ?? 0}m</span>
                                                                </div>
                                                                <div className="p-2 rounded-md bg-white border border-gray-200">
                                                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">🔤 Spelling</span>
                                                                    <span className="text-sm font-semibold text-sky-700">{s.timeBreakdown?.spelling ?? 0}m</span>
                                                                </div>
                                                                <div className="p-2 rounded-md bg-white border border-gray-200">
                                                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">🎙️ Assignment</span>
                                                                    <span className="text-sm font-semibold text-indigo-700">{s.timeBreakdown?.assignment ?? 0}m</span>
                                                                </div>
                                                                <div className="p-2 rounded-md bg-white border border-gray-200">
                                                                    <span className="text-gray-400 block text-[10px] uppercase font-bold">🏆 Practice</span>
                                                                    <span className="text-sm font-semibold text-purple-700">{s.timeBreakdown?.practice ?? 0}m</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                                                            <span className="text-gray-500">
                                                                Total actions in {windowLabel}: <strong className="text-gray-900">{s.actionsCount}</strong>
                                                            </span>
                                                            <Link
                                                                href={`/teacher/students/${s.studentId}`}
                                                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                                                            >
                                                                <span>View Student Profile & Journey</span>
                                                                <ExternalLink className="w-3 h-3" />
                                                            </Link>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
