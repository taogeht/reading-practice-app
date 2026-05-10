'use client';

// Shared reading library — greeting, level pills, responsive passage
// grid. Used in two places:
//   1. As the standalone /student/reading page (which wraps it in
//      its own gradient + max-width chrome).
//   2. Inside the dashboard's Stories tab (which already provides
//      the page-level chrome, so the embed renders without an outer
//      wrapper).
//
// The component does its own data fetching by default. Callers that
// already have the student's name/reading level loaded — like the
// dashboard, which fetches the same /api/student/dashboard payload —
// can pass it in via the `student` prop to avoid a duplicate request.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check } from 'lucide-react';
import { READING_LEVELS } from '@/lib/reading/levels';
import { mapStudentReadingLevel } from '@/lib/reading/student-level';

interface PassageCard {
  id: string;
  title: string;
  coverImageUrl: string;
  pageCount: number;
  readBefore: boolean;
  inProgress: boolean;
}

export interface ReadingLibraryStudent {
  firstName: string;
  readingLevel: string | null;
}

const SKELETON_COUNT = 6;

export function ReadingLibrary({
  student,
}: {
  /** Optional — when provided, skips the /api/student/dashboard
   *  fetch. Pass this from the dashboard tab so the embed doesn't
   *  re-request data the dashboard already has. */
  student?: ReadingLibraryStudent;
}) {
  const [studentInfo, setStudentInfo] = useState<ReadingLibraryStudent | null>(
    student ?? null,
  );
  const [studentLoadError, setStudentLoadError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<number | null>(
    student ? mapStudentReadingLevel(student.readingLevel) : null,
  );
  const [passages, setPassages] = useState<PassageCard[] | null>(null);
  const [passagesLoading, setPassagesLoading] = useState(false);
  const [passagesError, setPassagesError] = useState<string | null>(null);

  // Only fetch the dashboard slim payload when no preloaded student
  // was provided. Re-runs if the prop transitions from undefined to
  // defined (e.g. when the parent finishes loading and passes us
  // data on a later render).
  useEffect(() => {
    if (student) {
      setStudentInfo(student);
      setSelectedLevel((cur) =>
        cur === null ? mapStudentReadingLevel(student.readingLevel) : cur,
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/dashboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { student: ReadingLibraryStudent };
        if (cancelled) return;
        setStudentInfo(data.student);
        setSelectedLevel(mapStudentReadingLevel(data.student.readingLevel));
      } catch (err) {
        if (!cancelled) {
          setStudentLoadError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student]);

  const loadPassages = useCallback(async (level: number) => {
    setPassagesLoading(true);
    setPassagesError(null);
    try {
      const res = await fetch(`/api/student/reading/library?level=${level}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { passages: PassageCard[] };
      setPassages(data.passages);
    } catch (err) {
      setPassagesError(err instanceof Error ? err.message : 'Failed to load library');
      setPassages([]);
    } finally {
      setPassagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLevel === null) return;
    void loadPassages(selectedLevel);
  }, [selectedLevel, loadPassages]);

  const studentLevel = studentInfo
    ? mapStudentReadingLevel(studentInfo.readingLevel)
    : null;
  const currentLevelDef = READING_LEVELS.find((l) => l.id === selectedLevel) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Hi {studentInfo?.firstName ?? 'there'}! Pick a story to read.
        </h1>
        {studentLevel !== null && (
          <p className="text-sm text-gray-600 mt-1">
            Your level:{' '}
            <span className="font-semibold text-blue-700">
              {READING_LEVELS.find((l) => l.id === studentLevel)?.name ??
                `Level ${studentLevel}`}
            </span>
          </p>
        )}
        {studentLoadError && (
          <p className="text-xs text-red-700 mt-1">
            Couldn&apos;t load your profile ({studentLoadError}). Showing default level.
          </p>
        )}
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Reading level">
        {READING_LEVELS.map((lvl) => {
          const isCurrent = selectedLevel === lvl.id;
          const isYourLevel = studentLevel === lvl.id;
          return (
            <button
              key={lvl.id}
              type="button"
              onClick={() => setSelectedLevel(lvl.id)}
              className={[
                'px-4 py-2 rounded-full text-sm font-medium transition active:scale-95',
                isCurrent
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300',
              ].join(' ')}
              aria-pressed={isCurrent}
            >
              {lvl.name}
              {isYourLevel && !isCurrent && (
                <span className="ml-1 text-xs text-blue-600">★</span>
              )}
            </button>
          );
        })}
      </nav>

      {selectedLevel === null ? (
        <SkeletonGrid />
      ) : passagesLoading ? (
        <SkeletonGrid />
      ) : passagesError ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">
          {passagesError}
        </div>
      ) : !passages || passages.length === 0 ? (
        <EmptyState levelName={currentLevelDef?.name ?? `Level ${selectedLevel}`} />
      ) : (
        <PassageGrid passages={passages} />
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function PassageGrid({ passages }: { passages: PassageCard[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {passages.map((p) => (
        <Link
          key={p.id}
          href={`/student/reading/${p.id}`}
          className="block group active:scale-95 transition-transform"
        >
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
            <div className="relative aspect-square bg-gray-100">
              {p.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.coverImageUrl}
                  alt={p.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <BookOpen className="w-12 h-12" />
                </div>
              )}
              <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                {p.pageCount} {p.pageCount === 1 ? 'page' : 'pages'}
              </span>
              {p.inProgress ? (
                <span className="absolute bottom-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm">
                  …
                </span>
              ) : p.readBefore ? (
                <span className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full p-1 shadow-sm">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </div>
            <div className="p-3">
              <p className="text-base font-bold text-gray-900 line-clamp-2 leading-tight">
                {p.title}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <div className="aspect-square bg-gray-200 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-gray-200 animate-pulse rounded w-3/4" />
            <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ levelName }: { levelName: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
      <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p className="font-semibold text-gray-700">
        No stories at the {levelName} level yet.
      </p>
      <p className="text-sm text-gray-500 mt-1">
        Try another level above, or check back soon for new stories!
      </p>
    </div>
  );
}
