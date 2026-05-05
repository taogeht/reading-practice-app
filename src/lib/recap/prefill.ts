import { db } from '@/lib/db';
import { classProgress, spellingLists, classSyllabusWeeks } from '@/lib/db/schema';
import { and, eq, gte, lte, desc } from 'drizzle-orm';

// ISO-style week (Monday → Sunday) containing the given date. Time portion is
// stripped so date arithmetic matches calendar boundaries regardless of the
// caller's timezone.
export function isoWeekRange(reference: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  // getDay returns 0=Sun..6=Sat. Convert so Monday=0..Sunday=6.
  const day = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Returns the syllabus week that covers `reference` for this class, if one
// exists. Otherwise returns null and the caller should fall back to ISO week
// numbering. We don't synthesize a fake syllabus_week row.
export async function findSyllabusWeek(
  classId: string,
  reference: Date = new Date(),
): Promise<{ id: string; weekNumber: number; startDate: Date; endDate: Date } | null> {
  const ts = reference;
  const rows = await db
    .select({
      id: classSyllabusWeeks.id,
      weekNumber: classSyllabusWeeks.weekNumber,
      startDate: classSyllabusWeeks.startDate,
      endDate: classSyllabusWeeks.endDate,
    })
    .from(classSyllabusWeeks)
    .where(
      and(
        eq(classSyllabusWeeks.classId, classId),
        lte(classSyllabusWeeks.startDate, ts),
        gte(classSyllabusWeeks.endDate, ts),
      ),
    )
    .limit(1);
  if (!rows.length) return null;
  const r = rows[0];
  if (!r.startDate || !r.endDate) return null;
  return {
    id: r.id,
    weekNumber: r.weekNumber,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
  };
}

// Best-effort week number for a class even when no syllabus row exists. We use
// the absolute ISO week of the year; teachers can rename as they like in the
// recap form. This only matters for the (classId, weekNumber) unique key.
export function isoWeekNumber(date: Date): number {
  // Algorithm: copy the date, set to nearest Thursday, week = floor(diff / 7) + 1.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export interface RecapPrefill {
  pagesCovered: string;
  homework: string;
  spellingTestInfo: string;
}

// Pulls draftable defaults out of the data the teacher has already entered
// elsewhere. The teacher always edits the result before publishing — this is
// not a source of truth, just a head start.
export async function gatherRecapPrefill(
  classId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<RecapPrefill> {
  // Daily progress rows for the week, in date order.
  const progressRows = await db
    .select({
      date: classProgress.date,
      pagesCompleted: classProgress.pagesCompleted,
      homeworkAssigned: classProgress.homeworkAssigned,
    })
    .from(classProgress)
    .where(
      and(
        eq(classProgress.classId, classId),
        gte(classProgress.date, windowStart),
        lte(classProgress.date, windowEnd),
      ),
    )
    .orderBy(classProgress.date);

  const pagesCovered = progressRows
    .filter((r) => r.pagesCompleted && r.pagesCompleted.trim())
    .map((r) => {
      const day = new Date(r.date!).toLocaleDateString('en-US', { weekday: 'short' });
      return `${day}: ${r.pagesCompleted}`;
    })
    .join('\n');

  // Latest homework note in the window — typically reflects what was assigned
  // for the upcoming week.
  const latestHomework = [...progressRows]
    .reverse()
    .find((r) => r.homeworkAssigned && r.homeworkAssigned.trim())?.homeworkAssigned ?? '';

  // The current spelling list for the class, if any. Title is what teachers
  // already write (e.g., "Week 12 — Animals"); it doubles as test scope.
  const spellingRow = await db
    .select({
      title: spellingLists.title,
      weekNumber: spellingLists.weekNumber,
    })
    .from(spellingLists)
    .where(and(eq(spellingLists.classId, classId), eq(spellingLists.isCurrent, true)))
    .orderBy(desc(spellingLists.updatedAt))
    .limit(1);

  const spellingTestInfo = spellingRow.length
    ? `${spellingRow[0].title}${
        spellingRow[0].weekNumber !== null ? ` (week ${spellingRow[0].weekNumber})` : ''
      }`
    : '';

  return {
    pagesCovered,
    homework: latestHomework,
    spellingTestInfo,
  };
}
