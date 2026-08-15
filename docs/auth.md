# Authentication and Authorization

Last verified: 2026-08-15

Authentication is custom opaque-session authentication implemented with
PostgreSQL, HTTP-only cookies or native bearer access tokens, rotating native
refresh tokens, and bcrypt. It is not Better Auth, despite legacy environment
variable names and older documentation.

## Core modules

- [`src/lib/auth.ts`](../src/lib/auth.ts) — credentials, token login, session
  lifecycle, and `getCurrentUser()`
- [`src/lib/auth/class-access.ts`](../src/lib/auth/class-access.ts) — class and
  related-resource authorization
- [`src/lib/auth/teacher-capabilities.ts`](../src/lib/auth/teacher-capabilities.ts)
  — feature-level teacher permissions
- [`src/lib/auth/reading-content.ts`](../src/lib/auth/reading-content.ts) — reading
  content access
- [`src/components/providers/auth-provider.tsx`](../src/components/providers/auth-provider.tsx)
  — client user state and redirect behavior
- [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) — `users`, role detail tables,
  memberships, enrollments, co-teachers, `session`, and mobile refresh sessions
- [`src/lib/auth/mobile-session.ts`](../src/lib/auth/mobile-session.ts) — native
  credential lifecycle
- [`src/lib/auth/student-login.ts`](../src/lib/auth/student-login.ts) — shared QR
  and visual-password verification

## Identity model

All identities live in `users` with one of three roles:

- `admin`
- `teacher`
- `student`

Teachers and students have corresponding detail rows. School relationships are
represented by `schoolMemberships`; class relationships use `classEnrollments` for
students and `classTeachers` for co-teachers. Classes also retain a primary
`teacherId`.

Most user-facing entities have an `active` flag that acts as a soft deletion or
access switch.

## Session model

`createSession(userId)` generates a cryptographically random opaque identifier and
inserts it into the `session` table. The identifier is stored in an HTTP-only
`session-id` cookie.

`getCurrentSession()` is the canonical credential resolver. It tries the existing
cookie first, then `Authorization: Bearer <opaque-access-token>`. Both credentials
resolve through the same `session` table and active-user check. `getCurrentUser()`
returns only the user from that result.

For either credential, the resolver:

1. Reads the opaque credential.
2. Finds the unexpired session.
3. Joins to the user.
4. Rejects missing, expired, or inactive identities.
5. Returns the session identity and current user record.

Teacher/admin credential sessions last seven days. The student visual-login route
uses a one-day session. Logout deletes the session and expires the cookie.

Do not read or trust the cookie directly in feature code. Always resolve it through
`getCurrentUser()`.

### Native refresh sessions

Native access tokens are random 15-minute `session` rows. A device also receives
a random refresh token; PostgreSQL stores only its SHA-256 hash in
`mobile_refresh_sessions`. Refresh rotates both credentials, revokes the previous
row, deletes its access session, and extends a rolling 180-day inactivity window.

The native client stores credentials in Expo SecureStore, performs only one
concurrent refresh, retries a failed authenticated request once, and clears local
credentials when rotation fails. Logout, learner deactivation, and QR
regeneration revoke continued access.

`auth_rate_limits` replaces the process-local visual-password limiter. Bucket keys
are hashed before storage so raw student IDs, IPs, and login tokens are not stored
as throttle identifiers.

## Teacher and administrator login

`POST /api/auth/login` accepts email and password, calls `authenticateUser()`,
creates a session, records login activity, sets the cookie, and returns the user.

Passwords are stored as bcrypt hashes. Administrators and teachers use the same
credential path and are separated by subsequent role checks.

Known issue: `authenticateUser()` verifies credentials without first checking the
user's `active` flag. It can therefore create a session for an inactive user that
`getCurrentUser()` immediately rejects. Fixes should reject inactive users before
session creation while preserving intentionally disabled-account behavior.

## Student authentication

### Visual passwords

Students enter through `/student-login/[classId]` and select themselves from an
active class roster. `POST /api/auth/student-login` verifies:

- The student, user, class, and enrollment exist and are active.
- The selected visual password type matches.
- The submitted visual password data matches the JSON stored on the student row.

The route then creates a one-day session and redirects to the student dashboard.

Visual passwords are stored as plaintext structured JSON and have a much smaller
keyspace than normal passwords. This flow therefore depends on rate limiting and
the limited privileges of student accounts.

The limiter is stored in PostgreSQL and coordinates application processes. It is
keyed separately by the selected student and source IP, with classroom-NAT-aware
limits.

### Class roster boundary

Class-login screens need unauthenticated access to a restricted active roster.
Some public endpoints therefore reveal student display identity and visual-password
type for a known class. Treat these as deliberate but sensitive public APIs:

- Do not add unrelated student fields.
- Continue filtering inactive users, classes, and enrollments.
- Avoid exposing the stored password data.
- Apply enumeration and rate-limit protections when extending them.

### Magic links

`GET /s/[token]` calls `loginWithToken()`, resolves `users.loginToken`, creates a
session, and redirects the student to the dashboard. Login tokens are bearer
credentials and must never be logged or exposed through general student APIs.

### Class short codes

`GET /c/[shortCode]` is a discovery redirect, not authentication. It resolves the
class and redirects to its student-login page. Current resolution supports the
class slug and a legacy UUID-prefix format.

## Page authorization

Page trees are protected in server layouts:

- `(admin)/layout.tsx` requires `admin`.
- `teacher/layout.tsx` requires `teacher` or `admin` and resolves capabilities for
  the navigation shell.
- `student/layout.tsx` requires `student`.

`AuthProvider` separately calls `/api/auth/me` in the browser and performs client
redirects. This improves UI behavior but is not a security boundary.

`src/middleware.ts` is pass-through and must not be relied on for authorization.
The server layout protects rendered pages, while every API route must independently
protect data and mutations.

## API authorization layers

Protected API handlers generally need all applicable layers:

1. Authentication — `getCurrentUser()` returned a user.
2. Role — the role may invoke this class of operation.
3. Resource relationship — the user owns, manages, or is enrolled in the target.
4. Capability — the teacher has the specific feature permission.
5. State — class, enrollment, assignment, passage, or user is active/published.

A role check alone is not sufficient for class/student resources.

## Class access

Use helpers from `src/lib/auth/class-access.ts`:

- `userCanManageClass(userId, classId)`
- `userCanAccessStudentMedia(userId, studentId)`
- `isCoTeacherOnly(userId, classId)`
- `userIsClassPrimary(userId, classId)`
- `accessibleClassIds(userId)`
- `userCanManageRecording(userId, recordingId)`
- `userCanManageAssignment(userId, assignmentId)`

These incorporate primary teacher, co-teacher, and administrator behavior. Avoid
new direct comparisons against `classes.teacherId` because they commonly exclude
co-teachers accidentally.

Known inconsistencies exist in teacher spelling-list GET/DELETE and assignment
detail routes, where some paths compare the primary teacher directly. When editing
nearby code, verify that list and detail endpoints grant the same access.

## Teacher capabilities

`teacherCan(userId, capability)` and `getTeacherCapabilities()` control features
such as:

- Managing spelling lists
- Managing assignments
- Generating reading content
- Generating practice questions
- Using the Sunny preview/helper

Administrators are treated as having every teacher capability in the teacher
layout. APIs must preserve the corresponding administrator bypass explicitly.

Capabilities complement class access; they do not replace it. For example, a
teacher may be allowed to manage assignments generally but still must manage the
specific target class.

## Student resource access

Student APIs should derive the student row from the authenticated user rather than
accepting an arbitrary student ID. Where an ID is required, verify it belongs to
the current user.

Class content should additionally verify active enrollment. Assignment access must
verify the assignment is published to an enrolled class. Generated passage access
must verify published visibility and the allowed reading level rules.

Server-side question grading must not include correct answers in student session
responses.

## Media authorization

R2 objects are private. Proxy handlers under `/api/audio`, `/api/images`, and
`/api/media` authenticate requests before retrieving objects.

The current policy distinguishes:

- Shared learning assets, such as lesson images and TTS, available to authenticated
  users.
- Student-sensitive audio/media, available only to the student owner,
  administrators, or a teacher who manages the student's class.

Prefer resolving the database record and using class-access helpers rather than
granting access solely from a user-controlled key string.

## Audit and login activity

Administrative and important mutation flows may write `auditLogs`. Student login
and heartbeat/activity data are tracked separately. Audit writes should avoid
secrets, password data, session IDs, login tokens, raw audio, or sensitive provider
responses.

## Security checklist for changes

Before completing a protected feature:

1. Identify whether it is public, authenticated, role-restricted, class-scoped, or
   student-owned.
2. Add server-side authentication to every new API method.
3. Use the central class/resource helper or add one if the rule is reused.
4. Apply teacher capabilities in addition to class access where required.
5. Verify inactive users, classes, enrollments, and unpublished content are
   rejected.
6. Do not rely on hidden UI, client redirects, request-supplied IDs, or middleware.
7. Verify both primary-teacher and co-teacher behavior.
8. Avoid returning answer keys, visual password data, tokens, storage credentials,
   or private bucket URLs.
9. Exercise unauthenticated, wrong-role, wrong-class, inactive, and valid cases.

## Known risks

- Inactive credential login creates a session before later rejection.
- Visual passwords are plaintext low-entropy credentials.
- Public roster endpoints increase enumeration/privacy exposure.
- Authorization is repeated across many route handlers and has drifted in some
  co-teacher paths.
- The admin books page is outside the main admin server-layout boundary.
- Client and server guards duplicate redirect logic.
