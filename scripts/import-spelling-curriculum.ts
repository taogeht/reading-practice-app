// Imports a book's full-year spelling curriculum into one class, or into every
// class at a grade level, from src/lib/curriculum/<book>/spelling.json.
//
// One printed sheet = 16 units x 2 tests = 32 spelling lists per class. Rather
// than a teacher typing those in, this creates them in one pass and schedules
// them a week apart so students meet one at a time (see the available_from
// column added in migration 0061).
//
// Assets are deliberately NOT generated here. The existing per-list
// generate-audio / generate-images routes already reuse any audio or image
// another class in the same school has for the same word, so generating on
// first use costs far less than pre-generating 181 words per class.
//
// Idempotent: a list is keyed by (classId, title) and skipped if it already
// exists, so a re-run after adding units or fixing translations is safe.
//
// Usage:
//   npm run import:spelling -- --book=family-friends-2 --class=<uuid>
//   npm run import:spelling -- --book=family-friends-2 --grade=2 --start=2026-09-01
//   npm run import:spelling -- --book=family-friends-2 --grade=2 --write

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { classes, spellingLists, spellingWords } from '../src/lib/db/schema';

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes('--write');

function arg(name: string): string | undefined {
  return ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface SpellingWordEntry { word: string; zh: string | null }
interface SpellingTest { index: number; focus: string; words: SpellingWordEntry[] }
interface SpellingUnit { unit: number; title: string; topic: string; tests: SpellingTest[] }
interface SpellingCurriculum { bookSlug: string; units: SpellingUnit[] }

/** Flattened, in the order students meet them. */
interface PlannedList {
  weekNumber: number;
  title: string;
  words: SpellingWordEntry[];
  availableFrom: Date | null;
}

const BOOK_LABEL: Record<string, string> = {
  'family-friends-1': 'FF1',
  'family-friends-2': 'FF2',
  'family-friends-3': 'FF3',
  'family-friends-4': 'FF4',
  'family-friends-5': 'FF5',
};

/** Title doubles as the idempotency key, so it must be stable and unique
 *  within a class — book, unit and test number all take part. */
function listTitle(bookSlug: string, unit: SpellingUnit, test: SpellingTest): string {
  const label = BOOK_LABEL[bookSlug] ?? bookSlug;
  return `${label} Unit ${unit.unit} · Test ${test.index} — ${test.focus}`;
}

function planLists(
  curriculum: SpellingCurriculum,
  unitFilter: (unit: number) => boolean,
  start: Date | null,
  intervalDays: number,
): PlannedList[] {
  const planned: PlannedList[] = [];
  let week = 0;
  for (const unit of [...curriculum.units].sort((a, b) => a.unit - b.unit)) {
    if (!unitFilter(unit.unit)) continue;
    for (const test of [...unit.tests].sort((a, b) => a.index - b.index)) {
      week += 1;
      planned.push({
        weekNumber: week,
        title: listTitle(curriculum.bookSlug, unit, test),
        words: test.words,
        availableFrom: start
          ? new Date(start.getTime() + (week - 1) * intervalDays * 24 * 60 * 60 * 1000)
          : null,
      });
    }
  }
  return planned;
}

function parseUnitFilter(raw: string | undefined): (unit: number) => boolean {
  if (!raw) return () => true;
  const ranges = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const allowed = new Set<number>();
  for (const range of ranges) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(range);
    if (!m) throw new Error(`--units could not parse "${range}"; use e.g. 0-3 or 0,2,5`);
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) allowed.add(i);
  }
  return (unit) => allowed.has(unit);
}

async function resolveTargetClasses(): Promise<{ id: string; name: string; gradeLevel: number | null }[]> {
  const classId = arg('class');
  const gradeRaw = arg('grade');
  if (Boolean(classId) === Boolean(gradeRaw)) {
    throw new Error('Pass exactly one of --class=<uuid> or --grade=<n>.');
  }

  if (classId) {
    const rows = await db
      .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
      .from(classes)
      .where(eq(classes.id, classId));
    if (rows.length === 0) throw new Error(`No class with id ${classId}`);
    return rows;
  }

  const grade = Number(gradeRaw);
  if (!Number.isInteger(grade)) throw new Error('--grade must be an integer.');
  const rows = await db
    .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
    .from(classes)
    .where(and(eq(classes.gradeLevel, grade), eq(classes.active, true)));
  if (rows.length === 0) throw new Error(`No active classes at grade ${grade}`);
  return rows;
}

async function main(): Promise<void> {
  const bookSlug = arg('book');
  if (!bookSlug) throw new Error('--book=<slug> is required.');

  const curriculumPath = path.resolve(process.cwd(), 'src/lib/curriculum', bookSlug, 'spelling.json');
  if (!fs.existsSync(curriculumPath)) {
    throw new Error(`No spelling.json for "${bookSlug}". Run convert:spelling first.`);
  }
  const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf-8')) as SpellingCurriculum;

  const startRaw = arg('start');
  const start = startRaw ? new Date(`${startRaw}T00:00:00Z`) : null;
  if (startRaw && Number.isNaN(start!.getTime())) {
    throw new Error('--start must be a date like 2026-09-01.');
  }
  const intervalDays = Number(arg('interval-days') ?? '7');
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error('--interval-days must be a positive integer.');
  }

  const planned = planLists(curriculum, parseUnitFilter(arg('units')), start, intervalDays);
  const targets = await resolveTargetClasses();
  const untranslated = planned.flatMap((l) => l.words).filter((w) => !w.zh).length;
  const totalWords = planned.reduce((n, l) => n + l.words.length, 0);

  console.log(`Book:     ${bookSlug}`);
  console.log(`Lists:    ${planned.length} per class (${totalWords} words)`);
  console.log(
    `Schedule: ${start ? `${startRaw}, one every ${intervalDays} day(s) — last on ${planned.at(-1)!.availableFrom!.toISOString().slice(0, 10)}` : 'none (--start omitted; all visible immediately)'}`,
  );
  console.log(`Classes:  ${targets.length}`);
  for (const t of targets) console.log(`  - ${t.name} (grade ${t.gradeLevel ?? '—'}) ${t.id}`);
  if (untranslated > 0) {
    console.log(
      `\nNote: ${untranslated}/${totalWords} words have no Mandarin translation.`
        + ' Run translate:spelling first if you want them populated on import.',
    );
  }

  let created = 0;
  let skipped = 0;

  for (const target of targets) {
    const existing = await db
      .select({ title: spellingLists.title })
      .from(spellingLists)
      .where(
        and(
          eq(spellingLists.classId, target.id),
          inArray(spellingLists.title, planned.map((l) => l.title)),
        ),
      );
    const existingTitles = new Set(existing.map((e) => e.title));

    for (const list of planned) {
      if (existingTitles.has(list.title)) { skipped++; continue; }
      created++;
      if (!WRITE) continue;

      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(spellingLists)
          .values({
            classId: target.id,
            title: list.title,
            weekNumber: list.weekNumber,
            gradeLevel: target.gradeLevel ?? null,
            availableFrom: list.availableFrom,
            isPublic: false,
            isCurrent: false,
            active: true,
          })
          .returning({ id: spellingLists.id });

        await tx.insert(spellingWords).values(
          list.words.map((w, index) => ({
            spellingListId: row!.id,
            word: w.word,
            // Audio and images are left for the existing per-list generation
            // routes, which reuse assets already made for the same word
            // elsewhere in the school.
            mandarinTranslation: w.zh,
            orderIndex: index,
          })),
        );
      });
    }
  }

  console.log(`\n${WRITE ? 'Created' : 'Would create'} ${created} list(s); ${skipped} already present.`);
  if (!WRITE) console.log('Re-run with --write to apply.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
