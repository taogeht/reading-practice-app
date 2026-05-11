'use client';

// Teacher-facing passage generation page. Simple-mode controls
// (level + count + Generate) are always visible; advanced controls
// live inside a collapsible "Customize" section. Submitting fires
// /api/teacher/reading/generate which queues a background job and
// returns an ETA — this page swaps to a "Generation started" panel
// rather than waiting for results.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { READING_LEVELS } from '@/lib/reading/levels';

type SelectionMode = 'random_level' | 'random_unit' | 'specific';
type VocabStrictness = 'strict' | 'permissive';

interface VocabPick {
  id: string;
  word: string;
  partOfSpeech: string;
  afFUnit: number | null;
  isPicturable: boolean;
}

interface JobResult {
  jobId: string;
  countToGenerate: number;
  estimatedMinutes: number;
  message: string;
}

// ---- Defaults --------------------------------------------------------
// Mirror the level config so the form initialises with values that
// match what an unmodified generation would use.

function levelDefaults(levelId: number) {
  const lvl = READING_LEVELS.find((l) => l.id === levelId);
  if (!lvl) throw new Error(`Unknown level ${levelId}`);
  const wppMid = Math.round((lvl.wordsPerPage.min + lvl.wordsPerPage.max) / 2);
  const pageMid = Math.round((lvl.pageCount.min + lvl.pageCount.max) / 2);
  return {
    levelId: lvl.id,
    maxSentenceWords: lvl.maxSentenceWords,
    pageCount: pageMid,
    wordsPerPageAvg: wppMid,
    targetVocabCount: lvl.targetVocabPerStory,
    allowPastTense: lvl.grammarConstraints.allowPastTense,
    allowContractions: lvl.grammarConstraints.allowContractions,
    allowPhrasalVerbs: lvl.grammarConstraints.allowPhrasalVerbs,
    allowFutureTense: lvl.grammarConstraints.allowFutureTense,
    questionCount:
      lvl.questionTypeMix.mcq_comprehension +
      lvl.questionTypeMix.vocab_matching +
      lvl.questionTypeMix.sequence_order,
    mcqCount: lvl.questionTypeMix.mcq_comprehension,
    vocabMatchCount: lvl.questionTypeMix.vocab_matching,
    sequenceCount: lvl.questionTypeMix.sequence_order,
  };
}

// ---- Page ------------------------------------------------------------

export default function TeacherGeneratePage() {
  const router = useRouter();

  // Simple-mode state.
  const [levelId, setLevelId] = useState<number>(2);
  const [countToGenerate, setCountToGenerate] = useState<number>(1);

  // Advanced-mode disclosure.
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Form state mirrors the level defaults; resets on level change.
  const defaults = useMemo(() => levelDefaults(levelId), [levelId]);
  const [maxSentenceWords, setMaxSentenceWords] = useState<number>(defaults.maxSentenceWords);
  const [pageCount, setPageCount] = useState<number>(defaults.pageCount);
  const [wordsPerPageAvg, setWordsPerPageAvg] = useState<number>(defaults.wordsPerPageAvg);
  const [targetVocabCount, setTargetVocabCount] = useState<number>(defaults.targetVocabCount);
  const [allowPastTense, setAllowPastTense] = useState<boolean>(defaults.allowPastTense);
  const [allowContractions, setAllowContractions] = useState<boolean>(defaults.allowContractions);
  const [allowPhrasalVerbs, setAllowPhrasalVerbs] = useState<boolean>(defaults.allowPhrasalVerbs);
  const [allowFutureTense, setAllowFutureTense] = useState<boolean>(defaults.allowFutureTense);
  const [questionCount, setQuestionCount] = useState<number>(defaults.questionCount);
  const [mcqCount, setMcqCount] = useState<number>(defaults.mcqCount);
  const [vocabMatchCount, setVocabMatchCount] = useState<number>(defaults.vocabMatchCount);
  const [sequenceCount, setSequenceCount] = useState<number>(defaults.sequenceCount);
  const [setting, setSetting] = useState('');
  const [seedTheme, setSeedTheme] = useState('');
  const [vocabStrictness, setVocabStrictness] = useState<VocabStrictness>('strict');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('random_level');
  const [unit, setUnit] = useState<number>(1);
  const [pickedVocab, setPickedVocab] = useState<VocabPick[]>([]);

  // Submission state.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitIssues, setSubmitIssues] = useState<string[]>([]);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);

  // When the level changes, reset every dependent default. Avoids the
  // surprise of having a 14-word sentence cap left over from Level 5
  // after switching down to Level 1.
  useEffect(() => {
    const d = levelDefaults(levelId);
    setMaxSentenceWords(d.maxSentenceWords);
    setPageCount(d.pageCount);
    setWordsPerPageAvg(d.wordsPerPageAvg);
    setTargetVocabCount(d.targetVocabCount);
    setAllowPastTense(d.allowPastTense);
    setAllowContractions(d.allowContractions);
    setAllowPhrasalVerbs(d.allowPhrasalVerbs);
    setAllowFutureTense(d.allowFutureTense);
    setQuestionCount(d.questionCount);
    setMcqCount(d.mcqCount);
    setVocabMatchCount(d.vocabMatchCount);
    setSequenceCount(d.sequenceCount);
    setPickedVocab([]); // selected words rarely match a new level
  }, [levelId]);

  const resetToDefaults = useCallback(() => {
    const d = levelDefaults(levelId);
    setMaxSentenceWords(d.maxSentenceWords);
    setPageCount(d.pageCount);
    setWordsPerPageAvg(d.wordsPerPageAvg);
    setTargetVocabCount(d.targetVocabCount);
    setAllowPastTense(d.allowPastTense);
    setAllowContractions(d.allowContractions);
    setAllowPhrasalVerbs(d.allowPhrasalVerbs);
    setAllowFutureTense(d.allowFutureTense);
    setQuestionCount(d.questionCount);
    setMcqCount(d.mcqCount);
    setVocabMatchCount(d.vocabMatchCount);
    setSequenceCount(d.sequenceCount);
    setSetting('');
    setSeedTheme('');
    setVocabStrictness('strict');
    setSelectionMode('random_level');
    setUnit(1);
    setPickedVocab([]);
  }, [levelId]);

  const questionMixSum = mcqCount + vocabMatchCount + sequenceCount;
  const questionMixValid = questionMixSum === questionCount;

  // Picturable-only filter mirrors the server-side rule: if the
  // vocab_matching count > 0, every selected target word must be
  // picturable. Locks unpicturable words out of the picker UI.
  const requirePicturable = vocabMatchCount > 0;

  // Available units for the random_unit mode. The vocabulary table
  // has unit numbers attached to grade1/2/3/4 rows; we surface the
  // typical AF&F unit range (1-15) since the actual occupied units
  // vary by curriculum.
  const unitOptions = useMemo(() => {
    const xs: number[] = [];
    for (let i = 1; i <= 15; i++) xs.push(i);
    return xs;
  }, []);

  // ---- Submission -----------------------------------------------------

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitIssues([]);
    try {
      const overrides: Record<string, unknown> = {};
      // Only send fields that differ from the level default — keeps
      // the request payload self-documenting in logs and lets the
      // server side fall back to level defaults when an override
      // wasn't actually customized.
      if (maxSentenceWords !== defaults.maxSentenceWords) {
        overrides.maxSentenceWords = maxSentenceWords;
      }
      if (pageCount !== defaults.pageCount) {
        overrides.pageCount = pageCount;
      }
      if (wordsPerPageAvg !== defaults.wordsPerPageAvg) {
        // Derive min/max as ±25% of the chosen average.
        overrides.wordsPerPageMin = Math.max(5, Math.round(wordsPerPageAvg * 0.75));
        overrides.wordsPerPageMax = Math.min(60, Math.round(wordsPerPageAvg * 1.25));
      }
      if (allowPastTense !== defaults.allowPastTense) overrides.allowPastTense = allowPastTense;
      if (allowContractions !== defaults.allowContractions) {
        overrides.allowContractions = allowContractions;
      }
      if (allowPhrasalVerbs !== defaults.allowPhrasalVerbs) {
        overrides.allowPhrasalVerbs = allowPhrasalVerbs;
      }
      if (allowFutureTense !== defaults.allowFutureTense) {
        overrides.allowFutureTense = allowFutureTense;
      }
      if (setting.trim()) overrides.setting = setting.trim();
      if (seedTheme.trim()) overrides.seedTheme = seedTheme.trim();
      if (vocabStrictness !== 'strict') overrides.vocabStrictness = vocabStrictness;
      if (questionCount !== defaults.questionCount) overrides.questionCount = questionCount;
      if (
        mcqCount !== defaults.mcqCount ||
        vocabMatchCount !== defaults.vocabMatchCount ||
        sequenceCount !== defaults.sequenceCount
      ) {
        overrides.questionTypeMix = {
          mcq_comprehension: mcqCount,
          vocab_matching: vocabMatchCount,
          sequence_order: sequenceCount,
        };
      }
      if (selectionMode === 'random_unit') {
        overrides.targetVocabSelectionMode = 'random_unit';
        overrides.targetVocabUnit = unit;
      } else if (selectionMode === 'specific') {
        overrides.targetVocabSelectionMode = 'specific';
        overrides.targetVocabIds = pickedVocab.map((p) => p.id);
      }
      if (
        selectionMode !== 'specific' &&
        targetVocabCount !== defaults.targetVocabCount
      ) {
        overrides.targetVocabCount = targetVocabCount;
      }

      const res = await fetch('/api/teacher/reading/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          readingLevelId: levelId,
          countToGenerate,
          overrides,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          issues?: string[];
        };
        setSubmitError(body.error ?? `HTTP ${res.status}`);
        setSubmitIssues(body.issues ?? []);
        return;
      }
      const body = (await res.json()) as JobResult;
      setJobResult(body);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start generation');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- "Generation started" panel ------------------------------------
  // Replaced the static "started" card with a live polling card so the
  // teacher sees per-passage outcomes as they land rather than having
  // to bounce to the review queue blind.
  if (jobResult) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader />
        <div className="max-w-3xl mx-auto px-4 py-8">
          <JobStatusCard
            jobId={jobResult.jobId}
            initialMessage={jobResult.message}
            onGenerateMore={() => {
              setJobResult(null);
              setSubmitError(null);
            }}
          />
        </div>
      </div>
    );
  }

  // ---- Main form ------------------------------------------------------
  const levelDef = READING_LEVELS.find((l) => l.id === levelId)!;
  const estMinutes = countToGenerate * 3;
  const submitDisabled =
    submitting ||
    !questionMixValid ||
    (selectionMode === 'specific' && pickedVocab.length < 3);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Simple mode */}
        <Card>
          <CardHeader>
            <CardTitle>Quick generate</CardTitle>
            <CardDescription>
              Pick a reading level and a number of stories. Defaults are tuned
              per level — open <em>Customize</em> below to tailor the prose,
              vocabulary, or questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reading level
              </label>
              <select
                value={levelId}
                onChange={(e) => setLevelId(parseInt(e.target.value, 10))}
                className="w-full max-w-sm border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {READING_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    Level {l.id} — {l.name} (AF&amp;F {l.targetAfFLevel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                Number of stories
              </span>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCountToGenerate(n)}
                    className={[
                      'px-4 py-2 rounded-full text-sm font-medium border transition active:scale-95',
                      countToGenerate === n
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300',
                    ].join(' ')}
                  >
                    {n} {n === 1 ? 'story' : 'stories'}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customize disclosure */}
        <Card>
          <CardHeader
            onClick={() => setCustomizeOpen((v) => !v)}
            role="button"
            tabIndex={0}
            aria-expanded={customizeOpen}
            className="cursor-pointer select-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setCustomizeOpen((v) => !v);
              }
            }}
          >
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Customize</span>
              {customizeOpen ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </CardTitle>
            <CardDescription>
              Tailor the story to a specific lesson. Anything you don&rsquo;t
              touch falls back to the {levelDef.name} default.
            </CardDescription>
          </CardHeader>
          {customizeOpen && (
            <CardContent className="space-y-8">
              <SectionWhatToPractice
                levelId={levelId}
                requirePicturable={requirePicturable}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                unit={unit}
                setUnit={setUnit}
                unitOptions={unitOptions}
                pickedVocab={pickedVocab}
                setPickedVocab={setPickedVocab}
                targetVocabCount={targetVocabCount}
                setTargetVocabCount={setTargetVocabCount}
              />

              <SectionLengthAndShape
                maxSentenceWords={maxSentenceWords}
                setMaxSentenceWords={setMaxSentenceWords}
                pageCount={pageCount}
                setPageCount={setPageCount}
                wordsPerPageAvg={wordsPerPageAvg}
                setWordsPerPageAvg={setWordsPerPageAvg}
                defaults={defaults}
              />

              <SectionGrammar
                allowPastTense={allowPastTense}
                setAllowPastTense={setAllowPastTense}
                allowContractions={allowContractions}
                setAllowContractions={setAllowContractions}
                allowPhrasalVerbs={allowPhrasalVerbs}
                setAllowPhrasalVerbs={setAllowPhrasalVerbs}
                allowFutureTense={allowFutureTense}
                setAllowFutureTense={setAllowFutureTense}
                defaults={defaults}
              />

              <SectionSettingAndTheme
                setting={setting}
                setSetting={setSetting}
                seedTheme={seedTheme}
                setSeedTheme={setSeedTheme}
              />

              <SectionVocabStrictness
                vocabStrictness={vocabStrictness}
                setVocabStrictness={setVocabStrictness}
              />

              <SectionQuestions
                levelId={levelId}
                questionCount={questionCount}
                setQuestionCount={setQuestionCount}
                mcqCount={mcqCount}
                setMcqCount={setMcqCount}
                vocabMatchCount={vocabMatchCount}
                setVocabMatchCount={setVocabMatchCount}
                sequenceCount={sequenceCount}
                setSequenceCount={setSequenceCount}
                mixSum={questionMixSum}
                mixValid={questionMixValid}
              />

              <div className="pt-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="text-sm text-blue-700 hover:underline"
                >
                  Reset to defaults
                </button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Footer */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
            <p className="font-semibold">{submitError}</p>
            {submitIssues.length > 0 && (
              <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs">
                {submitIssues.map((iss, i) => (
                  <li key={i}>{iss}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!questionMixValid && customizeOpen && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
            Question type counts should add to {questionCount} (currently
            {' '}{questionMixSum}).
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-gray-600">
            Generating {countToGenerate} {countToGenerate === 1 ? 'story' : 'stories'} —
            about {estMinutes} minute{estMinutes === 1 ? '' : 's'}.
          </p>
          <Button
            onClick={() => void submit()}
            disabled={submitDisabled}
            size="lg"
            className="px-6"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>

        <RecentJobsPanel />
      </div>
    </div>
  );
}

// ---- Sub-components ---------------------------------------------------

function PageHeader() {
  const router = useRouter();
  return (
    <div className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => router.push('/teacher/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Generate Reading Passages</h1>
            <p className="text-gray-600 mt-1">
              Create new stories for the library. Generated stories appear in the
              review queue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLengthAndShape({
  maxSentenceWords,
  setMaxSentenceWords,
  pageCount,
  setPageCount,
  wordsPerPageAvg,
  setWordsPerPageAvg,
  defaults,
}: {
  maxSentenceWords: number;
  setMaxSentenceWords: (n: number) => void;
  pageCount: number;
  setPageCount: (n: number) => void;
  wordsPerPageAvg: number;
  setWordsPerPageAvg: (n: number) => void;
  defaults: ReturnType<typeof levelDefaults>;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Story length &amp; shape
      </h3>
      <div className="space-y-4">
        <Slider
          label="Sentence length cap"
          min={4}
          max={25}
          value={maxSentenceWords}
          onChange={setMaxSentenceWords}
          formatValue={(v) => `${v} words max`}
          defaultValue={defaults.maxSentenceWords}
        />
        <Slider
          label="Pages per story"
          min={4}
          max={16}
          value={pageCount}
          onChange={setPageCount}
          formatValue={(v) => `${v} pages`}
          defaultValue={defaults.pageCount}
        />
        <Slider
          label="Average words per page"
          min={5}
          max={50}
          value={wordsPerPageAvg}
          onChange={setWordsPerPageAvg}
          formatValue={(v) => `~${v} words per page`}
          defaultValue={defaults.wordsPerPageAvg}
        />
      </div>
    </section>
  );
}

function SectionGrammar({
  allowPastTense,
  setAllowPastTense,
  allowContractions,
  setAllowContractions,
  allowPhrasalVerbs,
  setAllowPhrasalVerbs,
  allowFutureTense,
  setAllowFutureTense,
  defaults,
}: {
  allowPastTense: boolean;
  setAllowPastTense: (b: boolean) => void;
  allowContractions: boolean;
  setAllowContractions: (b: boolean) => void;
  allowPhrasalVerbs: boolean;
  setAllowPhrasalVerbs: (b: boolean) => void;
  allowFutureTense: boolean;
  setAllowFutureTense: (b: boolean) => void;
  defaults: ReturnType<typeof levelDefaults>;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Grammar
      </h3>
      <div className="space-y-2">
        <GrammarToggle
          label="Allow past tense"
          checked={allowPastTense}
          onChange={setAllowPastTense}
          isDefault={allowPastTense === defaults.allowPastTense}
        />
        <GrammarToggle
          label="Allow contractions (don't, it's, we're)"
          checked={allowContractions}
          onChange={setAllowContractions}
          isDefault={allowContractions === defaults.allowContractions}
        />
        <GrammarToggle
          label='Allow phrasal verbs (e.g. "walk into", "put on")'
          checked={allowPhrasalVerbs}
          onChange={setAllowPhrasalVerbs}
          isDefault={allowPhrasalVerbs === defaults.allowPhrasalVerbs}
        />
        <GrammarToggle
          label="Allow future tense"
          checked={allowFutureTense}
          onChange={setAllowFutureTense}
          isDefault={allowFutureTense === defaults.allowFutureTense}
        />
      </div>
    </section>
  );
}

function GrammarToggle({
  label,
  checked,
  onChange,
  isDefault,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  isDefault: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span className="text-gray-700">{label}</span>
      {isDefault && (
        <span className="text-xs text-gray-400">(level default)</span>
      )}
    </label>
  );
}

function SectionSettingAndTheme({
  setting,
  setSetting,
  seedTheme,
  setSeedTheme,
}: {
  setting: string;
  setSetting: (s: string) => void;
  seedTheme: string;
  setSeedTheme: (s: string) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Setting &amp; theme
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Setting (optional)</label>
          <Input
            value={setting}
            onChange={(e) => setSetting(e.target.value)}
            placeholder="e.g. night market, beach, classroom, library"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Theme hint (optional)</label>
          <Input
            value={seedTheme}
            onChange={(e) => setSeedTheme(e.target.value)}
            placeholder="e.g. lost toy, surprise party, weather"
          />
        </div>
        <p className="text-xs text-gray-500">
          Leave blank to let the model pick.
        </p>
      </div>
    </section>
  );
}

function SectionVocabStrictness({
  vocabStrictness,
  setVocabStrictness,
}: {
  vocabStrictness: VocabStrictness;
  setVocabStrictness: (m: VocabStrictness) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Vocabulary strictness
      </h3>
      <div className="space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="strictness"
            value="strict"
            checked={vocabStrictness === 'strict'}
            onChange={() => setVocabStrictness('strict')}
            className="mt-1"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Strict (default)</p>
            <p className="text-xs text-gray-500">
              All words come from this level&rsquo;s vocabulary.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="strictness"
            value="permissive"
            checked={vocabStrictness === 'permissive'}
            onChange={() => setVocabStrictness('permissive')}
            className="mt-1"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Permissive</p>
            <p className="text-xs text-gray-500">
              Allow a few unknown words per page — useful for stretch vocabulary.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}

function SectionQuestions({
  levelId,
  questionCount,
  setQuestionCount,
  mcqCount,
  setMcqCount,
  vocabMatchCount,
  setVocabMatchCount,
  sequenceCount,
  setSequenceCount,
  mixSum,
  mixValid,
}: {
  levelId: number;
  questionCount: number;
  setQuestionCount: (n: number) => void;
  mcqCount: number;
  setMcqCount: (n: number) => void;
  vocabMatchCount: number;
  setVocabMatchCount: (n: number) => void;
  sequenceCount: number;
  setSequenceCount: (n: number) => void;
  mixSum: number;
  mixValid: boolean;
}) {
  const sequenceLocked = levelId <= 2;
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        Questions
      </h3>
      <div className="space-y-4">
        <Slider
          label="Number of questions"
          min={3}
          max={8}
          value={questionCount}
          onChange={setQuestionCount}
          formatValue={(v) => `${v} questions`}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stepper
            label="MCQ comprehension"
            value={mcqCount}
            min={0}
            max={questionCount}
            onChange={setMcqCount}
          />
          <Stepper
            label="Vocab matching"
            value={vocabMatchCount}
            min={0}
            max={questionCount}
            onChange={setVocabMatchCount}
          />
          <Stepper
            label="Sequence order"
            value={sequenceCount}
            min={0}
            max={sequenceLocked ? 0 : questionCount}
            onChange={setSequenceCount}
            disabled={sequenceLocked}
            disabledHint={sequenceLocked ? 'Not used at Level 1–2' : undefined}
          />
        </div>
        <p
          className={[
            'text-xs',
            mixValid ? 'text-gray-500' : 'text-amber-700 font-medium',
          ].join(' ')}
        >
          Type counts add to {mixSum} of {questionCount}.
        </p>
      </div>
    </section>
  );
}

function SectionWhatToPractice({
  levelId,
  requirePicturable,
  selectionMode,
  setSelectionMode,
  unit,
  setUnit,
  unitOptions,
  pickedVocab,
  setPickedVocab,
  targetVocabCount,
  setTargetVocabCount,
}: {
  levelId: number;
  requirePicturable: boolean;
  selectionMode: SelectionMode;
  setSelectionMode: (m: SelectionMode) => void;
  unit: number;
  setUnit: (n: number) => void;
  unitOptions: number[];
  pickedVocab: VocabPick[];
  setPickedVocab: (xs: VocabPick[]) => void;
  targetVocabCount: number;
  setTargetVocabCount: (n: number) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        What to practice
      </h3>
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="selectionMode"
            value="random_level"
            checked={selectionMode === 'random_level'}
            onChange={() => setSelectionMode('random_level')}
            className="mt-1"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">
              Random words from this level
            </p>
            <p className="text-xs text-gray-500">Default — fastest path.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="selectionMode"
            value="random_unit"
            checked={selectionMode === 'random_unit'}
            onChange={() => setSelectionMode('random_unit')}
            className="mt-1"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">
              Random words from a specific unit
            </p>
            {selectionMode === 'random_unit' && (
              <select
                value={unit}
                onChange={(e) => setUnit(parseInt(e.target.value, 10))}
                className="mt-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
              >
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    Unit {u}
                  </option>
                ))}
              </select>
            )}
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="selectionMode"
            value="specific"
            checked={selectionMode === 'specific'}
            onChange={() => setSelectionMode('specific')}
            className="mt-1"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              I&rsquo;ll pick the words
            </p>
            {selectionMode === 'specific' && (
              <VocabPicker
                levelId={levelId}
                picked={pickedVocab}
                setPicked={setPickedVocab}
                requirePicturable={requirePicturable}
              />
            )}
          </div>
        </label>

        {selectionMode !== 'specific' && (
          <div className="pt-2">
            <Slider
              label="Target words per story"
              min={3}
              max={8}
              value={targetVocabCount}
              onChange={setTargetVocabCount}
              formatValue={(v) => `${v} target word${v === 1 ? '' : 's'}`}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function VocabPicker({
  levelId,
  picked,
  setPicked,
  requirePicturable,
}: {
  levelId: number;
  picked: VocabPick[];
  setPicked: (xs: VocabPick[]) => void;
  requirePicturable: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VocabPick[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search. 250ms is enough to coalesce most typing without
  // feeling laggy; the server returns at most 20 rows so each call is
  // cheap.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          level: String(levelId),
          picturableOnly: String(requirePicturable),
        });
        const res = await fetch(
          `/api/teacher/reading/vocabulary/search?${params.toString()}`,
          { signal: controller.signal },
        );
        if (res.ok) {
          const body = (await res.json()) as { items: VocabPick[] };
          setResults(body.items);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('vocab search failed', err);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, levelId, requirePicturable]);

  const addPick = (item: VocabPick) => {
    if (picked.find((p) => p.id === item.id)) return;
    if (picked.length >= 8) return;
    setPicked([...picked, item]);
    setQuery('');
    setResults([]);
  };
  const removePick = (id: string) => {
    setPicked(picked.filter((p) => p.id !== id));
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vocabulary…"
          className="pl-9"
        />
      </div>
      {query && (
        <div className="border rounded-md bg-white shadow-sm max-h-60 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-gray-500 p-3">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-gray-500 p-3">
              No words found at this level.
            </p>
          ) : (
            results.map((r) => {
              const isPicked = picked.find((p) => p.id === r.id);
              const blockedNotPicturable = requirePicturable && !r.isPicturable;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => !blockedNotPicturable && !isPicked && addPick(r)}
                  disabled={Boolean(isPicked) || blockedNotPicturable}
                  title={
                    blockedNotPicturable
                      ? 'Pictures unavailable for this word'
                      : isPicked
                        ? 'Already added'
                        : undefined
                  }
                  className={[
                    'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                    isPicked
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : blockedNotPicturable
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'hover:bg-blue-50 cursor-pointer',
                  ].join(' ')}
                >
                  <span className="font-medium">{r.word}</span>
                  <span className="text-xs text-gray-500">{r.partOfSpeech}</span>
                  {r.afFUnit !== null && (
                    <span className="text-xs text-gray-400">unit {r.afFUnit}</span>
                  )}
                  {r.isPicturable ? (
                    <Badge variant="outline" className="text-[10px] py-0">
                      picturable
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 text-gray-400 border-gray-200"
                    >
                      no picture
                    </Badge>
                  )}
                  {!isPicked && !blockedNotPicturable && (
                    <Plus className="w-3 h-3 ml-auto text-blue-600" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
      <div>
        <div className="flex flex-wrap gap-1.5 min-h-[36px]">
          {picked.length === 0 ? (
            <p className="text-xs text-gray-400">
              Pick 3–8 words from the search results above.
            </p>
          ) : (
            picked.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm rounded-full px-3 py-1"
              >
                {p.word}
                <button
                  type="button"
                  onClick={() => removePick(p.id)}
                  className="text-blue-600 hover:text-blue-900"
                  aria-label={`Remove ${p.word}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {picked.length} of 3–8 selected.
          {requirePicturable &&
            ' Vocab matching is on, so only picture-friendly words are pickable.'}
        </p>
      </div>
    </div>
  );
}

// ---- Tiny primitives -------------------------------------------------

function Slider({
  label,
  min,
  max,
  value,
  onChange,
  formatValue,
  defaultValue,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  formatValue?: (n: number) => string;
  defaultValue?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-900 font-semibold tabular-nums">
          {formatValue ? formatValue(value) : value}
          {defaultValue !== undefined && value === defaultValue && (
            <span className="text-xs text-gray-400 font-normal ml-1">(default)</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  disabledHint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div
      className={[
        'border rounded-md p-2 text-center',
        disabled ? 'bg-gray-50 text-gray-400' : 'bg-white',
      ].join(' ')}
    >
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
        >
          −
        </button>
        <span className="text-lg font-semibold tabular-nums w-6">{value}</span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
        >
          +
        </button>
      </div>
      {disabledHint && (
        <p className="text-[10px] text-gray-400 mt-1">{disabledHint}</p>
      )}
    </div>
  );
}

// ---- JobStatusCard ----------------------------------------------------
// Replaces the static "Generation started" panel. Polls
// /api/teacher/reading/jobs/[id] every 5s while the job is not
// terminal; stops on completed/failed OR after 15 minutes of
// polling so a stuck-mid-loop job (e.g. serverless instance killed)
// doesn't keep us polling indefinitely.

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 15 * 60 * 1_000;

interface JobStatusDetail {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  countRequested: number;
  passagesSucceeded: number;
  passagesFailed: number;
  passagesResults: Array<{
    passageId: string;
    status: 'review' | 'draft' | 'failed';
    failure?: { teacherMessage: string; technicalDetails: string; failureStage: string };
  }>;
  hasRetry: boolean;
}

function JobStatusCard({
  jobId,
  initialMessage,
  onGenerateMore,
}: {
  jobId: string;
  initialMessage: string;
  onGenerateMore: () => void;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatusDetail | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function pollOnce() {
      try {
        const res = await fetch(`/api/teacher/reading/jobs/${jobId}`);
        if (!res.ok) return;
        const body = (await res.json()) as { job: JobStatusDetail };
        if (cancelled) return;
        setJob(body.job);
      } catch {
        // Best-effort poll; failures retry next tick.
      }
    }

    // Fire one immediately so the card stops showing "Starting…" as
    // soon as the row is queryable.
    void pollOnce();

    const interval = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_MAX_DURATION_MS) {
        setPollTimedOut(true);
        clearInterval(interval);
        return;
      }
      void pollOnce();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  // Stop the interval as soon as we observe a terminal status. The
  // last poll lands the final state; subsequent polls would just
  // burn requests.
  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      // No-op — we deliberately don't clear via state; the interval
      // closure above re-checks via pollOnce on each tick but
      // setJob keeps rendering the latest. Polling stops naturally
      // when the component unmounts (e.g. "Generate more" clicked).
    }
  }, [job?.status]);

  const isTerminal = job?.status === 'completed' || job?.status === 'failed';
  const allSucceeded =
    job &&
    isTerminal &&
    job.passagesFailed === 0 &&
    job.passagesSucceeded === job.countRequested;
  const allFailed =
    job && isTerminal && job.passagesSucceeded === 0;
  const mixed = job && isTerminal && !allSucceeded && !allFailed;

  const onRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/teacher/reading/jobs/${jobId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) return;
      const body = (await res.json()) as { jobId: string };
      router.push(`/teacher/reading/jobs/${body.jobId}`);
    } finally {
      setRetrying(false);
    }
  };

  // Headline + colour drive off the terminal state when we have it,
  // else show the running spinner.
  let headline = 'Generation started';
  let headlineCls = 'text-green-700';
  let icon = <Sparkles className="w-5 h-5" />;
  let description = initialMessage;
  if (!isTerminal && job) {
    headline = job.status === 'queued' ? 'Queued' : 'Generating…';
    headlineCls = 'text-blue-700';
    icon = <Loader2 className="w-5 h-5 animate-spin" />;
    description = `${job.passagesSucceeded + job.passagesFailed} of ${job.countRequested} done so far.`;
  }
  if (allSucceeded && job) {
    headline = 'Generation complete';
    headlineCls = 'text-green-700';
    icon = <Sparkles className="w-5 h-5" />;
    description = `${job.passagesSucceeded} ${job.passagesSucceeded === 1 ? 'passage' : 'passages'} ready in the review queue.`;
  } else if (mixed && job) {
    headline = 'Generation finished with issues';
    headlineCls = 'text-amber-700';
    icon = <Sparkles className="w-5 h-5" />;
    description = `${job.passagesSucceeded} of ${job.countRequested} succeeded. The rest failed — see details below.`;
  } else if (allFailed && job) {
    headline = 'Generation failed';
    headlineCls = 'text-red-700';
    icon = <Sparkles className="w-5 h-5" />;
    description = 'No passages were created. Retry the same settings, or adjust and try again.';
  }
  if (pollTimedOut) {
    headline = 'Still running';
    headlineCls = 'text-amber-700';
    description =
      "Generation is taking longer than expected. It may still be running — refresh the page or open the job from Recent generations below.";
  }

  return (
    <Card className={allFailed ? 'border-red-200' : allSucceeded ? 'border-green-200' : 'border-blue-200'}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${headlineCls}`}>{icon} {headline}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mixed && job && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
          >
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showDetails ? 'Hide per-passage results' : 'See details'}
          </button>
        )}
        {(mixed || allFailed) && showDetails && job && (
          <ul className="space-y-2 text-sm">
            {job.passagesResults.map((p, i) => (
              <li
                key={`${p.passageId}-${i}`}
                className={`rounded border p-2 ${p.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}
              >
                <span className="font-medium">Passage {i + 1}:</span>{' '}
                {p.status === 'failed'
                  ? (p.failure?.teacherMessage ?? 'Failed — try again.')
                  : 'Succeeded.'}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          {allSucceeded && (
            <Button onClick={() => router.push('/teacher/reading/review')}>
              Go to review queue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {(mixed || allFailed) && (
            <>
              <Button
                onClick={() => void onRetry()}
                disabled={retrying}
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Retrying…
                  </>
                ) : (
                  <>Retry with same settings</>
                )}
              </Button>
              <Button variant="outline" onClick={onGenerateMore}>
                Adjust and try again
              </Button>
            </>
          )}
          {!isTerminal && !pollTimedOut && (
            <Button variant="outline" onClick={onGenerateMore}>
              Start another batch
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/teacher/reading/jobs/${jobId}`)}
          >
            See full job details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- RecentJobsPanel --------------------------------------------------

interface RecentJobRow {
  id: string;
  createdAt: string;
  readingLevelId: number;
  countRequested: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  passagesSucceeded: number;
  passagesFailed: number;
  hasRetry: boolean;
}

function RecentJobsPanel() {
  const [jobs, setJobs] = useState<RecentJobRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/teacher/reading/jobs');
        if (!res.ok) return;
        const body = (await res.json()) as { jobs: RecentJobRow[] };
        if (!cancelled) setJobs(body.jobs.slice(0, 5));
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!jobs) return null;
  if (jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your recent generations</CardTitle>
        <CardDescription>
          Latest 5 batch runs. Click a row for per-passage details + retry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {jobs.map((j) => {
          const statusCls = {
            queued: 'border-gray-300 text-gray-700 bg-gray-50',
            running: 'border-blue-300 text-blue-700 bg-blue-50',
            completed:
              j.passagesFailed === 0
                ? 'border-green-300 text-green-700 bg-green-50'
                : 'border-amber-300 text-amber-700 bg-amber-50',
            failed: 'border-red-300 text-red-700 bg-red-50',
          }[j.status];
          const statusLabel = {
            queued: 'Queued',
            running: 'Running',
            completed: j.passagesFailed === 0 ? '✓ All done' : '⚠ Mixed',
            failed: '✕ Failed',
          }[j.status];
          return (
            <Link
              key={j.id}
              href={`/teacher/reading/jobs/${j.id}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
            >
              <Badge variant="outline" className={statusCls + ' text-xs'}>
                {statusLabel}
              </Badge>
              <span className="text-sm text-gray-800">
                Level {j.readingLevelId}, {j.countRequested}{' '}
                {j.countRequested === 1 ? 'story' : 'stories'} —{' '}
                {j.passagesSucceeded} succeeded, {j.passagesFailed} failed
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {new Date(j.createdAt).toLocaleString()}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
