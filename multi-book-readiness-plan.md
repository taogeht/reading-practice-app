# Multi-Book Practice — Readiness Plan

_Goal: let students practice units from any of the five Family & Friends books, not just Book 1._

## Current state (as of this plan)

- **Generation is already book-aware.** `BookSlug` enum (`src/lib/practice/books.ts`), `practice_questions.book_slug` column + `(book_slug, unit, active)` index, and `generate.ts`/`generate-phonics.ts` loading from `src/lib/curriculum/{slug}/unit-{N}.json` all support any book. Teachers can generate Book 2+ questions as soon as the JSON exists.
- **Serving / selection is hardwired to Family & Friends 1.** The student-facing path assumes one book and, critically, does not filter by book when pulling the question pool.
- **Done already:** FAF1 `availableUnits` and `units.ts` `PRACTICE_UNIT_NUMBERS` updated from `[12–15]` to `[1–15]` (units 1–15 are now authored).

## The four blockers

### 1. Session query ignores `book_slug` — cross-book contamination (🔴 highest risk)
`src/app/api/practice/session/route.ts:108` pulls the pool with `WHERE unit = X AND active = true`. Once two books have the same unit number with generated questions, both sets are served in one quiz. Fails silently.

**Fix:** thread `bookSlug` into the session request and add `eq(practiceQuestions.bookSlug, bookSlug)` to the pool query. Source of `bookSlug` = the class's book (blocker 2). The `(book_slug, unit, active)` index already exists to back this query.

### 2. No class → practice-book link (🔴 prerequisite for 1, 3, 4)
`class_practice_units` is `(classId, unit)` only (`schema.ts:885`). Nothing records which book a class practices. The `books`/`class_books` tables are a **separate** feature (syllabus PDFs, UUID-keyed) and are not connected to `BookSlug`.

**Fix (DB migration — follow the hand-edited-SQL workflow in CLAUDE.md, do NOT `db:migrate`):**
- Add `book_slug varchar(50) NOT NULL DEFAULT 'family-friends-1'` to `class_practice_units`.
- Drop/replace any unique constraint on `(class_id, unit)` with `(class_id, book_slug, unit)`.
- Backfill is implicit via the default (all existing rows are FAF1).
- Decision to confirm: is a class single-book (one book_slug per class) or can it enable units from multiple books at once? The per-row `book_slug` on `class_practice_units` supports both; a single-book class is just the constrained case. Recommend per-row (more flexible, no extra table).

### 3. `units.ts` is a hardcoded FAF1 catalog (🟠)
`UNITS` is 15 FAF1 topics/emojis; `MAX_UNIT = 15`. The student picker and session gate through it, so Book 2's different topics can't be represented.

**Fix options (pick one):**
- **(a) Per-book catalog:** turn `UNITS` into a `Record<BookSlug, UnitInfo[]>` (or derive from each book's curriculum JSON `topic` field at build/runtime). `isAvailablePracticeUnit`/`AVAILABLE_PRACTICE_UNITS` become `(bookSlug, unit)`-aware — fold them into `books.ts` (`isUnitAvailableForBook` already exists there) and retire the FAF1-only set.
- **(b) Read topics from JSON:** a small loader that scans `curriculum/{slug}/` and returns `{unit, topic}` per book, replacing the hardcoded `UNITS`. Removes the duplicate source of truth (topics currently live both in `units.ts` and the JSON).
- Recommended: **(b)** — single source of truth, scales to all 5 books automatically.

### 4. Three serving routes are book-blind (🟠)
- `GET /api/student/practice/available-units` (`available-units/route.ts`) — filters FAF1 `UNITS` by `class_practice_units.unit`. Must group by `(book_slug, unit)` and return book-tagged entries.
- `GET /api/practice/session` — see blocker 1; also validate `(bookSlug, unit)` via `isUnitAvailableForBook` instead of `isAvailablePracticeUnit`.
- `GET /api/student/phonics` (`phonics/route.ts:89`) — hardcodes `DEFAULT_BOOK_SLUG`. Must resolve the student's class book.
- Teacher `practice-units` enable/disable route (`teacher/classes/[classId]/practice-units/route.ts`) — uses FAF1-only `AVAILABLE_PRACTICE_UNITS`; must accept `bookSlug` and validate against that book.

## Suggested sequence

1. **Blocker 2 first** (DB migration + class-book concept) — everything else depends on knowing a class's book.
2. **Blocker 1** (session query filter) — closes the contamination hole the moment Book 2 questions exist.
3. **Blocker 3** (generalize `units.ts`, preferably option b).
4. **Blocker 4** (make the four routes book-aware) — partly falls out of 2 and 3.
5. UI: student picker shows book + unit; teacher enable-units UI scoped to the class's book; teacher generation page already has a book picker.

## Deferred (not blockers for practice quizzes)

- **Vocab image namespacing** — DECIDED: new books use `/images/{slug}/unit-N/word.png` (e.g. `/images/family-friends-2/unit-1/word.png`). FAF1's existing `/images/unit-N/` paths stay until something renders them (generation ignores the `image` field — `generate.ts` reads only `v.word`). Migrate FAF1 paths only if/when a vocab-image surface ships.
- **Reading-passage vocabulary table** — `scripts/seed-vocabulary.ts` reads only the `family-friends-1` dir and upserts with global `ON CONFLICT (word)`. The `af_f_level` enum (`starter`→`grade6`) has the slots, but for the reading feature on Book 2+ the seeder must: read the right book dir, set `af_f_level` per book, and resolve words shared across books. Only relevant if reading passages (not practice quizzes) are wanted for other books.

## Don't-forget checklist when authoring a new book

- [ ] Create `src/lib/curriculum/{slug}/unit-{N}.json` for each unit (grammar_patterns required, or the generator refuses the unit).
- [ ] Add the unit numbers to that book's `availableUnits` in `books.ts`.
- [ ] Use `/images/{slug}/unit-N/` for any vocab image paths.
- [ ] Phonics `word_families[].words` must be objects `{word, emoji?}`, not strings (see `api/student/phonics/route.ts`).
