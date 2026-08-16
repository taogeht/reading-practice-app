# Starling Rise Device Validation

Last verified: 2026-08-16

This checklist validates the native foundation before core learning features are
added. Use a dedicated test learner. Never paste a real learner's QR token into
issue trackers, build logs, chat, or committed files.

## Current acceptance boundary

The current native build should support:

- welcome and bilingual sign-in UI;
- camera permission and in-app QR scanning;
- permanent student-link login;
- current or historical class-code resolution;
- roster selection and visual-password login;
- persisted SecureStore sessions, access-token refresh, and logout; and
- a learner-safe Home dashboard projection with assignment, XP, streak, and
  spelling counts; and
- assigned-story discovery, story details, and privately cached authenticated
  narration playback;
- assigned-story microphone recording, local review, restart-safe pending audio,
  idempotent submission to private R2, and teacher-review visibility; and
- navigation between Home, Read, Spelling, and Progress.

Spelling intentionally shows a foundation empty state. Progress shows its
foundation empty state plus the confirmed device logout action. Assigned-story
Generated passages, spelling games, and feedback are the next delivery milestone.
HTTPS links will not automatically open the installed app until the website
association files are implemented and deployed.

## Automated checks

From the repository root:

```bash
npm run lint
npm run build
npm run typecheck --workspace @starling-rise/mobile
npm run test:mobile
npm run test:mobile-contracts
npm run test:class-promotion
```

Validate native bundling from `apps/mobile`:

```bash
npx expo export --platform ios --output-dir /tmp/starling-rise-ios-export
npx expo export --platform android --output-dir /tmp/starling-rise-android-export
```

The root TypeScript project has a documented legacy error backlog and the Next.js
build currently skips root type validation. The mobile workspace typecheck above
is required and must pass.

## Database and deployed API

After deploying the web application, run this read-only command in the Coolify
application container:

```bash
npm run check:migrations
```

Migrations `0057` and `0058` must be `APPLIED`. Migration `0058` adds the nullable
`recordings.client_operation_id` field and its partial unique index; apply
[`migrations/0058_mobile_recording_idempotency.sql`](../migrations/0058_mobile_recording_idempotency.sql)
before deploying the recording endpoint. Then verify the unauthenticated boundary:

```bash
curl -i https://YOUR_APP_HOST/api/mobile/v1/auth/me
```

The expected response is HTTP `401` with error code `NOT_AUTHENTICATED`. A `404`
means the new route was not deployed; a `500` requires application-log review.

Recording also adds the native iOS microphone usage description through the
`expo-audio` config plugin. Create a new simulator/preview binary after deployment;
an OTA JavaScript update cannot add that native permission string to an existing
binary.

For the complete deployed session lifecycle, configure these values only in an
uncommitted `.env.local` or the invoking process:

```bash
MOBILE_TEST_API_URL="https://YOUR_APP_HOST"
MOBILE_TEST_LOGIN_TOKEN="DEDICATED_TEST_LEARNER_TOKEN"
MOBILE_TEST_PLATFORM="ios"
```

Then run:

```bash
npm run test:mobile-auth-live
```

The harness creates a mobile refresh session, rotates it, proves replay is
rejected, logs out, and proves the logged-out credential is rejected. It never
prints credentials and attempts to revoke its session if a later assertion fails.

## EAS environments

`apps/mobile/eas.json` maps its profiles explicitly:

- `development` profile -> `development` EAS environment;
- `preview` profile -> `preview` EAS environment;
- `preview-simulator` profile -> `preview` EAS environment; and
- `production` profile -> `production` EAS environment.

For every EAS environment used, create these public/plain-text variables:

```text
EXPO_PUBLIC_API_URL=https://YOUR_APP_HOST
EXPO_PUBLIC_APP_HOST=YOUR_APP_HOST
```

They are embedded in the client and must not contain secrets. An EAS build fails
instead of silently targeting localhost when `EXPO_PUBLIC_API_URL` is absent.
For local Metro development, place the same keys in the gitignored
`apps/mobile/.env.local`.

The project must be linked to the correct Expo account before the first cloud
build. This creates external EAS project state and should be done deliberately by
the project owner. After linking and configuring environment values, create an
internal build from `apps/mobile`:

```bash
npx --yes eas-cli@latest build --platform android --profile preview
npx --yes eas-cli@latest build --platform ios --profile preview
```

iOS device distribution requires Apple signing and registered test devices.

To verify iOS native compilation without Apple signing or a local Xcode build,
use the simulator-only preview profile:

```bash
npx --yes eas-cli@latest build --platform ios --profile preview-simulator
```

This produces an iOS Simulator `.app`; it cannot be installed on a physical
iPhone. The profile uses the preview EAS environment and sets
`SHARP_IGNORE_GLOBAL_LIBVIPS=1`. EAS macOS images include a global `libvips`,
which otherwise makes the web workspace's `sharp` dependency attempt an
unnecessary source build during the mobile workspace install.

EAS remote simulators can run this artifact without a local simulator only when
the experimental service is enabled for the Expo organization. Check access
with `npx --yes eas-cli@latest simulator --platform ios`; otherwise use the Expo
simulator-service waitlist or defer interactive native testing.

## Physical-device smoke test

Run on at least one physical iOS and Android device:

1. Launch signed out and confirm both sign-in choices render.
2. Deny camera access and confirm the app remains usable through class-code login.
3. Re-enable camera access and scan a dedicated learner QR.
4. Confirm the learner's first name, assignment summary, XP, streak, and spelling
   counts appear and all four tabs open. Zero values are valid for a new test
   learner.
5. For a learner with a published assignment in an active class, open Read and
   confirm the assignment status and attempt count match the web application.
6. Open the story, play its narration, pause and resume it, then force-close and
   reopen the app. The learner should remain signed in and cached audio should
   play again.
7. Tap Start recording and deny microphone access once. Confirm the app explains
   the permission requirement without losing the story screen. Re-enable access,
   record a short reading, and confirm the timer stops at the assignment limit.
8. Listen to the finished recording. Force-close and reopen the app before
   sending; confirm the same recording is still ready to review.
9. Send it, confirm the success state and incremented attempt count, and confirm a
   teacher can play the new submission in the existing web review workflow.
10. For retry safety, interrupt the response after tapping Send, reopen, and tap
    Send again. Confirm only one `recordings` row/attempt and one recording XP
    award exist for that operation.
11. Record another unsent reading, then open Progress and choose `Sign out  登出`.
    Cancel once, then confirm sign-out. Sign back in and confirm the prior
    learner's pending voice recording is gone.
12. Sign in through class code, learner selection, and the correct visual password.
13. Confirm a wrong visual password is rejected without revealing the correct one.
14. Use an old promoted-class code and confirm it reaches the current class.
15. Scan an unrelated or lookalike-host QR and confirm it is rejected.

Watch Coolify application logs during the test. There should be no raw login,
access, refresh, or visual-password credentials in logs.
