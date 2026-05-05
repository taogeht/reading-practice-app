"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, CalendarDays, Users } from "lucide-react";
import Link from "next/link";

interface Props {
  classId: string;
}

interface SummaryShape {
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'published';
  totalStudents: number;
  confirmedCount: number;
  pendingStudents: { firstName: string; lastName: string }[];
}

export function RecapConfirmationSummary({ classId }: Props) {
  const [summary, setSummary] = useState<SummaryShape | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/teacher/classes/${classId}/weekly-recap`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const recap = data.recap;
        if (!recap) {
          setSummary(null);
          return;
        }
        const entries = (data.entries ?? []) as { studentId: string; parentConfirmedAt: string | null }[];
        const roster = (data.roster ?? []) as { studentId: string; firstName: string; lastName: string }[];
        const confirmedSet = new Set(
          entries.filter((e) => e.parentConfirmedAt).map((e) => e.studentId),
        );
        setSummary({
          weekNumber: recap.weekNumber,
          startDate: recap.startDate,
          endDate: recap.endDate,
          status: recap.status,
          totalStudents: roster.length,
          confirmedCount: roster.filter((s) => confirmedSet.has(s.studentId)).length,
          pendingStudents: roster.filter((s) => !confirmedSet.has(s.studentId)),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-3 text-center text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }
  if (!summary) {
    return (
      <Card>
        <CardContent className="py-3 px-4 text-xs text-gray-500 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          No weekly recap yet —{' '}
          <Link href={`/teacher/classes/${classId}/weekly-recap`} className="text-indigo-600 hover:underline">
            create one
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isDraft = summary.status === 'draft';

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-gray-800">Week {summary.weekNumber}</span>
            <Badge
              variant="outline"
              className={
                isDraft
                  ? 'bg-gray-100 text-gray-700 border-gray-300 text-[10px]'
                  : 'bg-green-50 text-green-700 border-green-300 text-[10px]'
              }
            >
              {isDraft ? 'Draft' : 'Published'}
            </Badge>
          </div>
          <Link
            href={`/teacher/classes/${classId}/weekly-recap`}
            className="text-xs text-indigo-600 hover:underline"
          >
            Open
          </Link>
        </div>
        {!isDraft && summary.totalStudents > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full text-left text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {summary.confirmedCount} of {summary.totalStudents} parents confirmed
                {summary.pendingStudents.length > 0 && ' · view pending'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Pending parent confirmations
              </h4>
              {summary.pendingStudents.length === 0 ? (
                <p className="text-xs text-gray-500">All parents have confirmed. 🎉</p>
              ) : (
                <ul className="text-sm space-y-1 max-h-60 overflow-y-auto">
                  {summary.pendingStudents.map((s) => (
                    <li key={`${s.firstName}-${s.lastName}`} className="text-gray-700">
                      {s.firstName} {s.lastName}
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        )}
      </CardContent>
    </Card>
  );
}
