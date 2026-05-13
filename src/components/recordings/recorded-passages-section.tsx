"use client";

// Collapsible card on the student dashboard listing every reading
// passage the student has at least one page recording on. Mirrors the
// "Past stories" section's visual pattern (CollapsibleCard + per-row
// chip + tap-to-go-back link).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { BookOpen, Mic } from "lucide-react";

interface RecordedPassageRow {
  passageId: string;
  title: string;
  coverImageKey: string | null;
  pageCount: number;
  pagesRecorded: number;
  bestAvgAccuracy: number | null;
  latestSubmittedAt: string;
}

export function RecordedPassagesSection() {
  const [rows, setRows] = useState<RecordedPassageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/student/reading/recorded-passages");
        if (!res.ok) throw new Error("Failed");
        const body = (await res.json()) as { passages: RecordedPassageRow[] };
        setRows(body.passages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
  }, []);

  if (error) return null;
  if (rows == null) return null;
  if (rows.length === 0) return null;

  return (
    <CollapsibleCard
      title="Reading passages you've recorded"
      description="Stories where you tried recording yourself on at least one page."
      defaultOpen={false}
      storageKey="student-dashboard.passage-recordings"
      headerAccessory={
        <Badge variant="outline" className="text-xs">
          {rows.length}
        </Badge>
      }
    >
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {rows.map((r) => (
          <Link
            key={r.passageId}
            href={`/student/reading/${r.passageId}`}
            className="block border border-gray-200 bg-white rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-md bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                {r.coverImageKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/images/${r.coverImageKey}`}
                    alt={r.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BookOpen className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-gray-900 truncate">{r.title}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                    <Mic className="w-3 h-3" />
                    {r.pagesRecorded} / {r.pageCount} pages recorded
                  </span>
                  {r.bestAvgAccuracy != null && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {Math.round(r.bestAvgAccuracy)}% avg
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </CollapsibleCard>
  );
}
