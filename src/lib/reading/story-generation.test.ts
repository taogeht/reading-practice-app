// Covers the two behaviors that are easy to regress silently:
//   1. the grader's name-alias canonicalization (a wrong answer here shows up
//      as unexplained accuracy loss on real students, not as a crash)
//   2. curriculum unit-theme resolution feeding the story planner
//
// Run: npm run test:story-generation

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, align, summarize } from '../grading/align';
import { afFLevelToBookSlug, getUnitTheme, pickDominantUnit } from './unit-theme';
import {
  CHARACTER_CASTS,
  DEFAULT_CAST_ID,
  castNames,
  isApprovedCharacterName,
} from './names';

// ---------- name aliases in the grader ----------

test('Whisper spelling "Rosie" grades as a match for story text "Rosy"', () => {
  const expected = tokenize('Rosy has a red bike.');
  const heard = tokenize('Rosie has a red bike.');
  assert.deepEqual(heard, expected);

  const stats = summarize(align(expected, heard), expected.length, heard.length);
  assert.equal(stats.substituted, 0, 'name spelling must not count as a substitution');
  assert.equal(stats.matched, expected.length);
  assert.equal(stats.accuracyScore, 100);
});

test('possessive name forms canonicalize too', () => {
  // "Billy's teddy bear!" is literally a unit topic, so possessives are common.
  assert.deepEqual(tokenize("Rosie's bag"), tokenize("Rosy's bag"));
  assert.deepEqual(tokenize('Katy ran'), tokenize('Katie ran'));
});

test('aliasing does not swallow a genuine misread', () => {
  // "mum" is NOT aliased to "mom" — different pronunciation, so a student who
  // says it really did read a different word and the grader must see that.
  const expected = tokenize('Mom is here.');
  const heard = tokenize('Mum is here.');
  assert.notDeepEqual(heard, expected);
  assert.equal(
    summarize(align(expected, heard), expected.length, heard.length).substituted,
    1,
  );
});

test('non-name words are untouched by canonicalization', () => {
  assert.deepEqual(tokenize('the cat sat on the mat'), [
    'the', 'cat', 'sat', 'on', 'the', 'mat',
  ]);
});

// ---------- casts ----------

test('every cast member is accepted by the name guard for its own cast', () => {
  for (const cast of Object.values(CHARACTER_CASTS)) {
    for (const member of cast.members) {
      assert.ok(
        isApprovedCharacterName(member.name, cast.id),
        `${member.name} rejected by its own cast ${cast.id}`,
      );
    }
  }
});

test('family roles are allowed regardless of cast', () => {
  for (const cast of Object.values(CHARACTER_CASTS)) {
    assert.ok(isApprovedCharacterName('Grandma', cast.id));
    assert.ok(isApprovedCharacterName('Dad', cast.id));
  }
});

test('a name outside the chosen cast is rejected for that cast', () => {
  // Sally is legal in `neutral` but must not leak into a Family and Friends story.
  assert.ok(isApprovedCharacterName('Sally', 'neutral'));
  assert.equal(isApprovedCharacterName('Sally', 'faf_core'), false);
});

test('default cast is the textbook one', () => {
  assert.equal(DEFAULT_CAST_ID, 'faf_core');
  assert.deepEqual(castNames('faf_core'), ['Billy', 'Rosy', 'Tim']);
});

test('every aliased cast member has its alias wired into the grader', () => {
  // A declared alias that align.ts does not know about is inert — this test
  // is the tripwire for that mismatch.
  for (const cast of Object.values(CHARACTER_CASTS)) {
    for (const member of cast.members) {
      for (const alias of member.aliases ?? []) {
        assert.deepEqual(
          tokenize(alias),
          tokenize(member.name),
          `alias "${alias}" is declared on ${member.name} but not aliased in align.ts`,
        );
      }
    }
  }
});

// ---------- unit themes ----------

test('afF level maps to the matching book slug', () => {
  assert.equal(afFLevelToBookSlug('grade1'), 'family-friends-1');
  assert.equal(afFLevelToBookSlug('grade3'), 'family-friends-3');
  // starter has no authored curriculum directory
  assert.equal(afFLevelToBookSlug('starter'), null);
  assert.equal(afFLevelToBookSlug(null), null);
});

test('reads a real unit topic off disk', async () => {
  const theme = await getUnitTheme('grade3', 11);
  assert.ok(theme, 'FAF3 unit 11 should resolve');
  assert.equal(theme.topic, 'In the museum');
  assert.equal(theme.bookSlug, 'family-friends-3');
  assert.ok(theme.grammarPatterns.length > 0, 'grammar patterns should be extracted');
});

test('unmapped vocabulary yields no theme rather than throwing', async () => {
  assert.equal(await getUnitTheme('starter', 1), null);
  assert.equal(await getUnitTheme('grade3', 999), null);
  assert.equal(await getUnitTheme(null, null), null);
});

test('dominant unit is the most represented one', () => {
  const picked = pickDominantUnit([
    { afFLevel: 'grade3', afFUnit: 4 },
    { afFLevel: 'grade3', afFUnit: 4 },
    { afFLevel: 'grade3', afFUnit: 7 },
  ]);
  assert.deepEqual(picked, { afFLevel: 'grade3', afFUnit: 4 });
});

test('ties break toward the newest unit', () => {
  // Equal counts: the higher unit is the material the lesson is actually on.
  const picked = pickDominantUnit([
    { afFLevel: 'grade3', afFUnit: 2 },
    { afFLevel: 'grade3', afFUnit: 9 },
  ]);
  assert.deepEqual(picked, { afFLevel: 'grade3', afFUnit: 9 });
});

test('rows with no curriculum mapping are ignored', () => {
  assert.equal(pickDominantUnit([{ afFLevel: null, afFUnit: null }]), null);
  assert.deepEqual(
    pickDominantUnit([
      { afFLevel: null, afFUnit: null },
      { afFLevel: 'grade2', afFUnit: 5 },
    ]),
    { afFLevel: 'grade2', afFUnit: 5 },
  );
});
