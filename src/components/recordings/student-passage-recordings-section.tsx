"use client";

// Teacher-facing per-student passage recordings. Mounted on
// /teacher/students/[id]. Renders one collapsible group per passage,
// with each page's attempts inside. Mirrors the data shape from
// /api/teacher/students/[studentId]/passage-recordings.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronDown, Mic } from "lucide-react";

interface Attempt {
  id: string;
  attemptNumber: number;
  audioUrl: string;
  submittedAt: string;
  transcript: string | null;
  letterGrade: string | null;
  accuracyScore: number | null;
  wpmScore: number | null;
}

interface PageGroup {
  pageNumber: number;
  pageText: string;
  attempts: Attempt[];
}

interface PassageGroup {
  passageId: string;
  title: string;
  readingLevel: number;
  pageCount: number;
  coverImageKey: string | null;
  latestSubmittedAt: string;
  pages: PageGroup[];
}

interface Props {
  studentId: string;
}

export function StudentPassageRecordingsSection({ studentId }: Props) {
  const [passages, setPassages] = useState<PassageGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/teacher/students/${studentId}/passage-recordings`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { passages: PassageGroup[] };
        setPassages(body.passages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
  }, [studentId]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passage recordings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-700">{error}</CardContent>
      </Card>
    );
  }

  if (passages == null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passage recordings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">Loading…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mic className="w-4 h-4 text-blue-600" />
          Passage recordings
          <Badge variant="outline" className="ml-2 text-xs">
            {passages.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {passages.length === 0 ? (
          <p className="text-sm text-gray-500">
            No page recordings on any reading passages yet.
          </p>
        ) : (
          passages.map((p) => <PassageBlock key={p.passageId} passage={p} />)
        )}
      </CardContent>
    </Card>
  );
}

function PassageBlock({ passage }: { passage: PassageGroup }) {
  const totalPagesRecorded = passage.pages.length;
  return (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none p-3 flex items-center gap-3 hover:bg-gray-50 rounded-lg">
        <div className="w-10 h-10 rounded-md bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
          {passage.coverImageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/images/${passage.coverImageKey}`}
              alt={passage.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <BookOpen className="w-5 h-5 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 truncate">
            {passage.title}
          </div>
          <div className="text-xs text-gray-500">
            Level {passage.readingLevel} · {totalPagesRecorded} / {passage.pageCount} pages recorded
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="border-t border-gray-200 divide-y divide-gray-100">
        {passage.pages.map((page) => (
          <PageBlock key={page.pageNumber} page={page} />
        ))}
      </div>
    </details>
  );
}

function PageBlock({ page }: { page: PageGroup }) {
  return (
    <div className="p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Page {page.pageNumber}
        </div>
        <div className="text-xs text-gray-500">
          {page.attempts.length} {page.attempts.length === 1 ? "attempt" : "attempts"}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-700 italic line-clamp-2">"{page.pageText}"</p>
      <div className="mt-2 space-y-2">
        {page.attempts.map((a) => (
          <AttemptRow key={a.id} attempt={a} />
        ))}
      </div>
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs flex items-center gap-2 flex-wrap">
      <span className="font-medium text-gray-700">#{attempt.attemptNumber}</span>
      {attempt.letterGrade ? (
        <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0 h-5">
          {attempt.letterGrade}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
          grading…
        </Badge>
      )}
      {attempt.accuracyScore != null && (
        <span className="text-gray-600">{attempt.accuracyScore.toFixed(0)}% acc</span>
      )}
      {attempt.wpmScore != null && (
        <span className="text-gray-600">{attempt.wpmScore.toFixed(0)} wpm</span>
      )}
      <audio controls preload="none" src={attempt.audioUrl} className="ml-auto h-8" />
    </div>
  );
}
