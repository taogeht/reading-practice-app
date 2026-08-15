# Starling Rise Native iOS and Android Learner App Plan

**Status:** In progress — backend and native foundations implemented  
**Prepared:** 2026-08-15

## Implementation progress

Completed in the first milestone:

- Expo SDK 57 workspace, Starling Rise app identity, Expo Router navigation,
  EAS profiles, theme tokens, and the four-tab learner shell.
- SecureStore persistence, single-flight access-token refresh, QR/deep-link
  login, class-code resolution, roster selection, and visual-password login.
- Shared authentication and visual-password contracts under
  `packages/contracts`.
- Versioned mobile authentication endpoints, cookie-or-bearer session
  resolution, rotating hashed refresh credentials, durable authentication
  throttling, and promotion-aware class-code resolution.
- Migration `0057_mobile_auth_foundation.sql`; it must be applied before the new
  authentication code is deployed.

Still to implement:

- Mobile dashboard projections and the two complete reading flows.
- Native recording, authenticated audio/image caching, and idempotent uploads.
- All five spelling games, progress/feedback, parental gate, privacy surfaces,
  app assets, associated-domain files, and store-release automation.

## Summary

Build a native Expo/React Native learner app on top of the existing Next.js
backend. The web application remains operational and continues serving teachers,
administrators, and browser-based learners.

The product name is **Starling Rise**, with the tagline **Every voice can rise.**
The name should guide the learner-facing identity across the native app and future
web-branding work: optimistic, energetic, and connected to both flight and student
progress.

The first release will support learners aged 6–11 on phones and tablets, require
internet access, preserve permanent QR/class links across promotions, and include
both reading systems plus all five spelling games.

## Architecture and Core Changes

- Add an npm workspace at `apps/mobile` using Expo SDK 57, Expo Router,
  TypeScript, TanStack Query, `expo-audio`, `expo-camera`, `expo-image`,
  `expo-file-system`, and `expo-secure-store`.
- Add `packages/contracts` for pure TypeScript/Zod contracts shared by the Next.js
  API and mobile client. Initially cover authentication, dashboard, assignments,
  passages, spelling, recordings, feedback, progress, and common errors.
- Keep the existing Next.js application at the repository root. Do not move or
  rewrite existing web pages.
- Use React Context plus a reducer only for authentication/device-session state.
  Keep server state in TanStack Query and ephemeral interaction state within
  screens.
- Use React Native `StyleSheet` and shared design tokens rather than introducing a
  second utility-CSS system.
- Configure the working identity as:
  - Product name: `Starling Rise`
  - Tagline: `Every voice can rise.`
  - URL scheme: `starlingrise`
  - iOS bundle ID: `com.starlingrise.student`
  - Android package: `com.starlingrise.student`
- Support portrait phones and adaptive portrait/landscape tablet layouts.

## Authentication, QR Links, and API Boundary

- Extend `src/lib/auth.ts` so protected APIs accept either the existing HTTP-only
  `session-id` cookie or `Authorization: Bearer <access-token>`. Web behavior
  remains unchanged.
- Update endpoints that directly inspect cookies, including heartbeat and logout,
  to use the centralized authentication path.
- Add versioned mobile endpoints under `/api/mobile/v1`:
  - `POST /auth/qr`
  - `POST /auth/visual`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`
  - `GET /classes/resolve/:code`
- Extract the existing QR, visual-password, active-user, and promotion-lineage
  rules into shared server-side services so web and mobile authentication cannot
  diverge.
- Continue using `users.loginToken` as the learner's durable journey-level QR
  identity:
  - `/s/<loginToken>` exchanges the permanent token for a mobile session.
  - `/c/<shortCode>` resolves through the existing promotion lineage to the
    current active class.
  - Archived classes remain historical records and old printed links continue
    reaching the promoted class.
  - Regenerating a learner token is an explicit security action that invalidates
    the old QR and revokes that learner's mobile sessions.
- Add a hashed mobile refresh-session table containing user, token hash,
  platform/device label, creation time, last use, inactivity expiry, and
  revocation time. Never store refresh tokens in plaintext.
- Issue 15-minute access tokens and rotating refresh tokens with a rolling 180-day
  inactivity expiry. Store both using SecureStore; refresh once on a `401`, retry
  the request once, and sign out if refresh fails.
- Revoke sessions on logout, learner deactivation, QR-token regeneration, or an
  administrator security action.
- Replace process-local login throttling for public mobile authentication with
  durable database-backed throttling by learner, token, and IP.
- Configure iOS universal links and Android app links for `/s/*` and `/c/*`, while
  preserving browser fallback when the app is absent.
- Add an in-app QR scanner that accepts only recognized links from the configured
  production host. Request camera permission only when the learner opens the
  scanner.
- Retain class-code, learner selection, and visual-password login as the fallback
  when a QR is unavailable.

## Native Learner Experience

Use four primary tabs:

- **Home:** next assignments, recent teacher feedback, XP/progress, and test-score
  summary.
- **Read:** assigned story work and generated reading passages.
- **Spelling:** active word lists and all five existing modes—Snowman, Listen &
  Spell, Unscramble, Missing Letters, and Flashcards.
- **Progress:** past recordings, teacher feedback/audio, completed work, and basic
  progress history.

Implement native detail flows for:

- Assigned-story playback, recording, review, upload, and submission.
- Generated-passage library, reader, comprehension questions, session progress,
  completion, and per-page recording.
- Recording history and teacher feedback.
- Spelling-list selection and each existing game mode.

Preserve English and Traditional Chinese learner copy and tap-to-hear behavior
from `src/lib/i18n/ui-strings.ts`. Native screens must provide VoiceOver/TalkBack
labels, reduced-motion behavior, guarded dynamic type, and at least 44-point
iOS/48-dp Android touch targets.

Do not include teacher/admin tools, account creation, curriculum/phonics modules,
weekly recaps, media gallery, homework helper, avatars/shop, OUP links, push
notifications, advertising, tracking, or offline coursework in v1.

## Audio, Recording, and Data Flow

- Build one typed mobile API client responsible for environment URLs, bearer
  headers, contract validation, refresh synchronization, and consistent error
  mapping.
- Pass authorization headers to protected images through `expo-image`.
- Download protected audio through authenticated requests into a private
  application cache, then play it with `expo-audio`. Clear private cached media on
  logout.
- Record speech as M4A/AAC with learner-appropriate quality settings. Update
  existing upload validation to accept the native MIME types and extensions while
  continuing to enforce server-side size, duration, and ownership checks.
- Preserve an unacknowledged recording locally until upload succeeds, including
  across an app restart, but do not provide general offline access.
- Make recording uploads idempotent using a client-generated operation ID and a
  server-side uniqueness check so retries cannot create duplicate attempts or
  rewards.
- Treat transient connectivity as a recoverable state: show a simple retry screen,
  preserve the learner's current work, and resume safe requests when connectivity
  returns.
- Ensure mobile-facing dashboard contracts omit browser-only or sensitive fields,
  including any OUP credentials.

## Privacy, Distribution, and Operations

- Publish publicly through the Apple App Store and Google Play, positioned in
  Apple's Kids 6–8 band with Education as the secondary category.
- Request only camera and microphone permissions, with child-friendly
  explanations immediately before use.
- Include native Privacy, Help, and About screens. Put external support actions,
  logout/device switching, and future external links behind a reusable parental
  gate.
- Provide no ads, third-party behavioral analytics, location, contacts, or push-
  notification collection.
- Publish a privacy policy and complete Apple privacy labels and Google Data
  Safety disclosures for authentication identifiers, recordings, camera use, and
  microphone use.
- Since accounts are school-provisioned rather than created in the app, expose a
  parent/school deletion-request route and document the administrative deletion
  process.
- Follow Apple's requirements that Kids apps protect children's data and that
  apps provide substantive native functionality rather than being repackaged
  websites. See the [App Review Guidelines][apple-review] and
  [App Store categories][apple-categories].
- Validate Google Play Families compliance for microphone, camera,
  authentication, and other sensitive child data using the
  [Families Policy guidance][google-families].
- Add EAS development, preview, and production profiles with separate API origins
  and update channels. No secrets may be placed in `EXPO_PUBLIC_*` variables.
- Send `X-App-Version` with mobile requests and provide a small mobile
  configuration endpoint for minimum supported version and maintenance messaging.
- Use staging API/database/storage environments, TestFlight, and Play internal
  testing before a phased public release.
- Use server-side operational logs and platform-native crash reports without
  logging QR tokens, access tokens, refresh tokens, visual passwords, or voice
  content.

## Delivery Sequence

1. **Backend foundation:** shared contracts, centralized cookie/bearer
   authentication, rotating mobile sessions, durable throttling, versioned
   endpoints, deep-link resolution, and integration tests.
2. **Native foundation:** Expo workspace, navigation, themes, bilingual UI, secure
   session lifecycle, QR/class login, API client, and authenticated media
   primitives.
3. **Core learning:** dashboard, both reading systems, recording workflows, all
   spelling modes, progress, and teacher feedback.
4. **Hardening and release:** accessibility, phone/tablet adaptation, failure
   recovery, privacy surfaces, physical-device testing, store metadata, internal
   pilots, and phased rollout.

## Test and Acceptance Plan

- Backend integration tests using an isolated PostgreSQL database:
  - Cookie authentication remains compatible with the web application.
  - QR, class-code, and visual-password authentication reject inactive or
    unauthorized learners.
  - Old class links resolve to the current promoted class.
  - Access-token expiry, refresh rotation, replay rejection, inactivity expiry,
    logout, deactivation, and QR regeneration behave correctly.
  - Learners cannot access another learner's recordings, feedback, passages, or
    progress.
  - Recording retries are idempotent.
- Contract tests ensure actual Next.js responses match `packages/contracts`.
- Mobile unit/component tests cover authentication transitions, single-flight
  refresh, link parsing, permission denial, API errors, bilingual rendering, and
  core game behavior.
- iOS and Android E2E tests cover:
  - Cold-start QR login and browser fallback.
  - Class-code/visual-password fallback.
  - Assigned-story recording and submission.
  - Generated-passage comprehension and recording.
  - All five spelling games.
  - Feedback playback, progress, logout, expired sessions, and failed-upload
    recovery.
- Physical-device coverage includes small and large iPhones, iPad portrait/
  landscape, Android phones and tablets, silent mode, headphones, audio
  interruption, background/foreground transitions, and camera/microphone denial.
- Run the existing web type checker, linter, tests, and production build throughout
  implementation; mobile additions must not regress existing web behavior.

## Assumptions

- Every learner session normally has internet access; general offline content
  synchronization is out of scope.
- Devices are primarily personal family devices, so sessions persist until
  logout, revocation, or 180 days of inactivity.
- Existing web QR codes must remain valid without reprinting and must open either
  the installed app or the current web experience.
- Both current reading systems and all five spelling modes are required for v1.
- Bundle/package identifiers are provisional until availability and signing
  ownership are confirmed.
- No existing application behavior is removed as part of the mobile release.

[apple-review]: https://developer.apple.com/app-store/review/guidelines/
[apple-categories]: https://developer.apple.com/app-store/categories/
[google-families]: https://support.google.com/googleplay/android-developer/answer/17122218
