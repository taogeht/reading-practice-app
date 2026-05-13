"use client";

// Collapsible "Recent class activity" feed on the teacher dashboard.
// Fetches /api/teacher/dashboard/activity-feed (last 20 milestone
// events across the teacher's accessible classes), groups by class
// name for display, and renders each item as a one-liner.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible-card";

interface FeedItem {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  eventType: string;
  summary: string;
  points: number;
  sourceId: string | null;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  const d = Math.round(diffSec / 86400);
  return `${d}d ago`;
}

export function TeacherActivityFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/teacher/dashboard/activity-feed');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items: FeedItem[] };
        setItems(body.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      }
    })();
  }, []);

  // Group by className, preserving the order each class first appears
  // (which is recency-of-most-recent-event ordering since the parent
  // array is already sorted desc).
  const grouped = (() => {
    if (!items) return [] as Array<{ className: string; entries: FeedItem[] }>;
    const map = new Map<string, FeedItem[]>();
    for (const item of items) {
      const list = map.get(item.className) ?? [];
      list.push(item);
      map.set(item.className, list);
    }
    return Array.from(map.entries()).map(([className, entries]) => ({
      className,
      entries,
    }));
  })();

  return (
    <CollapsibleCard
      title="Recent class activity"
      description="Last 20 student milestones across your classes."
      defaultOpen={false}
      storageKey="teacher-dashboard.activity-feed"
      headerAccessory={
        items != null && (
          <Badge variant="outline" className="text-xs">
            {items.length}
          </Badge>
        )
      }
    >
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : items == null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No recent activity yet. Students earn entries by submitting recordings,
          finishing reading passages, winning spelling games, and mastering
          vocabulary.
        </p>
      ) : (
        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
          {grouped.map((group) => (
            <div key={group.className}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5 flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-600" />
                {group.className}
              </div>
              <ul className="space-y-1.5">
                {group.entries.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded px-2 py-1.5"
                  >
                    <Link
                      href={`/teacher/students/${it.studentId}`}
                      className="font-medium text-gray-900 hover:text-blue-700 truncate"
                    >
                      {it.studentName}
                    </Link>
                    <span className="text-gray-600 truncate flex-1">
                      {it.summary}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {relativeTime(it.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
