# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Reading-practice homework app. Students record themselves reading teacher-created stories; teachers create stories (with TTS audio), assign them to classes, run spelling activities, take attendance, track syllabus progress, and review submissions. Built for an ESL school in Taiwan — students are Mandarin L1, so fluency analysis and teacher feedback are bilingual.

## Development Commands

- `npm run dev` — Next.js dev server with Turbopack at http://localhost:3000
- `npm run build` — Production build. Turbopack is **disabled** here via `cross-env NEXT_DISABLE_TURBOPACK=1`; some features aren't compatible yet, so don't re-enable it without checking.
- `npm run lint` — ESLint. Most rules are turned off in `eslint.config.mjs` (it's effectively advisory) and `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so lint/type errors will **not** block a build. Verify changes by running the dev server, not by trusting a clean build.
- `npm run db:studio` — Drizzle Studio UI for the DB
- `npm run db:generate` — Produce a new migration file in `migrations/` from `src/lib/db/schema.ts`. Often needs hand-editing after generation (CHECK constraints, seed inserts, data migrations — Drizzle doesn't emit those).
- `npm run db:seed` — Seed sample data via `tsx src/lib/db/seed.ts`
- `npm run db:push` / `db:migrate` — **See the migration gotcha below.** Don't run `db:migrate` without reading it.

No test runner is configured.

## Technology Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4, shadcn/ui (Radix), Lucide icons
- PostgreSQL via `pg` Pool + Drizzle ORM (`src/lib/db/index.ts` — 20-client pool)
- Custom cookie-session auth (bcryptjs). **No Better Auth** despite the `BETTER_AUTH_SECRET` env var name.
- Cloudflare R2 (S3-compatible) for audio, images, documents, student media, and generated avatar PNGs
- **Google Cloud TTS** — story + spelling-word audio (`src/lib/tts/client.ts`)
- **Google Gemini Flash** image generation — spelling word images, reading-passage images, base character portraits, scene backgrounds, cosmetic items (`src/lib/image/gemini-client.ts`, model `gemini-2.5-flash-image`)
- **Anthropic Claude Sonnet 4.6** (`@anthropic-ai/sdk`) — reading passage generation, practice question generation, ESL fluency analysis. Always uses `output_config: { format: { type: 'json_schema', schema: ... } }` with **a minimal schema** because the API rejects `minItems`/`maxItems`/`minimum`/`maximum` — validate with zod after.
- **OpenAI Whisper-1** — recording transcription with word-level timestamps (`src/lib/grading/whisper-client.ts`)
- **Sharp** — server-side image compositing for avatar snapshots and chroma-key removal from Gemini outputs (`src/lib/generation/snapshot.ts`, `src/lib/generation/avatars.ts`)
- **sonner** — toast notifications

## Architecture

### Auth model (`src/lib/auth.ts`)

Three roles in one `users` table: `student`, `teacher`, `admin`, with role-specific detail tables (`students`, `teachers`). Sessions are a 7-day opaque cookie (`session-id`) backed by the `session` table. `getCurrentUser()` is the single entry point used in every API route and server component — always go through it rather than reading cookies directly.

Students have three login paths:
1. **Visual password** — pick an animal/object sequence stored in `students.visual_password_data` (`src/components/students/visual-password-creator.tsx`).
2. **Magic link** — `/s/[token]` looks up `users.login_token`, creates a session, and redirects to `/student/dashboard` (`src/app/s/[token]/route.ts`).
3. **Class shortcode** — `/c/[shortCode]` does a prefix match on `classes.id::text` and redirects to `/student-login/[classId]` (`src/app/c/[shortCode]/route.ts`).

`src/middleware.ts` only whitelists public routes; the **client-side `AuthProvider`** handles role-based redirects, and each API route re-checks via `getCurrentUser()`. Don't rely on middleware for authorization.

### Route layout

- `src/app/(admin)/*` — admin dashboard, schools, users, audit logs, global stories, avatar catalog (route group with admin-only layout)
- `src/app/(student)/*` — legacy student route group; **has no pages**. Real student pages live at `src/app/student/*` and are wrapped by `src/app/student/layout.tsx` (which mounts `StarsProvider` + `AvatarProvider` for the gamification context).
- `src/app/admin/*` — admin-managed books (not in the `(admin)` group)
- `src/app/teacher/*` — classes, stories, assignments, spelling lists, submissions, students
- `src/app/student/*` — dashboard, assignments, practice, stuff (gamification surfaces)
- `src/app/api/*` — REST endpoints; role checks inside each handler
- `src/app/c/[shortCode]`, `src/app/s/[token]` — student short-URL entry points

### Database (`src/lib/db/schema.ts`)

Core reading loop: `users` → `students`/`teachers` → `classes` (teacher-owned, school-scoped) → `class_enrollments` → `assignments` (one `story` per class with due date + attempts) → `recordings` (per-attempt, WebM in R2) → `student_progress`.

Beyond the reading loop:
- **Spelling** — `spelling_lists` → `spelling_words` (with TTS audio + Gemini image + Mandarin translation + cached `spelling_word_sentences`) → `spelling_game_results`.
- **Attendance** — `class_schedules` (day-of-week meetings) + `attendance_records`.
- **Student media** — `student_media` holds teacher-uploaded videos/photos/audio per student.
- **Books & syllabus** — `books` → `class_books` → `class_progress`; `class_syllabus_weeks` → `class_syllabus_assignments`.
- **Reading passages (Raz-Kids style)** — `reading_passages` (smallint `reading_level` 1–5) → `story_pages` + `reading_questions`. Per-page recordings go to `passage_page_recordings` (parallel shape to `recordings`).
- **Gamification** — see the dedicated section below.

`stories.tts_audio` is a `jsonb` array — a story can have multiple TTS voices/versions cached.

Most table soft-deletes use an `active` boolean; the stories archive flow is just `active=false`.

### Storage pattern (`src/lib/storage/r2-client.ts`)

R2 bucket is private. Files are served through three proxy routes so URLs don't expire:
- `/api/audio/[...key]` — audio (recordings + TTS)
- `/api/images/[...key]` — images (spelling, reading passages, avatars, snapshots, etc.)
- `/api/media/[...key]` — student media gallery

`r2Client.uploadFile()` returns the proxy URL automatically based on content-type. For large uploads (student recordings, media), the client requests a **presigned PUT URL** from `/api/upload/presigned-url` and uploads directly to R2 — this bypasses Next.js's body-size limit. `next.config.mjs` also raises server-action body size to 200mb as a fallback.

File-key conventions live as methods on `r2Client`: `generateAudioKey`, `generateMediaKey`, `generateSyllabusKey`, `generateImageKey`. Avatar/scene/cosmetic/snapshot keys are hand-rolled in `src/lib/generation/avatars.ts` and `snapshot.ts` under an `images/avatars/*` prefix.

**Audio URLs in the DB are proxy URLs (`/api/audio/<key>`), not direct R2 URLs.** If you parse them, handle the `/api/audio/` prefix — the legacy `<bucket>.r2.cloudflarestorage.com/<key>` form only exists on very old rows.

### TTS

Primary client is Google Cloud TTS (`src/lib/tts/client.ts`) with Journey/Chirp voice presets. There's also an ElevenLabs client (`src/lib/tts/elevenlabs-client.ts`) — check which one an API route imports before assuming. TTS output is uploaded to R2 under `audio/tts/` and its URL is appended to `stories.tts_audio` or `spelling_words.audio_url`.

### Reading fluency analysis (`src/lib/grading/`)

When a student submits a recording (assignment-flow → `recordings`, per-page → `passage_page_recordings`), the same pipeline runs on both:

1. **Whisper** (`whisper-client.ts`) — transcript + duration + word-level timestamps. Always with `language=en` and `timestamp_granularities=["word"]`.
2. **Tokenize + Wagner-Fischer alignment** (`align.ts`) — matched/substituted/missed/inserted counts, letter grade from accuracy, hallucination guard.
3. **Fluency pipeline** (`fluency/`) — deterministic, no LLM:
    - `compute-metrics.ts` — WCPM, accuracy, pause stats (intrusion pauses = long pause where the preceding word doesn't end in `.,?!:;`).
    - `benchmarks.ts` — Hasbrouck & Tindal 2017 norms by `readingLevel`. ESL adjustment is the native 50th-percentile minus `ESL_WCPM_OFFSET = 25` (Chinese L1 research consensus).
    - `prosody.ts` — 1–4 phrasing/smoothness/pace scores derived from pauses + ESL band.
    - `score.ts` — composite 0–100 fluency score, weighted accuracy 30% / phrasing 25% / smoothness 20% / pace 15%, plus a self-correction bonus capped at +10. Bump `FLUENCY_VERSION` when the formula changes.
4. **Claude pass** (`fluency/claude-analyzer.ts`, `claude-sonnet-4-6`) — ESL-aware error classification, prosody notes, single-sentence `teacher_summary`, with **Traditional Mandarin (zh-Hant)** translations paired to each English line. **Returns `null` on any failure** (missing key, schema mismatch, network); the row keeps its deterministic metrics. Use `lang="zh-Hant"` when rendering Mandarin so browser font fallback picks correctly.

All persisted in matching columns on both recording tables. Display surfaces: teacher's `AIAnalysisPanel` (`src/components/grading/ai-analysis-panel.tsx`) and student's `StudentAttemptCard` (`src/components/student/student-attempt-card.tsx`). Both render the full bilingual content; the student card never shows the native (L1) band — only ESL.

### Gamification system (stars, shop, avatars)

A reward economy layered on top of the existing XP system. `awardStars()` is invoked inside `awardXp()` (`src/lib/gamification/award.ts`), so every XP event automatically dual-fires stars.

- **Stars** — `studentProgression.starsBalance` + `starsLifetime`. Transactions logged to `star_transactions` (earn/spend, source_type = `xp_action` / `teacher_grant` / `shop_purchase` / `reroll`). Reroll cost lives in `system_settings` keyed `reroll_cost_stars`.
- **Shop** — `shop_items` (built-in items have `school_id IS NULL`), `class_shop_items` (opt-out per class), `student_inventory`. The student shop UI is currently **hidden behind `STUDENT_SHOP_ENABLED` in `src/lib/feature-flags.ts`** — set to `false` while the shop matures. Earning still happens; teachers can still grant stars; admin avatar catalog still works.
- **Avatars** — `student_avatars` row per student. `character_id` references one of 9 Gemini-generated `base_characters` (3 humans / 3 animals / 3 robots). `equipped_items` is the free-canvas state: `{ items: [{itemId, x, y, scale, rotation, zIndex, category}], character: {x, y, scale, rotation, zIndex} }`. Background lives in its own `background_item_id` column (always full-bleed).
- **Avatar snapshots** — Sharp composites the canvas state into a 640×840 PNG on every save (`src/lib/generation/snapshot.ts`). The flat snapshot is what every read-only surface renders (nav badge, classmates gallery, peer profile sheets). The canvas editor itself reads the live state. Snapshot regeneration is fire-and-forget after each `PATCH /api/student/character/canvas`.
- **Image generation** — `src/lib/generation/avatars.ts`. Characters + cosmetics get a forced lime-green background plus a `stripGeminiBackground()` flood-fill that strips whatever background Gemini actually drew (it sometimes ignores the chroma-key instruction and draws a grey checkerboard pattern as its "transparent" indicator). Scenes are not chroma-keyed — those ARE the background.
- **Admin catalog UI** — `/admin/avatar-catalog`. Click-to-generate per item; "Generate all pending" runs sequentially with a 500ms gap; "Refresh all snapshots" re-composites every student's avatar.

API path naming: `/api/student/avatar` is the **legacy** emoji-picker (visual-password style). All Phase 3+ character work lives at `/api/student/character/*` — don't confuse them.

## Environment Variables

Required in `.env.local` (see `.env.example`):
- `DATABASE_URL` — Postgres connection string (Railway in prod; see `DATABASE.md`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `GOOGLE_TTS_PROJECT_ID`, `GOOGLE_TTS_CLIENT_EMAIL`, `GOOGLE_TTS_PRIVATE_KEY` (note the escaped `\n` in the key)
- `OPENAI_API_KEY` — Whisper transcription
- `GEMINI_API_KEY` — all Gemini image generation (spelling, reading passages, avatars, scenes, cosmetics)
- `ANTHROPIC_API_KEY` — Claude reading-content generation + fluency analysis. **The fluency Claude pass silently degrades to null when this is missing** — only the deterministic fields land.
- `BETTER_AUTH_SECRET` — legacy name; used as the session secret
- `NEXT_PUBLIC_APP_URL` — used to build redirect URLs from short-code routes
- `ENABLE_AI_GRADING` — `'true'` to actually call Whisper on submissions. Flip off to halt Whisper spend without a deploy.

## Migration workflow (read this before touching the DB)

The Drizzle migration journal **is out of sync** with the actual prod DB — older migrations were applied via `db:push` (which doesn't record in `__drizzle_migrations`), so `db:migrate` will try to replay them and crash on duplicate-table errors. The working pattern:

1. Edit `src/lib/db/schema.ts`.
2. `npm run db:generate` → produces a new SQL file in `migrations/`.
3. **Hand-edit the generated SQL** to add anything Drizzle can't emit: CHECK constraints, data migrations, seed inserts. Use `--> statement-breakpoint` between statements (drizzle convention).
4. Apply directly via a tsx script (existing pattern):
   ```ts
   const stmts = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
   for (const stmt of stmts) await pool.query(stmt);
   ```
   Tolerate `already exists` errors so the script is re-runnable.

For long-lived seed scripts (like `scripts/seed-shop-items.ts`, `scripts/backfill-fluency-metrics.ts`), make them idempotent on a natural key and leave them in `scripts/` for future re-runs.

## Async background work

Several flows fire-and-forget work after returning the response (recording analysis, snapshot generation, Gemini image gen, avatar canvas saves):

- Use `void someAsyncFn().catch((err) => console.error(...))` so unhandled rejections still surface in logs.
- Set `export const maxDuration = 60` on Next.js route handlers that kick off such work — covers the synchronous portion before the response goes out.
- This relies on a **long-running Node process** (Coolify, Railway). On serverless platforms that kill the function after `res.end()`, the background work dies.

## Gotchas

- `npm run build` is **not** a correctness check: TypeScript errors are ignored and ESLint rules are mostly off. Run the dev server and exercise the feature.
- Don't use Turbopack for production builds — the script intentionally disables it.
- Middleware is pass-through; all auth happens in route handlers/server components via `getCurrentUser()`.
- When adding file uploads over a few MB, use the presigned-URL flow (`/api/upload/presigned-url`), not a server-action POST.
- **Don't run `db:migrate`** — see migration workflow above. Apply via direct SQL.
- **`/api/student/avatar` ≠ `/api/student/character`** — the first is the legacy emoji-picker, the second is the Phase 3+ Gemini character system.
- **Hidden student shop**: `STUDENT_SHOP_ENABLED` in `src/lib/feature-flags.ts` is `false`. Stars still accumulate; teachers can still grant; admin tools still work — only the student-facing shop UI is gated. Flip to `true` when ready.
- **Claude `output_config` constraints**: the API rejects `minItems`/`maxItems`/`minimum`/`maximum` in the JSON schema. Keep the schema minimal and validate with zod after.
- **Stories `readingLevel` is `varchar(50)`**, reading_passages `readingLevel` is `smallint`. The fluency benchmarks module takes the smallint; for assignment-flow recordings we best-effort regex-parse a 1-5 out of the story varchar.
- Ignore `GEMINI.md` — it's stale (claims ElevenLabs is the TTS stack, references a `(teacher)` route group that doesn't exist).
