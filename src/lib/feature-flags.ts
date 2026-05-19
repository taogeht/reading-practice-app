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
