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
import { MIN_CUMULATIVE_LEXICON, resolveVocabScope } from './generate/vocab-scope';
import {
  CHARACTER_CASTS,
  DEFAULT_CAST_ID,
  castNames,
  isApprovedCharacterName,
} from './names';
import {
  applyOverridesToLevel,
  getReadingLevel,
  validateOverrides,
} from './levels';
import { assertPassagePlanMatchesRequest } from './generate/validate-plan';
import { validateQuestions } from './generate/validate-questions';
import { questionCountForMix } from './generate/question-mix';
import type { GeneratedQuestion, PassagePlan } from './generate/types';
import {
  evaluateStoryGeneration,
  type StoryGenerationSample,
} from './evaluation';
import type { GeneratePassageResult } from './generate/passage';
import {
  buildGenerationWorkItems,
  generationJobNeedsLaunch,
  parseGenerationWorkItems,
} from './generation-job-plan';

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

// ---------- generation contract hardening ----------

function validPlan(): PassagePlan {
  return {
    title: 'The Red Bag',
    summary: 'Billy finds a red bag.',
    setting: 'park',
    characters: [{ name: 'Billy', description: 'A boy in a blue shirt.' }],
    pages: [
      {
        pageNumber: 1,
        beat: 'Billy sees the bag.',
        sceneDescription: 'Billy sees a red bag in the park.',
        targetVocabUsed: ['vocab-red'],
      },
      {
        pageNumber: 2,
        beat: 'Billy takes the bag home.',
        sceneDescription: 'Billy carries the bag home.',
        targetVocabUsed: ['vocab-bag'],
      },
    ],
    structuralPlan: {
      problem: 'The bag is lost.',
      attempt: 'Billy looks for its owner.',
      resolution: 'Billy finds the owner.',
    },
  };
}

test('plan validation accepts sequential pages with complete target coverage', () => {
  assert.doesNotThrow(() =>
    assertPassagePlanMatchesRequest(validPlan(), {
      pageCount: { min: 2, max: 2 },
      requiredTargetVocabIds: ['vocab-red', 'vocab-bag'],
    }),
  );
});

test('plan validation rejects omitted requested target vocabulary', () => {
  const plan = validPlan();
  plan.pages[1]!.targetVocabUsed = [];
  assert.throws(
    () =>
      assertPassagePlanMatchesRequest(plan, {
        pageCount: { min: 2, max: 2 },
        requiredTargetVocabIds: ['vocab-red', 'vocab-bag'],
      }),
    /omitted 1 requested target vocabulary word/,
  );
});

test('plan validation rejects non-sequential page numbers', () => {
  const plan = validPlan();
  plan.pages[1]!.pageNumber = 3;
  assert.throws(
    () =>
      assertPassagePlanMatchesRequest(plan, {
        pageCount: { min: 2, max: 2 },
        requiredTargetVocabIds: ['vocab-red', 'vocab-bag'],
      }),
    /page numbers must be sequential/,
  );
});

test('question validation honors an overridden three-question mix', () => {
  const mix = {
    mcq_comprehension: 3,
    vocab_matching: 0,
    sequence_order: 0,
  };
  assert.equal(questionCountForMix(mix), 3);

  const pages = [{ pageNumber: 1, text: 'Billy has a red bag.' }];
  const questions: GeneratedQuestion[] = Array.from({ length: 3 }, (_, index) => ({
    type: 'mcq_comprehension' as const,
    questionText: 'What does Billy have?',
    orderIndex: index,
    payload: {
      options: ['a red bag', 'a blue pen', 'a green hat', 'a big cat'],
      correctIndex: 0,
    },
    evidenceQuote: 'Billy has a red bag.',
    evidencePageNumber: 1,
  }));
  const effectiveLevel = applyOverridesToLevel(getReadingLevel(2), {
    questionCount: 3,
    questionTypeMix: mix,
  });

  const result = validateQuestions(
    questions,
    pages,
    [],
    [],
    2,
    'passage-test',
    effectiveLevel,
  );
  assert.equal(result.errorCount, 0);
  assert.equal(result.stats.mcqCount, 3);
});

test('question-count overrides require a matching type mix', () => {
  const result = validateOverrides(2, { questionCount: 3 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('question type mix')));
});

test('question type mix rejects fractional counts', () => {
  const result = validateOverrides(2, {
    questionCount: 5,
    questionTypeMix: {
      mcq_comprehension: 3.5,
      vocab_matching: 0.5,
      sequence_order: 1,
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('whole numbers')));
});

function evaluationResult(
  overrides: Partial<GeneratePassageResult> = {},
): GeneratePassageResult {
  return {
    passageId: 'passage-eval',
    status: 'draft',
    qualityReport: {
      proseScore: 0.9,
      questionsScore: 0.8,
      imagesValid: false,
      passageReady: false,
    },
    timing: {
      planMs: 100,
      proseMs: 200,
      questionsMs: 300,
      imagesMs: 0,
      uploadsMs: 0,
      dbWriteMs: 10,
      totalMs: 610,
    },
    cost: {
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      imageCallsCount: 0,
    },
    issues: [],
    ...overrides,
  };
}

test('story evaluation treats image-skipped drafts as content ready', () => {
  const samples: StoryGenerationSample[] = [
    { caseId: 'level-1', readingLevelId: 1, result: evaluationResult() },
  ];
  const report = evaluateStoryGeneration(samples);
  assert.equal(report.contentReadyRate, 1);
  assert.equal(report.failureRate, 0);
  assert.equal(report.passed, true);
});

test('story evaluation gates a failed generation', () => {
  const failed = evaluationResult({
    status: 'failed',
    qualityReport: {
      proseScore: 0,
      questionsScore: 0,
      imagesValid: false,
      passageReady: false,
    },
    issues: [
      {
        stage: 'pipeline',
        type: 'pipeline_error',
        severity: 'error',
        message: 'provider timeout',
      },
    ],
  });
  const report = evaluateStoryGeneration([
    { caseId: 'failed', readingLevelId: 1, result: failed },
  ]);
  assert.equal(report.failureRate, 1);
  assert.equal(report.contentReadyRate, 0);
  assert.equal(report.passed, false);
  assert.deepEqual(report.issueFrequency[0], {
    key: 'pipeline.pipeline_error',
    severity: 'error',
    count: 1,
    // Pipeline errors carry a message, not a word — nothing to sample.
    sampleWords: [],
  });
});

test('story evaluation names the words behind an unknown_word count', () => {
  // A bare count cannot tell you whether the lexicon is too small or the model
  // wrote off-curriculum. The words can, so they have to survive aggregation.
  const noisy = evaluationResult({
    issues: [
      { stage: 'prose', type: 'unknown_word', severity: 'error', pageNumber: 1, word: 'castle', sentence: 'The castle is big.' },
      { stage: 'prose', type: 'unknown_word', severity: 'error', pageNumber: 2, word: 'castle', sentence: 'A castle again.' },
      { stage: 'prose', type: 'unknown_word', severity: 'error', pageNumber: 3, word: 'dragon', sentence: 'The dragon ran.' },
    ],
  });
  const report = evaluateStoryGeneration([
    { caseId: 'noisy', readingLevelId: 2, result: noisy },
  ]);
  const entry = report.issueFrequency.find((i) => i.key === 'prose.unknown_word');
  assert.ok(entry);
  assert.equal(entry.count, 3);
  // Deduplicated: three occurrences, two distinct offenders.
  assert.deepEqual(entry.sampleWords, ['castle', 'dragon']);
});

test('story evaluation reports nearest-rank latency percentiles', () => {
  const totals = [100, 200, 300, 400];
  const samples = totals.map((totalMs, index) => ({
    caseId: `sample-${index}`,
    readingLevelId: 2,
    result: evaluationResult({
      timing: { ...evaluationResult().timing, totalMs },
    }),
  }));
  const report = evaluateStoryGeneration(samples);
  assert.equal(report.p50TotalMs, 200);
  assert.equal(report.p95TotalMs, 400);
});

test('generation work items preserve exact per-passage target sets', () => {
  const items = buildGenerationWorkItems([
    ['vocab-a', 'vocab-b'],
    ['vocab-c', 'vocab-d'],
  ]);
  assert.deepEqual(items, [
    { index: 0, targetVocabIds: ['vocab-a', 'vocab-b'] },
    { index: 1, targetVocabIds: ['vocab-c', 'vocab-d'] },
  ]);
  assert.deepEqual(parseGenerationWorkItems(items, 2), items);
});

test('generation work-item parser rejects gaps and malformed target ids', () => {
  assert.equal(
    parseGenerationWorkItems([{ index: 1, targetVocabIds: ['vocab-a'] }], 1),
    null,
  );
  assert.equal(
    parseGenerationWorkItems([{ index: 0, targetVocabIds: [''] }], 1),
    null,
  );
});

test('only queued or lease-expired resumable jobs request a launch', () => {
  const workItems = [{ index: 0, targetVocabIds: ['vocab-a'] }];
  const now = new Date('2026-08-18T00:00:00.000Z');
  assert.equal(
    generationJobNeedsLaunch(
      { status: 'queued', leaseExpiresAt: null, workItems },
      now,
    ),
    true,
  );
  assert.equal(
    generationJobNeedsLaunch(
      {
        status: 'running',
        leaseExpiresAt: new Date('2026-08-17T23:59:59.000Z'),
        workItems,
      },
      now,
    ),
    true,
  );
  assert.equal(
    generationJobNeedsLaunch(
      {
        status: 'running',
        leaseExpiresAt: new Date('2026-08-18T00:01:00.000Z'),
        workItems,
      },
      now,
    ),
    false,
  );
  assert.equal(
    generationJobNeedsLaunch(
      { status: 'queued', leaseExpiresAt: null, workItems: [] },
      now,
    ),
    false,
    'legacy jobs without a durable plan must not be claimed',
  );
});


// ---------- curriculum vocabulary scope ----------

test('every level below the story level is carried forward in full', () => {
  // The bug this replaces: a grade2 story saw only grade2 words, so a Grade 2
  // class could not use the Grade 1 vocabulary it spent last year learning.
  const scope = resolveVocabScope([
    { afFLevel: 'grade2', afFUnit: 4 },
    { afFLevel: 'grade2', afFUnit: 4 },
  ]);
  assert.equal(scope.currentLevel, 'grade2');
  assert.deepEqual(scope.belowLevels, ['starter', 'grade1']);
  assert.equal(scope.unitCap, 4);
});

test('unit cap never excludes a target word', () => {
  // Cap is the MAX target unit, not the dominant one — otherwise the unit-7
  // word would sit outside the very story it is a target of.
  const scope = resolveVocabScope([
    { afFLevel: 'grade3', afFUnit: 2 },
    { afFLevel: 'grade3', afFUnit: 2 },
    { afFLevel: 'grade3', afFUnit: 7 },
  ]);
  assert.equal(scope.unitCap, 7);
});

test('targets spanning levels scope to the highest one', () => {
  const scope = resolveVocabScope([
    { afFLevel: 'grade1', afFUnit: 12 },
    { afFLevel: 'grade2', afFUnit: 3 },
  ]);
  assert.equal(scope.currentLevel, 'grade2');
  // grade1 is below now, so its unit 12 is fair game regardless of the cap.
  assert.deepEqual(scope.belowLevels, ['starter', 'grade1']);
  assert.equal(scope.unitCap, 3);
});

test('the lowest level has nothing below it', () => {
  const scope = resolveVocabScope([{ afFLevel: 'starter', afFUnit: 1 }]);
  assert.deepEqual(scope.belowLevels, []);
  assert.equal(scope.unitCap, 1);
});

test('targets with no curriculum metadata yield an unscoped result', () => {
  const scope = resolveVocabScope([{ afFLevel: null, afFUnit: null }]);
  assert.equal(scope.currentLevel, null);
  assert.equal(scope.unitCap, null);
  assert.deepEqual(scope.belowLevels, []);
});

test('a level with targets but no unit numbers is left uncapped', () => {
  // Null units cannot be placed in the sequence, so capping on them would
  // silently drop the level's whole vocabulary.
  const scope = resolveVocabScope([{ afFLevel: 'grade2', afFUnit: null }]);
  assert.equal(scope.currentLevel, 'grade2');
  assert.equal(scope.unitCap, null);
});

test('the lexicon floor stays above a single levels worth of words', () => {
  // Guards the widen-on-starvation path: if this drops to near zero the
  // fallback silently stops firing and early-unit stories starve again.
  assert.ok(MIN_CUMULATIVE_LEXICON >= 200);
});
