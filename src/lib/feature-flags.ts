// Compile-time feature flags. Flip a value here, commit, redeploy — that's
// the whole interface. Keep this file's surface tiny: a few const exports,
// no runtime config, no env-var indirection. Anything that needs to vary at
// runtime should be in system_settings, not here.

/**
 * When false (default), every student-facing shop surface is hidden:
 *   - ShopCalloutCard on /student/dashboard
 *   - "Shop" link in the desktop + mobile nav
 *   - Shop tab on /student/stuff
 *   - Collection tab on /student/stuff (depends on the shop catalogue)
 *   - "Visit the shop →" CTAs in the avatar editor empty states
 *
 * Star earning, the Wallet tab, the Avatar tab, and the Classmates tab all
 * remain available. Owned cosmetics still equip in the avatar editor — only
 * the acquisition path is hidden. Teacher star grants still work.
 *
 * Flip to true when the shop is ready for student use.
 */
export const STUDENT_SHOP_ENABLED = false;

/**
 * When true, the student dashboard route redirects to the young-learner V2
 * dashboard at /student/dashboard-v2 (big buttons, bilingual + read-aloud,
 * 4 tabs). V2 lives at its own route so it can be previewed with real data
 * and rolled back instantly; flip this on to send every student to it, or
 * visit /student/dashboard-v2 directly while it's off.
 */
export const STUDENT_DASHBOARD_V2 = true;

/**
 * When true, every /teacher/* route is wrapped in the new persistent navigation
 * shell (left sidebar on desktop, hamburger drawer on mobile) — the backbone of
 * the teacher-side redesign. Nav items are gated by the teacher's capability
 * flags, so a default teacher sees a short list. The shell is additive: existing
 * pages render unchanged inside it, so it's safe to flip on/off.
 *
 * Flip to true to preview the redesign; the decluttered Home + simplified class
 * page land incrementally behind this same flag.
 */
export const TEACHER_NAV_V2 = true;
