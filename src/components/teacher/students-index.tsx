"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";

export interface StudentRow {
  id: string;
  name: string;
  gradeLevel: number | null;
  avatarUrl: string | null;
  classes: string[];
}

/**
 * Searchable index of every student across the teacher's classes — a new
 * top-level destination and the on-ramp to per-student progress. Cards link to
 * the existing /teacher/students/[id] detail page.
 */
export function StudentsIndex({ students }: { students: StudentRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(t) ||
        s.classes.some((c) => c.toLowerCase().includes(t)),
    );
  }, [students, q]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="mt-1 text-sm text-gray-500">
          {students.length} student{students.length === 1 ? "" : "s"} across your classes. Click a
          student to see their progress.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or class…"
          className="w-full rounded-lg border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">
          {students.length === 0
            ? "No students enrolled in your classes yet."
            : "No students match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link
              key={s.id}
              href={`/teacher/students/${s.id}`}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg">
                {s.avatarUrl || "👤"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900 group-hover:text-blue-700">
                  {s.name}
                </div>
                <div className="truncate text-xs text-gray-500">
                  {s.gradeLevel != null ? `Grade ${s.gradeLevel} · ` : ""}
                  {s.classes.join(", ") || "No class"}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-blue-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
