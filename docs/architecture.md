# Repository Architecture

Last verified: 2026-08-15

This document describes the stable architectural shape of the application. For
file-by-file navigation, see [codebase-map.md](codebase-map.md). For request and
domain sequences, see [data-flow.md](data-flow.md). For security boundaries, see
[auth.md](auth.md).

## System overview

The repository contains a full-stack Next.js application plus an Expo native
learner client. It provides four application surfaces:

- Administrators manage schools, users, classes, terms, stories, system settings,
  audit data, and the avatar catalog.
- Teachers manage classes, assignments, recordings, reading passages, spelling,
  practice, tests, attendance, syllabus progress, recaps, gradebook data, and
  student media.
- Students complete reading and recording assignments, generated reading
  passages, practice questions, and spelling games, and interact with XP, stars,
  avatars, and inventory.
- Native learners enter through the Starling Rise app in `apps/mobile`. The
  initial native foundation provides persistent QR/class login and a four-tab
  shell; learning-feature parity remains in progress.

The principal runtime path is:

```text
React client or server component
  -> Next.js App Router page/layout
  -> REST route handler under src/app/api
  -> authentication and resource authorization
  -> direct Drizzle query or src/lib domain service
  -> PostgreSQL
  -> optional R2 / AI / TTS / PDF boundary

Expo learner screen
  -> typed client in apps/mobile/src/api/client.ts
  -> /api/mobile/v1 authentication or existing student route
  -> the same authentication, authorization, Drizzle, and integration modules
```

The native app does not introduce a separate backend deployment. The application
still has no RPC layer, job-worker package, or repository layer. Route handlers
remain the backend boundary, and many of them query Drizzle directly.

## Native application

[`apps/mobile`](../apps/mobile) is an Expo SDK 57 / React Native 0.86 application
using Expo Router. `AuthProvider` owns only device-session state, TanStack Query
loads the learner-safe dashboard projection and future server state, and React
Native `StyleSheet` plus `src/theme/tokens.ts` define the visual system. The
mobile dashboard contract deliberately excludes browser-only student credentials
present in the older web dashboard response. Mobile assignment list/detail routes
reuse `src/lib/mobile/assignments.ts` so dashboard and Read statuses stay aligned.
Narration is downloaded with bearer refresh support into the app cache and played
from a local URI; logout and session expiry clear both cached files and query data.

[`packages/contracts`](../packages/contracts) is the cross-runtime seam. It must
remain pure TypeScript/Zod and must not import Next.js, React Native, database, or
provider modules.

The native app requires Node 22.13 or newer. Its API origin and production app-link
host come from `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_APP_HOST`. These are public
configuration values, never secrets.

## Runtime and framework

- Next.js 16 App Router and React 19
- TypeScript with strict compiler settings, although production builds currently
  ignore type errors in [`next.config.mjs`](../next.config.mjs)
- Tailwind CSS 4 and Radix/shadcn-style primitives
- PostgreSQL through `pg` and Drizzle ORM
- Node runtime assumptions for media processing and background work

[`src/app/layout.tsx`](../src/app/layout.tsx) is the root entry point. It installs
the client authentication provider and Sonner notifications. Role-specific server
layouts then protect the administrator, teacher, and student page trees.

## Application surfaces

### Administrator

Most admin pages live in the `(admin)` route group and inherit
[`src/app/(admin)/layout.tsx`](../src/app/%28admin%29/layout.tsx), which requires an
administrator and renders `AdminLayoutShell`.

The route group produces URLs such as `/dashboard`, `/users`, `/schools`,
`/classes`, `/stories`, `/terms`, `/settings`, and `/avatar-catalog`.

`src/app/admin/books/page.tsx` is outside this route group. Its mutation APIs are
admin-protected, but the page itself does not inherit the central admin layout.

### Teacher

[`src/app/teacher/layout.tsx`](../src/app/teacher/layout.tsx) accepts teacher and
administrator roles. When `TEACHER_NAV_V2` is enabled it loads teacher capabilities
and renders `TeacherShell`.

Teacher pages are mostly client-heavy orchestration screens that fetch multiple
REST endpoints. Complex examples include the class detail page, reading generator,
reading review, and submissions page.

### Student

[`src/app/student/layout.tsx`](../src/app/student/layout.tsx) requires the student
role and mounts `StarsProvider` and `AvatarProvider`. The dashboard owns its own
navigation chrome, so the layout intentionally does not use the old
`StudentLayoutShell`.

`src/app/(student)/layout.tsx` is a legacy route-group layout with no current page
children. `STUDENT_DASHBOARD_V2` redirects the retained V1 dashboard implementation
to `/student/dashboard-v2`.

## Backend organization

The backend consists of roughly 180 `route.ts` files under `src/app/api`. The
usual handler responsibilities are:

1. Call `getCurrentUser()`.
2. Check role, class ownership/enrollment, or a teacher capability.
3. Parse and validate URL/body/form-data input.
4. Query Drizzle directly or invoke a domain service.
5. Optionally send or retrieve data from an external service.
6. Return JSON, streamed media, or a generated document.

The strongest service boundaries are:

- `src/lib/reading/generate/` — generated-passage planning and creation
- `src/lib/grading/` — transcription alignment and fluency assessment
- `src/lib/gamification/` — XP, stars, shop, and avatars
- `src/lib/practice/` — curriculum questions and printable tests
- `src/lib/storage/` — Cloudflare R2 access and upload validation
- `src/lib/image/` — pluggable image provider facade
- `src/lib/tts/` — speech generation
- `src/lib/syllabus/` — spreadsheet import/export

There is no general repository/data-access layer. Database types from
`src/lib/db/schema.ts` are imported directly across much of the application.

## Domain boundaries

### Identity and tenancy

`users` contains all roles. `students` and `teachers` provide role-specific data.
Schools connect through memberships, classes, and academic terms. Students join
classes through `classEnrollments`; co-teachers join through `classTeachers`.

Tenancy is not completely uniform. Class operational data is school-scoped, while
some stories, books, curriculum, generated reading content, and system settings
are global or only indirectly scoped.

### Legacy reading assignments

The original reading model is:

```text
stories -> assignments -> recordings -> studentProgress
                 ^
classes/enrollments
```

Stories contain free-form `readingLevel` strings and cached TTS JSON. Assignments
publish a story to one class. Recordings are attempts reviewed by teachers and may
contain deterministic and AI-generated grading fields.

### Generated reading passages

The newer reading model is separate:

```text
readingPassages -> storyPages
                -> readingQuestions
                -> studentReadingSessions -> studentReadingAnswers
                -> passagePageRecordings
                -> vocabulary / studentVocabularyMastery
```

It uses numeric levels 1–5, an editorial status workflow, multi-page content,
server-graded questions, resumable sessions, and generation-job tracking. Do not
assume that a change to legacy `stories` also affects `readingPassages`.

### Practice and tests

Book definitions and curriculum JSON feed teacher-generated `practiceQuestions`.
`classPracticeUnits` controls availability and `practiceAttempts` provides
spaced-repetition history. `generatedTests` stores a versioned JSON document used
to render printable HTML/PDF and associated image/audio assets.

### Gamification

XP events update `studentProgression`, including level and streak state. Star
transactions and balances form a second reward currency. Shop inventory and
avatar canvas state use their own tables. The student shop UI is hidden by a
compile-time feature flag, but earning and avatar systems remain active.

## Database architecture

[`src/lib/db/index.ts`](../src/lib/db/index.ts) exports a shared `pg` pool and
Drizzle instance. The pool allows up to 20 clients per application process.

[`src/lib/db/schema.ts`](../src/lib/db/schema.ts) is the authoritative application
schema. It is a large single module containing identity, reading, spelling,
attendance, syllabus, media, practice, gradebook, gamification, and session tables.

SQL files live in [`migrations/`](../migrations). Migration handling is unusual:

- Older production changes were applied with `db:push` or direct SQL and are not
  fully represented in Drizzle's migration journal.
- There are duplicate `0007` filenames.
- The journal ends before the latest numbered SQL files.
- Later migrations have often been applied through purpose-built TypeScript
  scripts with idempotent handling.
- Root `schema.sql` and `dump.sql` are historical snapshots, not authoritative
  representations of the current schema.

Consequently, do not run `npm run db:migrate` or `npm run db:push` against an
important database without first reconciling its actual migration state. Schema
changes need both a Drizzle update and a reviewed, safely applicable SQL plan.

`0057_mobile_auth_foundation.sql` adds hashed mobile refresh sessions and durable
authentication-rate-limit buckets. Apply it with `npm run migrate:mobile-auth`
only after confirming `DATABASE_URL`; it must run before deploying code that uses
the new login modules.

## Storage and media

Cloudflare R2 is private and accessed with the S3 SDK through
[`src/lib/storage/r2-client.ts`](../src/lib/storage/r2-client.ts).

Authenticated proxy endpoints expose stable application URLs:

- `/api/audio/[...key]`
- `/api/images/[...key]`
- `/api/media/[...key]`

Database rows generally store proxy URLs or R2 keys rather than public bucket
URLs. Sensitive student recordings and media require owner, administrator, or
class-management access. Shared content such as TTS and lesson images is available
to authenticated users.

Use existing R2 key generators. Some generation modules use deliberately versioned
keys to avoid immutable-cache collisions; new regeneration paths should do the
same.

## External-service boundaries

- Anthropic Claude — reading passage planning/prose/questions, practice and test
  generation, homework assistance, and bilingual qualitative fluency analysis
- OpenAI Whisper — word-timestamped English transcription
- Google Gemini / OpenAI image generation — selected through `src/lib/image`
- Google Cloud TTS / ElevenLabs — audio generation
- Cloudflare R2 — private object storage
- Sharp — image cleanup, compositing, and avatar snapshots
- Puppeteer — printable test PDF rendering
- XLSX — syllabus/template import and export

AI outputs are generally validated after generation. Reading generation uses
minimal provider JSON schemas followed by Zod/domain validation because provider
schema support is narrower than JSON Schema itself.

## State and consistency

Client state is local React state plus a few contexts:

- `AuthProvider`
- `StarsProvider`
- `AvatarProvider`

There is no React Query, Redux, or Zustand cache. Pages commonly refetch endpoints
after writes, so request ordering and loading/error state are managed separately in
each feature.

Complex database mutations use transactions inconsistently. XP awarding and shop
purchases are transactional. Star awards currently insert a ledger row and then
update progression outside one shared transaction, creating a possible divergence
on partial failure.

## Background work and deployment assumptions

Recording analysis, some image/audio work, passage jobs, and avatar snapshots may
continue after a route has returned. Passage generation uses `queueMicrotask`, and
several other paths deliberately fire and forget promises.

This depends on a long-running Node host such as Railway/Coolify. A serverless host
that terminates execution after the response can lose this work. There is no
durable job queue or retry worker in this repository.

Generated assets may be uploaded before the database transaction commits. Failed
generation can therefore leave orphaned R2 objects; no general object janitor is
implemented.

## Architectural pressure points

- Direct route-to-schema coupling makes cross-cutting changes broad.
- Large client pages coordinate many independent resources and behaviors.
- Legacy and generated reading systems overlap but have different invariants.
- Authorization is decentralized and not consistently routed through helpers.
- Migration history cannot be inferred solely from the Drizzle journal.
- There is no conventional automated test suite.
- Type errors do not fail production builds, and linting is intentionally lenient.
- Several feature-flagged V1 interfaces and legacy modules remain in the tree.
