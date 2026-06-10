/**
 * Scaffolds the static icon-asset tree under public/images/icons/ and writes a
 * manifest of every expected PNG path. These are app-shipped UI icons (NOT
 * per-student/generated content), so they live in public/ and are referenced
 * as /images/icons/... — same pattern as src/lib/gamification/rules.ts, which
 * points at /images/avatars/*.png.
 *
 * Idempotent + re-runnable: creates missing folders, drops a .gitkeep in each
 * (so empty dirs are tracked), and rewrites manifest.json.
 *
 *   node scripts/scaffold-icon-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = join(ROOT, 'public', 'images', 'icons'); // on-disk
const BASE_URL = '/images/icons';                          // how code references them

// Canonical set definitions. `files` are bare ids (matched to the id strings
// already used in code where one exists) — .png is appended.
const SETS = [
    { dir: 'login/animals', title: 'Login picker — Animals', source: 'visual-password-options.ts ANIMALS',
      files: ['cat','dog','rabbit','bear','lion','tiger','fox','panda','koala','monkey','elephant','pig','frog'] },
    { dir: 'login/objects', title: 'Login picker — Objects', source: 'visual-password-options.ts OBJECTS',
      files: ['apple','banana','car','house','tree','flower','star','heart','sun','moon','book','ball'] },
    { dir: 'login/people', title: 'Login picker — People avatars', source: 'visual-password-options.ts AVATARS',
      files: ['girl_blonde','boy_blonde','girl_brown','boy_brown','girl_dark','boy_dark','student_yellow','student_light','student_medium','student_dark','dino','rocket'] },
    { dir: 'avatar-types', title: 'Avatar character-type fallbacks', source: 'avatar-display.tsx BASE_EMOJI',
      files: ['human','animal','robot'] },
    { dir: 'units', title: 'Curriculum unit icons', source: 'practice/units.ts',
      files: Array.from({ length: 15 }, (_, i) => `unit-${i + 1}`) },
    { dir: 'spelling', title: 'Spelling-game icons', source: 'dashboard-v2 tabs + snowman-game themes',
      files: ['snowman','listen','unscramble','missing','flashcards','hangman','bomb','balloons','snowflake'] },
    { dir: 'rewards', title: 'Reward / XP / wallet icons', source: 'gamification/labels.ts',
      files: ['stars','xp','trophy','gift','shop','recording','read-page','story-complete','correct','attempt','streak','level-up','daily-login','reroll','sparkle','target'] },
    { dir: 'helper', title: 'Homework helper (Sunny)', source: 'homework-helper.tsx',
      files: ['sunny','define','check-sentence','practice','how-to-say'] },
    { dir: 'status', title: 'Status / feedback (optional)', source: 'inline toasts',
      files: ['celebration','success','error','thumbs-up','clap','strong'] },
];

// Avatar options / icons that intentionally reuse another set's art instead of
// getting their own file (don't generate these separately).
const REUSE = {
    'login/people: cat':   `${BASE_URL}/login/animals/cat.png`,
    'login/people: dog':   `${BASE_URL}/login/animals/dog.png`,
    'login/people: panda': `${BASE_URL}/login/animals/panda.png`,
    'login/people: star':  `${BASE_URL}/login/objects/star.png`,
    'status: sparkle':     `${BASE_URL}/rewards/sparkle.png`,
};

// Which rewards/ file backs each XP event / star source (gamification/labels.ts).
const REWARD_EVENT_MAP = {
    recording_submitted: 'recording.png',
    reading_page_finished: 'read-page.png',
    reading_question_correct: 'read-page.png',
    reading_question_first_try_correct: 'xp.png',
    reading_story_completed: 'story-complete.png',
    reading_perfect_score: 'stars.png',
    spelling_won: 'trophy.png',
    spelling_lost: 'attempt.png',
    practice_correct: 'correct.png',
    practice_first_try_bonus: 'xp.png',
    practice_wrong_first_attempt: 'attempt.png',
    vocab_word_mastered: 'story-complete.png',
    daily_login: 'daily-login.png',
    streak_7_bonus: 'streak.png',
    streak_30_bonus: 'streak.png',
    streak_100_bonus: 'streak.png',
    level_up: 'level-up.png',
    teacher_grant: 'gift.png',
    shop_purchase: 'shop.png',
    reroll: 'reroll.png',
    _default: 'stars.png',
};

let created = 0;
const sets = {};
let total = 0;

for (const set of SETS) {
    const abs = join(BASE_DIR, ...set.dir.split('/'));
    mkdirSync(abs, { recursive: true });
    writeFileSync(join(abs, '.gitkeep'), '');
    created++;
    const paths = set.files.map((f) => `${BASE_URL}/${set.dir}/${f}.png`);
    sets[set.dir] = { title: set.title, source: set.source, count: set.files.length, files: paths };
    total += set.files.length;
}

const manifest = {
    description: 'Static app icon set. Replace emoji with these PNGs (transparent). Referenced as /images/icons/...',
    basePath: BASE_URL,
    publicDir: 'public/images/icons',
    format: 'png (transparent), 1024x1024 source, square',
    totalExpected: total,
    sets,
    reuse: REUSE,
    rewardEventMap: REWARD_EVENT_MAP,
};

writeFileSync(join(BASE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`✓ ${created} folders ready under public/images/icons/`);
console.log(`✓ manifest.json written — ${total} expected icon files across ${SETS.length} sets`);
for (const set of SETS) console.log(`   ${set.dir.padEnd(16)} ${set.files.length}`);
