'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check } from 'lucide-react';
import { READING_LEVELS } from '@/lib/reading/levels';
import { mapStudentReadingLevel } from '@/lib/reading/student-level';
import { useHeartbeat } from '@/hooks/use-heartbeat';

interface PassageCard {
  id: string;
  title: string;
  coverImageUrl: string;
  pageCount: number;
  readBefore: boolean;
  inProgress: boolean;
}

interface DashboardSlim {
  student: {
    firstName: string;
    readingLevel: string | null;
  };
}

const SKELETON_COUNT = 6;

export default function StudentReadingLibraryPage() {
  useHeartbeat();

  // The student's name and free-text reading_level come from the
  // existing /api/student/dashboard response — no separate endpoint
  // needed. We only consume the slim shape; the rest of the dashboard
  // payload is ignored.
  const [studentInfo, setStudentInfo] = useState<DashboardSlim['student'] | null>(null);
  const [studentLoadError, setStudentLoadError] = useState<string | null>(null);

  // Selected level for the level-pill toggle. Starts as the student's
  // mapped level once dashboard data loads.
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [passages, setPassages] = useState<PassageCard[] | null>(null);
  const [passagesLoading, setPassagesLoading] = useState(false);
  const [passagesError, setPassagesError] = useState<string | null>(null);

  // ---- Load student profile once ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/dashboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: DashboardSlim = await res.json();
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
  }, []);

  // ---- Reload passages whenever the selected level changes ----
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

  // ---- Render ----
  const studentLevel = studentInfo
    ? mapStudentReadingLevel(studentInfo.readingLevel)
    : null;
  const currentLevelDef = READING_LEVELS.find((l) => l.id === selectedLevel) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {/* Greeting */}
        <header className="mb-6">
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

        {/* Level pills */}
        <nav
          className="flex flex-wrap gap-2 mb-6"
          aria-label="Reading level"
        >
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

        {/* Body */}
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
              {/* Page count badge */}
              <span className="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                {p.pageCount} {p.pageCount === 1 ? 'page' : 'pages'}
              </span>
              {/* Session-state badges (mutually exclusive in practice;
                  in_progress wins if both are somehow true). */}
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
