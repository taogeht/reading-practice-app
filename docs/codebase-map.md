# Codebase Map

Last verified: 2026-08-15

Read this file before changing code. It identifies the current entry points and
the most important modules to trace. See [architecture.md](architecture.md) for
system-level decisions, [data-flow.md](data-flow.md) for execution sequences, and
[auth.md](auth.md) for access-control rules.

This map describes the checked-in source plus the working tree visible on the
verification date. It does not prove which migrations, environment flags, or
external services are active in production.

## Top-level map

```text
.
├── src/
│   ├── app/                 Next.js pages, layouts, and API routes
│   ├── components/          Shared and domain React components
│   ├── config/              Typed system-setting definitions
│   ├── hooks/               Shared client hooks
│   ├── lib/                 Domain logic, database, integrations, utilities
│   ├── middleware.ts        Pass-through middleware; not an auth boundary
│   └── types/               Small set of cross-feature types
├── apps/
│   └── mobile/              Expo/React Native Starling Rise learner app
├── packages/
│   └── contracts/           Shared Zod contracts and login constants
├── migrations/              SQL migrations and Drizzle metadata
├── scripts/                 Seeds, backfills, migration and live AI harnesses
├── public/                  Runtime static assets and reference documents
├── images/                  Source/reference imagery
├── docs/                    Agent and developer architecture references
├── package.json             Runtime dependencies and commands
├── next.config.mjs          Next build/runtime configuration
├── drizzle.config.ts        Drizzle schema and database configuration
└── CLAUDE.md                Earlier repository operating notes
```

## Application entry points

- [`src/app/layout.tsx`](../src/app/layout.tsx) — root HTML layout, authentication
  provider, and notifications.
- [`src/app/page.tsx`](../src/app/page.tsx) — public landing page.
- [`src/app/login/page.tsx`](../src/app/login/page.tsx) — teacher/admin login.
- [`src/app/student-login/`](../src/app/student-login) — student class and visual
  password login.
- [`src/app/c/[shortCode]/route.ts`](../src/app/c/[shortCode]/route.ts) — resolves a
  class slug or legacy UUID prefix and redirects to student login.
- [`src/app/s/[token]/route.ts`](../src/app/s/[token]/route.ts) — token login and
  student-session creation.
- [`src/app/(admin)/layout.tsx`](../src/app/%28admin%29/layout.tsx) — admin role guard.
- [`src/app/teacher/layout.tsx`](../src/app/teacher/layout.tsx) — teacher/admin role
  guard and capability-aware shell.
- [`src/app/student/layout.tsx`](../src/app/student/layout.tsx) — student role guard
  and gamification providers.
- [`src/app/api/`](../src/app/api) — server HTTP entry points.
- [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx) — native provider
  and navigation root.
- [`apps/mobile/app/welcome.tsx`](../apps/mobile/app/welcome.tsx) — native learner
  QR/class-code entry point.
- [`apps/mobile/src/api/client.ts`](../apps/mobile/src/api/client.ts) — typed native
  HTTP client, secure refresh, and API error handling.

## Page trees

### Administrator pages

[`src/app/(admin)/`](../src/app/%28admin%29) contains dashboard, users, schools,
classes, terms, stories, settings, audit logs, and avatar catalog pages. Parentheses
make this a route group, so the URLs do not include `(admin)`.

[`src/app/admin/books/page.tsx`](../src/app/admin/books/page.tsx) is a separate
admin-looking page outside that guarded route group. Treat this as an architectural
exception, not a pattern to copy.

### Teacher pages

[`src/app/teacher/`](../src/app/teacher) contains:

- `dashboard` — current dashboard surface; V2 is selected in code
- `classes` — class list and large class-detail workspace
- `assignments` — legacy story assignments
- `stories` — story/TTS management
- `submissions` — recording review and feedback
- `reading` — passage generation, editorial review, and statistics
- `practice-questions` — curriculum question pool management
- `tests` — printable test generation
- `spelling-lists` — class spelling content and asset generation
- `students` — teacher-facing student management
- `helper` — Sunny homework helper

### Student pages

[`src/app/student/`](../src/app/student) contains:

- `dashboard` and `dashboard-v2` — compound assignment/activity home; with the
  current flag, V1 performs a client-side redirect to V2, whose tabs also embed
  spelling, curriculum practice, recorded passages, and story/reading discovery
- `assignments/[assignmentId]/practice` — assignment-scoped legacy story playback
  and persisted recording submission
- `practice/[storyId]` — older standalone story rehearsal; it uses the generic
  story API and invokes `AudioRecorder` without an assignment, so recordings are
  only acknowledged locally and are not uploaded or persisted
- `reading` — generated passage library
- `reading/[passageId]` — multi-page reading session and questions
- `stuff` — avatar, inventory, stars, and related profile UI

There is no standalone `/student/spelling` page or general curriculum-practice
page. Those experiences are components embedded in the dashboard. Do not confuse
them with the older `/student/practice/[storyId]` rehearsal route.

[`src/app/(student)/layout.tsx`](../src/app/%28student%29/layout.tsx) is legacy and has
no current page children.

## API map

All paths below are under `src/app/api`.

- `auth/` — login, student login, logout, and current session
- `mobile/v1/` — native authentication and promotion-aware class resolution
- `admin/` — schools, users, classes, terms, settings, stories, audit logs, R2,
  reset tools, and avatar catalog administration
- `teacher/` — teacher dashboard, class/student views, capability-gated reading
  generation/review, spelling, stars, shop settings, and terms; there is no
  standalone teacher-capabilities endpoint
- `student/` — dashboard, assignments, reading sessions, practice, spelling,
  progression, stars, character canvas, inventory, shop, homework, and heartbeat
- `assignments/`, `stories/`, `recordings/` — legacy reading workflow
- `classes/`, `students/` — general class/student operations
- `books/` — authenticated database-backed catalog reads and admin-only mutations
- `student-media/` — student-media metadata, upload, and download operations
- `spelling-lists/`, `spelling-words/` — shared spelling operations
- `practice/`, `practice-questions/`, `tests/` — practice and printable tests
- `audio/`, `images/`, `media/` — authenticated R2 proxy routes
- `upload/` — presigned R2 uploads and syllabus upload
- `tts/` — voice listing and TTS generation
- `homework-helper/` — Sunny assistant and context
- `fix-story-audio/` — teacher/admin maintenance endpoint retained in the API tree;
  unlike normal stable proxy URLs, it writes a seven-day presigned R2 URL into a
  story's TTS metadata

The repository does not apply one consistent general-versus-role-specific API
rule. Before adding an endpoint, search both trees, trace current callers, and
extend the closest established boundary rather than creating a third variant.

## Important component areas

- [`src/components/providers/`](../src/components/providers) — `AuthProvider`,
  `StarsProvider`, and `AvatarProvider`
- [`src/components/teacher/`](../src/components/teacher) — teacher navigation and
  feature UI, including `TeacherShell`
- [`src/components/student/`](../src/components/student) — dashboard and attempt
  presentation
- [`src/components/audio/audio-recorder.tsx`](../src/components/audio/audio-recorder.tsx)
  — browser recording and upload UI
- [`src/components/recordings/page-recording-panel.tsx`](../src/components/recordings/page-recording-panel.tsx)
  — generated-passage page recording
- [`src/components/reading/reading-library.tsx`](../src/components/reading/reading-library.tsx)
  — student passage discovery
- [`src/components/grading/`](../src/components/grading) — teacher AI analysis UI
- [`src/components/ui/`](../src/components/ui) — reusable UI primitives; search here
  before introducing controls

## Important library modules

### Authentication and authorization

- [`src/lib/auth.ts`](../src/lib/auth.ts) — password hashing, opaque sessions,
  token login, credential login, and `getCurrentUser()`
- [`src/lib/auth/class-access.ts`](../src/lib/auth/class-access.ts) — class,
  assignment, recording, and student-media access helpers
- [`src/lib/auth/teacher-capabilities.ts`](../src/lib/auth/teacher-capabilities.ts)
  — teacher feature permissions
- [`src/lib/auth/reading-content.ts`](../src/lib/auth/reading-content.ts) —
  backward-compatibility re-export of `teacher-capabilities`; new code should
  import the unified capability module directly
- [`src/lib/auth/mobile-session.ts`](../src/lib/auth/mobile-session.ts) — native
  access/refresh issuance, rotation, and revocation
- [`src/lib/auth/student-login.ts`](../src/lib/auth/student-login.ts) — shared QR
  and visual-password validation with durable throttling

### Database

- [`src/lib/db/index.ts`](../src/lib/db/index.ts) — shared pool and Drizzle client
- [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) — authoritative compile-time
  Drizzle model and selected inferred row/insert types; migration drift means it
  is not by itself proof of the live production schema
- [`src/lib/db/seed.ts`](../src/lib/db/seed.ts) — sample-data seeding

### Generated reading

[`src/lib/reading/generate/`](../src/lib/reading/generate) divides generation into
planning, prose, validation, questions, vocabulary, images, and regeneration.
`generatePassage()` in `passage.ts` is the main orchestration boundary.

Other reading modules provide level rules, failure reasons, vocabulary mastery,
student-level resolution, and character/name constraints.

### Recording assessment

- [`src/lib/grading/analyze-recording.ts`](../src/lib/grading/analyze-recording.ts)
  — end-to-end analysis and persistence orchestration
- [`src/lib/grading/whisper-client.ts`](../src/lib/grading/whisper-client.ts) —
  transcription boundary
- [`src/lib/grading/align.ts`](../src/lib/grading/align.ts) — token alignment
- [`src/lib/grading/fluency/`](../src/lib/grading/fluency) — deterministic metrics,
  benchmarks, prosody, composite score, and optional Claude analysis

### Practice and curriculum

- [`src/lib/practice/books.ts`](../src/lib/practice/books.ts) — book registry and
  slug/type boundary
- [`src/lib/practice/book-units.ts`](../src/lib/practice/book-units.ts) — curriculum
  unit discovery
- [`src/lib/practice/generate.ts`](../src/lib/practice/generate.ts) — AI question
  generation
- [`src/lib/practice/generate-test.ts`](../src/lib/practice/generate-test.ts) —
  printable test generation
- [`src/lib/curriculum/`](../src/lib/curriculum) — book/unit source data and shared
  curriculum context

The static `PracticeBook` registry in `src/lib/practice/books.ts` is not the same
model as the database `books` table used by class books, syllabus, and progress.
Practice questions and units use `bookSlug`; operational class-book records use a
database book ID. Do not join these concepts implicitly.

### Gamification

- [`src/lib/gamification/award.ts`](../src/lib/gamification/award.ts) — XP, levels,
  streaks, and unlocks
- [`src/lib/gamification/stars.ts`](../src/lib/gamification/stars.ts) — stars ledger
  and wallet updates
- [`src/lib/gamification/shop.ts`](../src/lib/gamification/shop.ts) — catalog,
  inventory, and purchases
- [`src/lib/gamification/avatar.ts`](../src/lib/gamification/avatar.ts) — avatar
  state and rerolls
- [`src/lib/generation/avatars.ts`](../src/lib/generation/avatars.ts) — generated
  avatar assets
- [`src/lib/generation/snapshot.ts`](../src/lib/generation/snapshot.ts) — Sharp
  canvas snapshots

### Media and external providers

- [`src/lib/storage/r2-client.ts`](../src/lib/storage/r2-client.ts) — object storage
- [`src/lib/storage/media-validation.ts`](../src/lib/storage/media-validation.ts)
  — media constraints
- [`src/lib/image/index.ts`](../src/lib/image/index.ts) — image-provider facade
- [`src/lib/image/types.ts`](../src/lib/image/types.ts) — shared provider contract
- [`src/lib/tts/client.ts`](../src/lib/tts/client.ts) — Google TTS
- [`src/lib/tts/elevenlabs-client.ts`](../src/lib/tts/elevenlabs-client.ts) — optional
  ElevenLabs path
- [`src/lib/pdf/browser.ts`](../src/lib/pdf/browser.ts) — Puppeteer lifecycle

### Cross-cutting utilities

- [`src/lib/logger.ts`](../src/lib/logger.ts) — structured application logging
- [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) — in-memory rate limiting
- [`src/lib/feature-flags.ts`](../src/lib/feature-flags.ts) — compile-time UI flags
- [`src/lib/audit.ts`](../src/lib/audit.ts) — audit-log writes
- [`src/lib/utils.ts`](../src/lib/utils.ts) — shared class-name utility
- [`src/hooks/`](../src/hooks) — playback rate, heartbeat, and speech hooks
- [`src/config/system-settings.ts`](../src/config/system-settings.ts) — definitions,
  defaults, input types, and allowed values for administrator-configured settings

## Database map

The main table groups in `src/lib/db/schema.ts` are:

- Identity: `users`, `students`, `teachers`, `session`
- Tenancy: `schools`, `schoolMemberships`, `academicTerms`, `classes`,
  `classEnrollments`, `classTeachers`
- Legacy reading: `stories`, `assignments`, `recordings`, `studentProgress`
- Generated reading: `vocabulary`, `readingPassages`, `storyPages`,
  `readingQuestions`, `studentReadingSessions`, `studentReadingAnswers`,
  `studentVocabularyMastery`, `readingGenerationJobs`, `passagePageRecordings`
- Spelling: `spellingLists`, `spellingWords`, `spellingWordSentences`,
  `spellingGameResults`
- Practice/tests: `practiceQuestions`, `practiceAttempts`, `classPracticeUnits`,
  `generatedTests`
- Classroom operations: schedules, attendance, media, books, syllabus, recaps,
  gradebook, and reading-level history
- Gamification: XP events/progression/unlocks, stars/grants, shop items/inventory,
  base characters, and student avatars
- Administration: `systemSettings`, `auditLogs`

## Feature flags and retained implementations

[`src/lib/feature-flags.ts`](../src/lib/feature-flags.ts) currently selects:

- `TEACHER_NAV_V2 = true` — wraps all teacher pages in `TeacherShell`, selects
  `TeacherHomeV2`, and selects `ClassBodyV2` within class detail; it is one shared
  flag, not independent navigation, dashboard, and class-page switches
- `STUDENT_DASHBOARD_V2 = true` — the retained V1 client component calls
  `router.replace('/student/dashboard-v2')` after mount; its heartbeat and dashboard
  fetch effects are also mounted, so this is not a server redirect
- `STUDENT_SHOP_ENABLED = false` — hides student-facing shop/collection UI while
  star earning, owned items, teacher grants, and shop APIs remain present

Old dashboards and `StudentLayoutShell` remain in the tree. Do not delete them as
part of unrelated work, but do not use them as the default implementation without
checking the flag and current route.

## Verification map

There is no Jest, Vitest, Playwright, or other conventional test runner. Use:

- `npm run lint` for advisory static checking
- `npm run build` for bundling/runtime integration, while remembering type errors
  are ignored by Next configuration
- Targeted manual exercise through `npm run dev`
- Narrow scripts under `scripts/` only after reading them; many require a real
  database or paid AI services and can write external state

When adding behavior, introduce focused tests where practical instead of expanding
the pattern of unverified route logic.

## Known obsolete or uncertain areas

- V1 dashboards behind constant feature flags
- Empty legacy `(student)` route group and old student shell
- Generic and role-specific APIs that overlap
- Historical `schema.sql` and `dump.sql`
- `theme-provider.tsx` and `theme-toggle.tsx` import `next-themes`, but neither
  component has an identified caller
- Stale setup/status documentation and the default root README
- `cookies-next` is imported only by the credential-login route, where `setCookie`
  is unused because the response cookie API is used directly
- `postgres` has no identified source or script import; `task-master-ai` has no
  application/source import, although the repository's `.taskmaster/` tooling may
  account for it
- `date-fns` is used in source but is not a direct `package.json` dependency
- `/student/practice/[storyId]` is a retained non-persisting rehearsal path and is
  distinct from both assignment recording and curriculum/SRS practice

`books.ts` availability means that a unit is expected to have curriculum JSON; it
does not guarantee that book-specific public imagery or every downstream generated
asset exists. Inspect the selected curriculum directory and actual asset callers
before treating a registered book as production-ready.
