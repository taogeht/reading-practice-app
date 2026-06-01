# Improvement Roadmap

_Produced 2026-05-30 from a multi-dimension code audit (7 parallel auditors across architecture, security, reliability, performance/cost, testing, product/UX, AI-correctness) synthesized and adversarially critiqued by three independent lenses (groundedness, product-realism, missing-opportunity)._

**Every marquee claim below was independently re-verified against source by a groundedness reviewer** — these are grounded in this codebase, not generic best practice. Where the critique lenses disagreed with each other, the disagreement is noted inline so you can make the call.

## How to read this

- Items are grouped into **tiers by priority**, then carry a stable ID (e.g. `SEC-1`) so they can become issues.
- `impact` / `effort` are honest estimates for a **solo developer**. Security/data-loss/correctness that can harm a child's grade or leak minors' data outranks polish.
- The one-line read: _the hard parts are done well (deterministic fluency pipeline, ESL benchmarks, transactional star spend, dedup'd image gen), but the safety net is missing and the two highest-traffic kid flows — login and submit-homework — are the weakest code in the app. The correctness claims are real but unguarded._

## At a glance

| Tier | Theme | Items | Net effort |
|------|-------|-------|-----------|
| 0 | Security & minors' data — fix this week | SEC-1…6 | mostly small |
| 1 | Stop silently mis-grading children | COR-1…5 | small (one backfill) |
| 2 | Safety net (tests / types / observability) | NET-1…3 | small–medium |
| 3 | Submit-homework reliability | REL-1…2 | medium |
| 4 | Raise the ceiling (product bets) | PRD-1…3 | large |
| — | Strategic (pre-fork) | STR-1, STR-2 | medium |
| — | Deferred / rejected | DEF-1…2 | — |

---

## Tier 0 — Security & minors' data (fix this week)

Mostly deletions and guard clauses. Several would be reportable if this product were ever audited for child-data handling.

### SEC-1 — Delete the unauthenticated debug/enumeration endpoints
- **Impact:** high · **Effort:** small
- **Evidence (verified):** `src/app/api/debug/users/route.ts` returns every user's email and selects `passwordHash AS hasPassword` (a hash-existence oracle) with no auth. `src/app/api/test-r2/route.ts` GET/POST mint presigned URLs and mutate `stories.tts_audio`, also unauthenticated.
- **Do:** Delete both files (leftover dev tooling). Grep for other `NODE_ENV`-unguarded debug routes.

### SEC-2 — Authenticate the R2 proxy routes serving minors' recordings
- **Impact:** high · **Effort:** small–medium · _(promoted by two critique lenses; the first synthesis pass under-ranked it)_
- **Evidence (verified):** `/api/audio/[...key]` does no `getCurrentUser()` and no ownership scoping, and serves with `Cache-Control: public` (1-year immutable) — anyone with a key streams any child's reading recording. This is the **highest-volume PII surface in the product** (every homework submission). `/api/media` has the same gap.
- **Do:** Require auth + ownership on `/api/media` (reuse the check `student-media/download` already does). For recordings, prefer signed/short-lived access over a public-cache proxy. Drop `public` cache on PII keys.

### SEC-3 — Class-ownership gate on every `/api/classes/[classId]/*` route (cross-tenant IDOR)
- **Impact:** high · **Effort:** small
- **Evidence (verified):** the correct helper `userCanManageClass` exists at `src/lib/auth/class-access.ts` but is referenced by **no** route under `classes/`. Attendance/progress/login-activity/books/syllabus routes gate on role only and filter by URL `classId`, so any teacher reads/tampers with another class's minors' records by changing the URL.
- **Do:** Add a `requireClassAccess(classId)` wrapper and call it right after the role check in every GET/POST/PATCH/DELETE under `src/app/api/classes/[classId]/**`. Grep the literal role-check string to find all sites so none is missed.

### SEC-4 — Fix the admin-route privilege-escalation precedence bug
- **Impact:** medium · **Effort:** small
- **Evidence (verified):** `src/app/api/admin/run-migration/route.ts:11` guards with `user.role !== 'admin' && user.role !== 'teacher'`, which lets **teachers run raw CREATE/ALTER DDL** against prod.
- **Do:** Change to admin-only — or delete the route (per CLAUDE.md, migrations run via tsx, not HTTP). Grep `admin/*` for `role !== 'admin' && role !== 'teacher'` and fix each.

### SEC-5 — Close the visual-password brute-force chain
- **Impact:** high · **Effort:** small–medium
- **Evidence (verified):** `/api/students` returns the full active-student roster **including `visualPasswordType`** with no `getCurrentUser()`. Combined with a ~12-option visual keyspace and **no rate limiting** on the login path, that's a concrete account-takeover chain (enumerate → read password type → brute force).
- **Do:** Authenticate/scope the roster endpoint, stop returning `visualPasswordType` publicly, and add per-student + per-IP attempt throttling on the visual-password login.

### SEC-6 — Purge R2 media on account deletion and data reset
- **Impact:** high · **Effort:** small–medium · _(critic-found)_
- **Evidence (verified):** `DELETE /api/admin/users/[id]` hard-deletes the user row (relying on DB cascades) and `reset-student-data` deletes recording rows — both make **zero `r2Client.deleteFile` calls**. Every deleted child's audio/photos/videos survive in R2 indefinitely behind the public proxy.
- **Do:** Enumerate and delete the child's R2 objects on user delete + data reset. Right-to-erasure / retention obligation for minors.

---

## Tier 1 — Stop silently mis-grading children

All pure-function fixes. **Bundle COR-1, COR-4, COR-5 under a single `FLUENCY_VERSION` bump** (`src/lib/grading/fluency/score.ts:11`) and one idempotent re-score (`scripts/backfill-fluency-metrics.ts` is the right pattern). Ship them with the NET-2 tests.

### COR-1 — WCPM should use speech-span duration, not total clip length
- **Impact:** high · **Effort:** small
- **Evidence (verified):** `compute-metrics.ts:51` computes `WCPM = correctWords*60 / whisper.duration`. A 6-7yo who hesitates before/after reading is understated ~40% and dropped into a low band — the headline number teachers and students see. `firstWord.start` / `lastWord.end` are already in `wordTimings`, unused.
- **Do:** Derive `spanSec = lastWord.end - firstWord.start` (sensibly floored) for the WCPM divisor; keep `whisper.duration` only for displaying total clip length.

### COR-2 — Dedup MCQ / true-false distractors against the correct answer
- **Impact:** high · **Effort:** small
- **Evidence (verified):** `validateMcqShape` in `src/lib/practice/generate.ts` never checks distractor uniqueness. When Claude reuses the correct word as a distractor, the child sees two identical correct tiles and tapping one is graded **wrong** — the worst failure for a confidence-building reader app.
- **Do:** Normalize (case/whitespace) and reject/repair any distractor equal to the answer or another distractor; drop questions left with <3 distinct distractors. Apply to `validateTrueFalseShape` and the sentence-builder token check too.

### COR-3 — Constrain count/position-sensitive `true_false` items at the prompt
- **Impact:** medium · **Effort:** small
- **Evidence:** the MCQ/true-false design assumes "the picture disambiguates the answer," but the image is generated asynchronously by Gemini and never verified — Gemini routinely miscounts, so "There are three dolls → true" is only correct if it drew exactly three.
- **Do:** Don't generate count/position-sensitive items (or constrain them to deterministic phonics/vocab). _All three critics rejected the heavier "Gemini vision-verifier + approval queue" idea — see DEF-2._

### COR-4 — Make the composite score deterministic (the cheap half)
- **Impact:** medium · **Effort:** small (this half)
- **Evidence (verified):** the whole fluency score + bands go **null** whenever a story's free-text varchar `readingLevel` has no parseable 1-5 digit, undermining the longitudinal tracking that is the feature's reason to exist.
- **Do:** At the call site in `analyze-recording.ts`, when `readingLevel` is unparseable, fall back to the class level (or default 2) instead of skipping the pipeline. _Groundedness critic note: fix this at the call site, not in `benchmarks.ts` — `classifyWcpm` already has `nearestLevelKey` fallback logic._
- **Deferred half:** detecting self-corrections deterministically from the Whisper sequence (so the +10 bonus doesn't depend on a Claude call) is genuinely hard for ESL disfluency and only moves a +10-capped bonus — low priority.

### COR-5 — Hallucination guard is one-directional
- **Impact:** medium · **Effort:** small
- **Evidence:** the alignment hallucination guard catches inserted text but Whisper *loops* (repeated words) inflate WPM and sail through.
- **Do:** Add a repeated-token/loop check in `align.ts` so inflated WPM from transcription loops is caught.

### COR-6 (low priority) — Band threshold contradiction
- **Impact:** low · **Effort:** small · _**critics disagree — your call**_
- **Evidence (verified):** at levels 1-2, `ESL_WCPM_OFFSET=25` makes `concernThreshold = max(0, 15-25) = 0`, so a 5-WCPM child is labeled "developing," not "concern" — the code contradicts its own comment.
- **Groundedness lens:** real contradiction, fix it. **Product lens:** for a 6-7yo emergent reader "concern" is the *expected* state, so flagging every beginner as "concern" is noise the teacher already knows — this is a tuning opinion, not a bug.
- **Do:** Resolve the code/comment contradiction, but treat the band tuning as a config decision, not a `FLUENCY_VERSION`-worthy correctness fix.

---

## Tier 2 — Safety net (the precondition that keeps Tier 1 fixed)

### NET-1 — Stop the error logger from shredding diagnostics (**do this first**)
- **Impact:** medium (force-multiplier) · **Effort:** small
- **Evidence (verified):** `logger.ts` `sanitizeError` collapses any message containing `/`, `connection`, `SQL`, or `query` to a generic string **before** the dev/prod branch — so virtually every real error (paths and Postgres text always contain `/`) logs as `"File system error occurred"`, in dev *and* prod. This is why every reliability bug here is invisible by design.
- **Do:** Redact only when `NODE_ENV === 'production'`, and only specific secret-bearing patterns (DATABASE_URL value, R2/API keys) — never blanket substrings. Preserve `Error.name` and stack.

### NET-2 — Tiny Vitest suite over the deterministic math + non-blocking typecheck
- **Impact:** high · **Effort:** medium
- **Evidence (verified):** the product's core correctness claim (fluency scoring, Wagner-Fischer alignment, content validators, the stars/XP economy) is 100% untested pure code; `next.config.mjs` mutes **78 real `tsc` errors**; ESLint is near-disabled.
- **Do:** Install Vitest (zero-config with the existing tsconfig). ~30 assertions over: `computeFluencyScore` (90-cap, +10 self-correction cap, weights-sum), `classifyWcpm` band boundaries incl. ESL-adjusted, `scoreProsody` thresholds, `computeMetrics` pause math, `align.ts` (match/sub/del/ins + hallucination + view arrays), the `validatePages`/`validateQuestions` fixtures, and `award.ts` streak/day-boundary + `loginWithToken` reject conditions. Add `"typecheck": "tsc --noEmit"` and run both in one GitHub Action (`continue-on-error` initially) or a pre-push hook. Rename the live-LLM `test:*` harnesses to `harness:*`. **Ship alongside the Tier-1 fixes so they land with regression tests.**
- **TS errors:** triage the **~12 genuinely-real bugs first** (the `TS2367` no-overlap comparisons are dead branches; plus undefined-accesses in `recordings/route.ts:248` and the syllabus import, and the broken type predicate in `story.ts:71`). Do **not** hard-flip `ignoreBuildErrors:false` yet — on a solo project with no CI that risks blocking every deploy on the 42 cosmetic `TS2322`s.

### NET-3 — Make `awardXp` atomic
- **Impact:** medium · **Effort:** small · _(critic-promoted from a theme aside)_
- **Evidence (verified):** `src/lib/gamification/award.ts` does a read (`:74`) → JS-computed totals → update (`:135`). Two concurrent XP events (your recording-submit dual-fires stars) both read the same starting total, last write wins — silently dropping XP/stars and corrupting streak math.
- **Do:** Single atomic SQL `UPDATE ... SET total = total + :delta` (and the stars equivalent) instead of read-modify-write.

---

## Tier 3 — Submit-homework reliability (the #1 real-world lever for this school)

### REL-1 — Record → IndexedDB → background retry → presigned PUT
- **Impact:** high · **Effort:** medium
- **Evidence (verified):** the most-traveled kid flow ignores CLAUDE.md's presigned guidance — one `fetch`, no retry, a **fake progress bar** (`setInterval` "Simulate upload progress"), and the whole WebM buffered through the Node heap. On flaky Taiwan classroom wifi a child loses their recording and gives up — directly suppressing completion. Also an OOM risk under class-wide submission spikes.
- **Do:** In `audio-recorder.tsx` / `page-recording-panel.tsx`: **persist the blob to IndexedDB the instant recording stops** ("saved on this device"), request a presigned URL, PUT directly to R2 with exponential-backoff retry (3 attempts) + a client idempotency token, then POST only the key + metadata; the grading task streams the buffer from R2 (`loadContextFromR2` already does this). Show *real* progress. _Product critic: the IndexedDB-first persistence is the spine here, not a sub-bullet — the network should never block the child from feeling done._ Harden `presigned-url`'s `type`/`filename` validation (force student uploads to `type='recording'`, sanitize the filename) as part of this.

### REL-2 — `maxDuration`, double-submit 409, and a stuck-recording recovery surface
- **Impact:** medium · **Effort:** small–medium
- **Evidence (verified):** neither `recordings/upload/route.ts` nor the passage page-record route sets `export const maxDuration = 60` despite firing Whisper+Claude in a post-response task (violates CLAUDE.md). Double-tapping submit computes the same `attempt_number` → unique-violation that 500s and orphans the first R2 object. No `analysis_failed` status exists, so an uploaded-but-never-graded recording is only found via a parent complaint.
- **Do:** Add `maxDuration = 60` to both routes. Insert the DB row first to claim the attempt number, catch the unique-violation as a clean **409** (the reading-answer route already models this). Add a queryable `analysis_failed` status column + a tiny teacher-visible "these N recordings failed to grade — retry" list and an idempotent re-drive sweep script. _(critic-merged: the stuck-recording dashboard was a missing item.)_

---

## Tier 4 — Raise the ceiling (product bets)

### PRD-1 — Bilingual + read-aloud student UI (merge with a kid-first dashboard redesign)
- **Impact:** high · **Effort:** large
- **Evidence (verified):** the target user is a 6-7yo Mandarin-L1 child, yet nav/instructions/banners/errors are English-only (`zh-Hant` grep → 10 hits, all data-driven feedback). The dashboard crams six 10px tabs under tiny icons at every width and buries a child's own recordings behind a default-closed English collapsible.
- **Do:** Add a bilingual string map (no full i18n framework) under the load-bearing strings (tab labels, the pending-assignment banner, Listen/Record/Submit, success/error states) + a speaker icon playing cached TTS (infra exists — reuse the spelling section's bilingual+audio pattern). Simultaneously simplify the IA: large picture-labeled buttons, the current/next assignment as the single dominant CTA, 3-4 tabs, recent recording's play button surfaced. _(critics: do these as one surface, not two tracks.)_ This is the actual product ceiling — without it, homework-at-home depends on an adult reading every screen.

### PRD-2 — Assignment reminder / parent-digest notification channel
- **Impact:** high · **Effort:** medium–large · _(critic-found; entirely absent)_
- **Evidence (verified):** no email/push/web-push integration anywhere (no nodemailer/resend/sendgrid/fcm). A child only discovers pending homework *after* choosing to log in.
- **Do:** Even a weekly teacher-triggered **parent digest in zh-Hant** (the weekly-recap data already exists) closes the loop. Likely the single biggest lever on the core metric (completion rate).

### PRD-3 — Teacher review / triage queue
- **Impact:** medium · **Effort:** medium · _(critic-found)_
- **Evidence:** the app is almost entirely student-side; the teacher is the daily power user reviewing every submission, with no batch-review, no "needs attention" triage, no keyboard flow.
- **Do:** A triage surface that routes flagged readers (e.g. the concern-band kids) to the teacher. Pairs with COR-6 — fixing band thresholds only helps if something surfaces the flagged readers.

---

## Strategic (decide before the multi-tenant fork)

### STR-1 — Frame the authorization work as the multi-tenancy precondition
- **Evidence:** `fork-plan.html` and `multi-tenant-plan.html` are in the working tree (per-school subdomains, platform-admin vs school-admin split).
- **Why it matters:** in a multi-tenant world every role-only-gated route (SEC-3) becomes a **cross-school** breach, the unauthenticated debug/proxy endpoints leak across schools, and there's no platform-vs-school admin boundary in the single `users` table. **Do Tier 0 before the fork**, and design in tenant-scoped query helpers, a platform-admin role, and per-school R2 key prefixes.

### STR-2 — Consolidate the curriculum sources of truth
- **Impact:** high · **Effort:** medium
- **Evidence (verified):** `knowledge-base.json` (units 1-5) feeds the Sunny helper while the per-unit FAF1 JSON (units 0-15) feeds the practice generator — so **Sunny teaches vocabulary that contradicts the quizzes.** _(Groundedness note: requesting unit 10 returns all of knowledge-base's units 1-5, not "unit-5 content" — the real defect is the divergent, capped-at-5 vocab set.)_
- **Do:** Make the per-unit `unit-{N}.json` the single source; delete `knowledge-base.json`; add a loader in `context.ts` (reuse `generate.ts`'s `loadUnitJson`). Then collapse the parallel unit catalog (keep `units.ts` only for the emoji map; have the teacher UI read topics from the same `getBookUnits`/available-units source the API uses; delete the redundant `PRACTICE_UNIT_NUMBERS` set).

---

## Deferred / rejected (critics judged premature or over-built at single-school scale)

### DEF-1 — CDN in front of R2 proxy traffic
Real cost lever *at scale*, but for one small ESL school egress isn't a budget threat this year and `ENABLE_AI_GRADING` already guards the expensive call. The only part worth doing now: honor `Range` requests on the audio/media proxy (or drop the misleading `Accept-Ranges` header) so scrubbing a recording stops re-downloading the whole file. Revisit the CDN behind the multi-tenant growth trigger.

### DEF-2 — Gemini vision-verifier + teacher approval queue for picture/answer matching
Weeks of solo-dev work for a generated-content edge case. The cheap 90% (COR-2 dedup + COR-3 prompt constraint) covers most of the harm. Revisit only if mis-counts actually surface in practice.

### Also raised, worth a line
- **No per-student/per-day AI spend cap** — `ENABLE_AI_GRADING` is binary; a retry storm (which REL-1 makes easier) could run unbounded Whisper/Claude/Gemini spend with no circuit breaker. Consider a simple per-day quota.
- **No `prefers-reduced-motion` path** — 0 hits in a confetti-and-avatar app for young children; thin `aria-label` coverage (~35 files).
- **Session/token lifecycle** — 7-day opaque cookies, no rotation/revocation/device-list; `loginWithToken` accepts any `users.login_token` ≥16 chars with no expiry or single-use (magic links never expire and can't be revoked).
- **No pagination on two hot endpoints** — teacher submissions and the student dashboard ship the entire growing recording history including heavy `analysisJson`/`wordTimings`/full story text the consumers never render; drop those columns from list queries + add a limit/cursor.

---

## Suggested first branch

Tier 0 (SEC-1…6) + Tier 1 (COR-1…5) + NET-1 (logger) + NET-2 (the Vitest tests that lock the Tier-1 fixes). All small/verified, and it protects both the school's data and a child's grade in one focused PR. Tier 3 (recording reliability) is the natural second branch; the Tier 4 product bets and STR-2 follow.
