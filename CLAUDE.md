# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Reading-practice homework app. Students record themselves reading teacher-created stories; teachers create stories (with TTS audio), assign them to classes, run spelling activities, take attendance, track syllabus progress, and review submissions.

## Development Commands

- `npm run dev` — Next.js dev server with Turbopack at http://localhost:3000
- `npm run build` — Production build. Turbopack is **disabled** here via `cross-env NEXT_DISABLE_TURBOPACK=1`; some features aren't compatible yet, so don't re-enable it without checking.
- `npm run lint` — ESLint. Most rules are turned off in `eslint.config.mjs` (it's effectively advisory) and `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so lint/type errors will **not** block a build. Verify changes by running the dev server, not by trusting a clean build.
- `npm run db:studio` — Drizzle Studio UI for the DB
- `npm run db:generate` / `db:migrate` / `db:push` — Drizzle Kit migration workflow (edit `src/lib/db/schema.ts` → `db:generate` → `db:push` for dev or `db:migrate` for prod)
- `npm run db:seed` — Seed sample data via `tsx src/lib/db/seed.ts`

No test runner is configured.

## Technology Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4, shadcn/ui (Radix), Lucide icons
- PostgreSQL via `pg` Pool + Drizzle ORM (`src/lib/db/index.ts` — 20-client pool)
- Custom cookie-session auth (bcryptjs). **No Better Auth** despite the `BETTER_AUTH_SECRET` env var name.
- Cloudflare R2 (S3-compatible) for audio, images, documents, and student media
- Google Cloud Text-to-Speech for story + spelling-word audio; Google Gemini for spelling-word images

## Architecture

### Auth model (`src/lib/auth.ts`)

Three roles in one `users` table: `student`, `teacher`, `admin`, with role-specific detail tables (`students`, `teachers`). Sessions are a 7-day opaque cookie (`session-id`) backed by the `session` table. `getCurrentUser()` is the single entry point used in every API route and server component — always go through it rather than reading cookies directly.

Students have three login paths:
1. **Visual password** — pick an animal/object sequence stored in `students.visual_password_data` (`src/components/students/visual-password-creator.tsx`).
2. **Magic link** — `/s/[token]` looks up `users.login_token`, creates a session, and redirects to `/student/dashboard` (`src/app/s/[token]/route.ts`).
3. **Class shortcode** — `/c/[shortCode]` does a prefix match on `classes.id::text` and redirects to `/student-login/[classId]` (`src/app/c/[shortCode]/route.ts`).

`src/middleware.ts` only whitelists public routes; the **client-side `AuthProvider`** handles role-based redirects, and each API route re-checks via `getCurrentUser()`. Don't rely on middleware for authorization.

### Route layout

- `src/app/(admin)/*` — admin dashboard, schools, users, audit logs, global stories (route group)
- `src/app/(student)/*` — student layout wrapper (route group)
- `src/app/admin/*` — admin-managed books (not in the `(admin)` group)
- `src/app/teacher/*` — classes, stories, assignments, spelling lists, submissions, students
- `src/app/student/*` — dashboard, assignments, practice
- `src/app/api/*` — REST endpoints; role checks inside each handler
- `src/app/c/[shortCode]`, `src/app/s/[token]` — student short-URL entry points

### Database (`src/lib/db/schema.ts`)

Core reading loop: `users` → `students`/`teachers` → `classes` (teacher-owned, school-scoped) → `class_enrollments` → `assignments` (one `story` per class with due date + attempts) → `recordings` (per-attempt, WebM in R2) → `student_progress`.

Beyond the reading loop, the schema covers several parallel features that share classes/students:
- **Spelling** — `spelling_lists` → `spelling_words` (with TTS audio + Gemini-generated image + Mandarin translation + cached `spelling_word_sentences` for fill-in-the-blank) → `spelling_game_results` (per-round "snowman" game tracking).
- **Attendance** — `class_schedules` (day-of-week meetings) + `attendance_records` (daily per-student, with makeup tracking).
- **Student media** — `student_media` holds teacher/admin-uploaded videos, photos, audio for a student's gallery.
- **Books & syllabus** — `books` (admin-managed materials) → `class_books` → `class_progress` (daily pages/notes) and `class_syllabus_weeks` → `class_syllabus_assignments` (book+pages per week).

`stories.tts_audio` is a `jsonb` array — a story can have multiple TTS voices/versions cached.

Most table soft-deletes use an `active` boolean; the stories archive flow is just `active=false` (hidden from students, shown in teacher's archived section).

### Storage pattern (`src/lib/storage/r2-client.ts`)

R2 bucket is private. Files are served through three proxy routes so URLs don't expire:
- `/api/audio/[...key]` — audio (recordings + TTS)
- `/api/images/[...key]` — images (spelling word art, etc.)
- `/api/media/[...key]` — student media gallery

`r2Client.uploadFile()` returns the proxy URL automatically based on content-type. For large uploads (student recordings, media), the client requests a **presigned PUT URL** from `/api/upload/presigned-url` and uploads directly to R2 — this bypasses Next.js's body-size limit. `next.config.mjs` also raises server-action body size to 200mb as a fallback.

File-key conventions live as methods on `r2Client`: `generateAudioKey`, `generateMediaKey`, `generateSyllabusKey`, `generateImageKey`. Use these rather than composing keys inline.

### TTS

Primary client is Google Cloud TTS (`src/lib/tts/client.ts`) with Journey/Chirp voice presets. There's also an ElevenLabs client (`src/lib/tts/elevenlabs-client.ts`) — check which one an API route imports before assuming. TTS output is uploaded to R2 under `audio/tts/` and its URL is appended to `stories.tts_audio` or `spelling_words.audio_url`.

## Environment Variables

Required in `.env.local` (see `.env.example`):
- `DATABASE_URL` — Postgres connection string (Railway in prod; see `DATABASE.md`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `GOOGLE_TTS_PROJECT_ID`, `GOOGLE_TTS_CLIENT_EMAIL`, `GOOGLE_TTS_PRIVATE_KEY` (note the escaped `\n` in the key)
- `GEMINI_API_KEY` — spelling word images
- `BETTER_AUTH_SECRET` — legacy name; used as the session secret
- `NEXT_PUBLIC_APP_URL` — used to build redirect URLs from short-code routes

## Gotchas

- `npm run build` is **not** a correctness check: TypeScript errors are ignored and ESLint rules are mostly off. Run the dev server and exercise the feature.
- Don't use Turbopack for production builds — the script intentionally disables it.
- Middleware is pass-through; all auth happens in route handlers/server components via `getCurrentUser()`.
- When adding file uploads over a few MB, use the presigned-URL flow (`/api/upload/presigned-url`), not a server-action POST.
- Ignore `GEMINI.md` — it's stale (claims ElevenLabs is the TTS stack, references a `(teacher)` route group that doesn't exist).
