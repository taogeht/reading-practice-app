# Data Flow and Main Execution Paths

Last verified: 2026-08-15

This document traces the major state changes through pages, APIs, services,
PostgreSQL, and external providers. Authorization details are in [auth.md](auth.md).

## Common request path

Most interactive features follow this shape:

```text
Page/server layout
  -> client component fetch
  -> src/app/api/**/route.ts
  -> getCurrentUser()
  -> role + resource/capability check
  -> Zod/manual input validation
  -> Drizzle query or src/lib service
  -> PostgreSQL and/or external provider
  -> JSON response
  -> component local-state update/refetch
```

Because there is no shared client query cache, each page owns its loading,
mutation, invalidation, and error behavior.

## Teacher/admin credential login

```text
/login
  -> POST /api/auth/login
  -> authenticateUser(email, password)
  -> users lookup + bcrypt verification
  -> createSession(user.id)
  -> session row
  -> httpOnly session-id cookie
  -> role dashboard
```

Subsequent server layouts and API routes resolve the cookie with
`getCurrentUser()`, which joins the active session to an active user.

## Student login

### Native QR and visual login

```text
Starling Rise QR scan or /s/<token> app link
  -> POST /api/mobile/v1/auth/qr
  -> shared student-token validation + durable throttling
  -> 15-minute session access token
  -> hashed rotating refresh row (180-day inactivity window)
  -> Expo SecureStore
  -> authenticated requests use Authorization: Bearer
```

Class-code login calls `/api/mobile/v1/classes/resolve/<code>`, follows the same
promotion lineage as the web `/c/<code>` route, loads the restricted public
roster, and posts the chosen visual password to `/api/mobile/v1/auth/visual`.

On an authenticated `401`, the native client single-flights
`POST /api/mobile/v1/auth/refresh`, saves the rotated pair, and retries once.
Failure clears the device session and returns the learner to sign-in.

### Visual password

```text
/student-login/[classId]
  -> public class roster lookup
  -> student selection + visual password
  -> POST /api/auth/student-login
  -> class/enrollment/user validation
  -> compare students.visualPasswordData
  -> create one-day session
  -> session-id cookie
  -> /student/dashboard
```

Rate limiting uses durable PostgreSQL buckets keyed by selected student and IP.

### Magic link and class short link

- `GET /s/[token]` resolves `users.loginToken`, creates a student session, and
  redirects to the dashboard.
- `GET /c/[shortCode]` resolves a class slug first and a legacy UUID prefix second,
  then redirects to the class-specific login screen.

## Teacher class workspace

The teacher class-detail UI aggregates independent data sets rather than loading a
single domain projection. Depending on the visible section it fetches class info,
students, assignments, attendance, schedules, spelling, books, syllabus, progress,
recaps, gradebook, media, practice units, activity, shop settings, and co-teachers.

Writes generally go directly from a component to the corresponding API group and
then to one or more schema tables. There is no aggregate `Class` service enforcing
all class invariants centrally.

The teacher dashboard route also acts as lazy setup: its GET path can create a
missing teacher row, default school, and membership. Treat it as a mutating read
when changing onboarding behavior.

## Legacy story assignment and recording

### Assignment creation

```text
teacher assignment UI
  -> POST /api/assignments
  -> teacher/admin authentication
  -> userCanManageClass(classId)
  -> story/class validation
  -> assignments insert
  -> published assignment appears on student dashboard
```

The student dashboard endpoint joins enrollments, active/published assignments,
stories, and prior recordings, then derives display statuses and attempt counts.

### Audio submission

```text
/student/assignments/[id]
  -> assignment detail + story TTS
  -> AudioRecorder / browser MediaRecorder
  -> multipart POST /api/recordings/upload
  -> session, enrollment, publication, attempt checks
  -> audio buffered by Next route
  -> r2Client.uploadFile()
  -> recordings insert with status=submitted
  -> awardXp() -> XP event/progression + stars
  -> optional background grading
```

There is a second legacy `POST /api/recordings` path that accepts a supplied audio
URL and inserts a different initial status. Before changing recording creation,
trace both callers and decide whether the change applies to both paths.

### Native assigned-story reading

```text
Read tab
  -> GET /api/mobile/v1/assignments with bearer session
  -> active enrolled classes + published assignments
  -> shared mobile status derivation from the learner's recordings
  -> /assignments/[assignmentId]
  -> GET /api/mobile/v1/assignments/[assignmentId]
  -> learner-safe story text, instructions, and narration proxy URLs
  -> authenticated audio download with one refresh retry
  -> private Expo cache
  -> expo-audio local playback
```

The native list and detail routes derive the learner identity from the session and
require an active-class enrollment. Storage keys are not part of the mobile
contract. Logout or session expiry clears both cached audio and TanStack Query
state so one learner's device data cannot appear in another learner's session.

### AI grading

[`analyzeRecordingFromBuffer()`](../src/lib/grading/analyze-recording.ts) performs:

1. Whisper transcription with word timestamps.
2. Token normalization and Wagner-Fischer alignment against the expected text.
3. Accuracy, errors, duration, WPM/WCPM, pauses, reading band, and prosody metrics.
4. Composite deterministic fluency scoring.
5. Optional Claude bilingual qualitative analysis.
6. Persistence back to `recordings` or `passagePageRecordings`.

The Claude stage is allowed to fail while deterministic grading survives.

### Review

Teacher submission pages fetch recordings and related student/story/class data.
Review PATCH operations update status, feedback, and scores. Teacher audio replies
are uploaded to R2 and referenced from the recording. Student attempt cards render
the resulting feedback and permitted analysis.

## Generated reading passage lifecycle

### Generation

```text
teacher reading generator
  -> POST /api/teacher/reading/generate
  -> getCurrentUser() + teacherCan(canGenerateReadingContent)
  -> validate level, overrides, vocabulary, count
  -> readingGenerationJobs insert
  -> runJob() via queueMicrotask
      -> generatePassagePlan()
      -> generateValidatedProse()
      -> generateQuestions() + validateQuestions()
      -> generatePassageImages()
      -> R2 uploads
      -> one DB transaction:
           readingPassages
           storyPages
           readingQuestions
      -> job progress/status update
```

`generatePassage()` in `src/lib/reading/generate/passage.ts` is the central service.
Content without required images remains draft; completed content moves to review.
Teacher review routes can edit, regenerate, approve/publish, or reject passages.

The generation job is not durable. If the process exits after the API response,
the job can remain incomplete. R2 uploads that precede a failed DB transaction can
remain orphaned.

### Student session

```text
/student/reading
  -> GET published passages at student's level
  -> open /student/reading/[passageId]
  -> fetch passage + start/resume studentReadingSession
  -> PATCH page progress
  -> POST answers (server grades; answer key stays server-side)
  -> optional per-page audio recording
  -> complete session idempotently
  -> calculate result/time
  -> award first-completion/perfect-score rewards
  -> recompute vocabulary mastery
```

`studentReadingAnswers` records the accepted answer and correctness. Page audio is
stored in `passagePageRecordings`, not legacy `recordings`, although both use the
same grading service.

## Curriculum practice

```text
curriculum JSON + books.ts registry
  -> teacher-generated practiceQuestions
  -> classPracticeUnits enables book/unit
  -> GET /api/practice/session
      -> overdue + unseen + wildcard selection
      -> answer keys removed from response
  -> student submits POST /api/practice/attempt
      -> server grades
      -> practiceAttempts insert/update SRS state
      -> awardXp() and stars
```

Book slugs and available units are defined under `src/lib/practice` and backed by
structured content under `src/lib/curriculum`. A registry entry is not sufficient
by itself; image/audio assets and curriculum data must also exist.

## Printable test generation

```text
teacher selects curriculum/book/units
  -> POST /api/tests
  -> generateTest()
  -> Claude creates a validated TestDocument
  -> generatedTests JSON document insert
  -> background image/TTS enrichment updates document
  -> GET /api/tests/[id]/pdf
  -> renderTestHtml()
  -> Puppeteer/Chromium PDF
```

The JSON document is the main test artifact. Item image/audio regeneration patches
that document and corresponding R2 assets.

## Spelling

```text
teacher spelling UI
  -> class-scoped spellingLists + spellingWords
  -> optional import/copy
  -> TTS and image generation
  -> R2 URLs stored on words
  -> student active-list endpoint
  -> next-word SRS endpoint
  -> result submission
  -> spellingGameResults + rewards
```

Teacher list reads may deduplicate copied lists by title and word content. Some
routes still check the primary `teacherId` directly, so co-teacher behavior is not
uniform.

## Gamification

### XP

`awardXp()` starts a database transaction, locks/creates the student's progression
row, appends an XP event, updates total XP, levels and streak data, writes unlocks,
and triggers the corresponding star award.

### Stars

`awardStars()` writes `starTransactions` and then updates balances on
`studentProgression`. These operations are not currently in one shared transaction,
so a partial failure can make the ledger and wallet disagree.

Teacher grants also have their own grant audit table. Check both grant history and
progression state when repairing reward data.

### Shop and avatars

`purchaseItem()` transactionally validates availability and balance, records the
purchase/spend, and adds inventory. The shop UI is currently hidden, but APIs and
inventory remain present.

Avatar creation/reroll updates relational state. Canvas saves persist positioned
items, then launch a Sharp snapshot rebuild. Read-only UI generally displays the
flattened R2 snapshot rather than reconstructing the canvas.

## Attendance, syllabus, recaps, gradebook, and media

- Attendance combines recurring `classSchedules` with dated `attendanceRecords`.
- Syllabus uploads parse XLSX into `classSyllabusWeeks` and assignments; class
  progress tracks delivery/completion against books and units.
- Weekly recaps store a class-level recap plus per-student behavior/homework data.
- Gradebook tests/scores represent offline assessments and are separate from
  AI-generated printable tests.
- Student media uses presigned upload or server upload flows, stores metadata in
  `studentMedia`, and requires owner/admin/managing-teacher access when served.

## R2 object flow

```text
file bytes
  -> upload validation
  -> key generated by r2Client/domain helper
  -> private R2 object
  -> proxy URL or key stored in PostgreSQL
  -> authenticated /api/audio, /api/images, or /api/media request
  -> resource-level access check
  -> R2 object streamed to browser
```

Large files should use the existing presigned URL path. The current assignment
recording upload is an exception and buffers the complete file in the route.

## Failure and consistency boundaries

- Database transactions do not include R2 or external AI calls.
- Background tasks are not durable or retried by a queue.
- Several completion/reward endpoints implement idempotency; preserve their
  uniqueness and first-completion checks.
- Attempt-limit reads followed by inserts can race unless backed by an appropriate
  unique constraint and conflict handling.
- Stable immutable media URLs require versioned keys when regenerating content.
- The reset-student-data operation covers legacy tables but does not appear to
  clear every newer reading, practice, recording, XP, star, and avatar table.
