import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_STORY_PATTERNS,
  STORY_PATTERN_DEFINITIONS,
  getStoryPattern,
  resolveStoryPattern,
} from './story-patterns';
import {
  READING_LEVELS,
  STORY_LENGTH_MATRIX,
  applyOverridesToLevel,
  getReadingLevel,
  resolveStoryLengthConfig,
  type ReadingLevelId,
} from './levels';
import {
  PassagePlanSchema,
  STORY_LENGTHS,
  type StoryLength,
  type StoryPattern,
} from './generate/types';
import { assertPassagePlanMatchesRequest } from './generate/validate-plan';

test('Story Pattern Definitions', async (t) => {
  await t.test('all 6 patterns have complete definitions', () => {
    assert.equal(ALL_STORY_PATTERNS.length, 6);
    for (const def of ALL_STORY_PATTERNS) {
      assert.ok(def, `Missing definition`);
      assert.ok(def.id.length > 0);
      assert.ok(def.label.length > 0);
      assert.ok(def.emoji.length > 0);
      assert.ok(def.tagline.length > 0);
      assert.ok(def.plannerDirectives.length > 0);
      assert.ok(def.proseDirectives.length > 0);
      assert.ok(def.questionStrategy.length > 0);
    }
  });

  await t.test('resolveStoryPattern defaults Level 0 to pattern and others to adventure', () => {
    assert.equal(resolveStoryPattern(0, undefined), 'pattern');
    assert.equal(resolveStoryPattern(0, null), 'pattern');
    assert.equal(resolveStoryPattern(1, undefined), 'adventure');
    assert.equal(resolveStoryPattern(2, undefined), 'adventure');
    assert.equal(resolveStoryPattern(3, undefined), 'adventure');
    assert.equal(resolveStoryPattern(4, undefined), 'adventure');
    assert.equal(resolveStoryPattern(5, undefined), 'adventure');
  });

  await t.test('resolveStoryPattern honors explicit valid requested pattern', () => {
    for (const def of ALL_STORY_PATTERNS) {
      assert.equal(resolveStoryPattern(0, def.id), def.id);
      assert.equal(resolveStoryPattern(2, def.id), def.id);
      assert.equal(resolveStoryPattern(5, def.id), def.id);
    }
  });

  await t.test('resolveStoryPattern falls back to default on invalid pattern', () => {
    // @ts-expect-error test invalid string
    assert.equal(resolveStoryPattern(0, 'invalid_pattern'), 'pattern');
    // @ts-expect-error test invalid string
    assert.equal(resolveStoryPattern(3, 'invalid_pattern'), 'adventure');
  });
});

test('Story Length Matrix & 18 Combinations (6 patterns x 3 lengths)', async (t) => {
  await t.test('covers all 6 patterns across all 3 lengths for all levels', () => {
    const levels: ReadingLevelId[] = [0, 1, 2, 3, 4, 5];

    for (const levelId of levels) {
      const baseLevel = getReadingLevel(levelId);

      for (const patternDef of ALL_STORY_PATTERNS) {
        for (const length of STORY_LENGTHS) {
          const lengthCfg = resolveStoryLengthConfig(levelId, length);
          assert.ok(lengthCfg, `Missing length config for level ${levelId} length ${length}`);
          assert.ok(lengthCfg.pageCount.min <= lengthCfg.pageCount.max);
          assert.ok(lengthCfg.wordsPerPage.min <= lengthCfg.wordsPerPage.max);

          const effective = applyOverridesToLevel(baseLevel, {
            storyLength: length,
            storyPattern: patternDef.id,
          });

          assert.equal(effective.pageCount.min, lengthCfg.pageCount.min);
          assert.equal(effective.pageCount.max, lengthCfg.pageCount.max);
          assert.equal(effective.wordsPerPage.min, lengthCfg.wordsPerPage.min);
          assert.equal(effective.wordsPerPage.max, lengthCfg.wordsPerPage.max);
        }
      }
    }
  });

  await t.test('Level 0 Starter parameters adhere to emergent reader constraints', () => {
    const starter = getReadingLevel(0);
    assert.equal(starter.id, 0);
    assert.equal(starter.targetAfFLevel, 'starter');
    assert.equal(starter.maxSentenceWords, 5);
    assert.equal(starter.avgSentenceWords, 4);
    assert.equal(starter.questionTypeMix.mcq_comprehension, 2);
    assert.equal(starter.questionTypeMix.vocab_matching, 1);
    assert.equal(starter.questionTypeMix.sequence_order, 0);

    // Short / Medium / Long for Level 0
    const shortCfg = resolveStoryLengthConfig(0, 'short');
    const medCfg = resolveStoryLengthConfig(0, 'medium');
    const longCfg = resolveStoryLengthConfig(0, 'long');

    assert.deepEqual(shortCfg.pageCount, { min: 5, max: 6 });
    assert.deepEqual(medCfg.pageCount, { min: 6, max: 8 });
    assert.deepEqual(longCfg.pageCount, { min: 8, max: 10 });

    assert.deepEqual(shortCfg.wordsPerPage, { min: 3, max: 5 });
    assert.deepEqual(medCfg.wordsPerPage, { min: 3, max: 8 });
    assert.deepEqual(longCfg.wordsPerPage, { min: 4, max: 8 });
  });

  await t.test('Precedence: Numerical override > StoryLength preset > Level default', () => {
    const baseLevel = getReadingLevel(1);

    // 1. Level default
    const levelDefault = applyOverridesToLevel(baseLevel, {});
    assert.deepEqual(levelDefault.pageCount, { min: 8, max: 10 });
    assert.deepEqual(levelDefault.wordsPerPage, { min: 12, max: 20 });


    // 2. Preset overrides default
    const withPreset = applyOverridesToLevel(baseLevel, { storyLength: 'long' });
    assert.deepEqual(withPreset.pageCount, { min: 10, max: 12 });
    assert.deepEqual(withPreset.wordsPerPage, { min: 16, max: 22 });

    // 3. Explicit numeric pageCount overrides preset
    const withNumericPage = applyOverridesToLevel(baseLevel, {
      storyLength: 'long',
      pageCount: 15,
    });
    assert.deepEqual(withNumericPage.pageCount, { min: 15, max: 15 });
    assert.deepEqual(withNumericPage.wordsPerPage, { min: 16, max: 22 }); // wordsPerPage still from preset

    // 4. Explicit numeric wordsPerPage overrides preset
    const withNumericWords = applyOverridesToLevel(baseLevel, {
      storyLength: 'long',
      wordsPerPageMin: 18,
      wordsPerPageMax: 30,
    });
    assert.deepEqual(withNumericWords.pageCount, { min: 10, max: 12 }); // pageCount from preset
    assert.deepEqual(withNumericWords.wordsPerPage, { min: 18, max: 30 });
  });
});

test('PassagePlanSchema & Plan Validation', async (t) => {
  await t.test('parses modern plan with pattern-neutral opening/development/ending', () => {
    const raw = {
      title: 'I Can Play',
      summary: 'A girl can do many fun actions.',
      setting: 'Playground',
      characters: [{ name: 'Sally', description: '6-year-old girl in red shoes' }],
      storyPattern: 'pattern',
      pages: [
        {
          pageNumber: 1,
          beat: 'Sally can jump.',
          sceneDescription: 'Sally jumping rope.',
          targetVocabUsed: ['jump'],
        },
      ],
      structuralPlan: {
        opening: 'Sally is at the park.',
        development: 'Sally jumps, runs, and plays.',
        ending: 'Sally is happy.',
      },
    };

    const parsed = PassagePlanSchema.safeParse(raw);
    assert.ok(parsed.success, 'Failed to parse modern plan');
    assert.equal(parsed.data.structuralPlan.opening, 'Sally is at the park.');
    assert.equal(parsed.data.structuralPlan.development, 'Sally jumps, runs, and plays.');
    assert.equal(parsed.data.structuralPlan.ending, 'Sally is happy.');
    assert.equal(parsed.data.storyPattern, 'pattern');
  });

  await t.test('parses legacy plan with problem/attempt/resolution seamlessly', () => {
    const legacyRaw = {
      title: 'The Lost Ball',
      summary: 'Tim finds his ball.',
      setting: 'Park',
      characters: [{ name: 'Tim', description: 'A boy in a blue cap' }],
      pages: [
        {
          pageNumber: 1,
          beat: 'Tim loses his ball.',
          sceneDescription: 'Tim looks sad.',
          targetVocabUsed: ['ball'],
        },
      ],
      structuralPlan: {
        problem: 'Tim cannot find his red ball.',
        attempt: 'Tim looks under the green bench.',
        resolution: 'Tim finds the ball behind the tree.',
      },
    };

    const parsed = PassagePlanSchema.safeParse(legacyRaw);
    assert.ok(parsed.success, 'Failed to parse legacy plan');
    assert.equal(parsed.data.structuralPlan.opening, 'Tim cannot find his red ball.');
    assert.equal(parsed.data.structuralPlan.development, 'Tim looks under the green bench.');
    assert.equal(parsed.data.structuralPlan.ending, 'Tim finds the ball behind the tree.');
  });

  await t.test('assertPassagePlanMatchesRequest verifies expectedStoryPattern', () => {
    const plan = {
      title: 'Test',
      summary: 'Summary',
      setting: 'Park',
      characters: [{ name: 'Tim', description: 'Boy' }],
      storyPattern: 'discovery' as const,
      pages: [
        {
          pageNumber: 1,
          beat: 'Beat 1',
          sceneDescription: 'Scene 1',
          targetVocabUsed: ['uuid-1'],
        },
      ],
      structuralPlan: {
        opening: 'Opening',
        development: 'Dev',
        ending: 'End',
      },
    };

    // Correct pattern
    assert.doesNotThrow(() => {
      assertPassagePlanMatchesRequest(plan, {
        pageCount: { min: 1, max: 1 },
        requiredTargetVocabIds: ['uuid-1'],
        expectedStoryPattern: 'discovery',
      });
    });

    // Mismatched pattern
    assert.throws(
      () => {
        assertPassagePlanMatchesRequest(plan, {
          pageCount: { min: 1, max: 1 },
          requiredTargetVocabIds: ['uuid-1'],
          expectedStoryPattern: 'cumulative',
        });
      },
      /expected story pattern "cumulative", received "discovery"/,
    );
  });
});
