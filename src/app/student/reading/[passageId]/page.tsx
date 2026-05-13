'use client';

// Student-facing reader for one passage. Three phases:
//   1. reader    — page-by-page prose + image, swipe or button nav
//   2. questions — one question per screen with immediate feedback
//   3. summary   — score + return-to-library
//
// Auto-resumes from the most recent in_progress session for this
// (student, passage) — phase + cursor are derived from session
// pagesViewed / questionsAnswered.
//
// Gestures: native touchstart/touchend handler (~10 lines, no deps).
// Page slide animation is a CSS transform driven by a per-direction
// key prop on the inner container; React's keyed remount triggers a
// fresh transition on each page change.

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Home,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useHeartbeat } from '@/hooks/use-heartbeat';
import { PageRecordingPanel } from '@/components/recordings/page-recording-panel';

// ---------- Types ----------

interface PageRow {
  pageNumber: number;
  text: string;
  imageUrl: string;
}
interface MCQQuestion {
  id: string;
  type: 'mcq_comprehension';
  questionText: string;
  orderIndex: number;
  payload: { options: string[] };
}
interface VocabPair {
  word: string;
  vocabId: string;
  imageUrl: string;
}
interface VocabQuestion {
  id: string;
  type: 'vocab_matching';
  questionText: string;
  orderIndex: number;
  payload: { version: number; pairs: VocabPair[] };
}
interface SequenceQuestion {
  id: string;
  type: 'sequence_order';
  questionText: string;
  orderIndex: number;
  payload: { events: string[] };
}
type Question = MCQQuestion | VocabQuestion | SequenceQuestion;

interface PassageData {
  passage: { id: string; title: string; pageCount: number; readingLevel: number };
  pages: PageRow[];
  questions: Question[];
}
interface SessionData {
  sessionId: string;
  resumed: boolean;
  pagesViewed: number;
  questionsAnswered: number;
}

interface AnswerOutcome {
  isCorrect: boolean;
  correctAnswer:
    | { correctIndex: number }
    | { pairings: Array<{ wordVocabId: string; pictureVocabId: string }> }
    | { eventOrder: number[] };
}

type Phase = 'reader' | 'questions' | 'summary';

// ---------- Page ----------

export default function StudentReadingPassagePage({
  params,
}: {
  params: Promise<{ passageId: string }>;
}) {
  const { passageId } = use(params);
  const router = useRouter();
  useHeartbeat();

  const [data, setData] = useState<PassageData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resumeToastVisible, setResumeToastVisible] = useState(false);

  const [phase, setPhase] = useState<Phase>('reader');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());

  // Used to drive the slide animation direction: forward vs back.
  const [pageSlideDirection, setPageSlideDirection] = useState<1 | -1>(1);

  // Per-question answer state (one entry per answered question).
  const [answers, setAnswers] = useState<
    Record<string, { isCorrect: boolean; correctAnswer: AnswerOutcome['correctAnswer'] }>
  >({});

  // Final summary numbers (from /complete response).
  const [summary, setSummary] = useState<{
    questionsCorrect: number;
    totalQuestions: number;
  } | null>(null);

  // ---- Initial load: fetch passage + start/resume session ----
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/student/reading/passages/${passageId}`),
        fetch('/api/student/reading/sessions/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passageId }),
        }),
      ]);
      if (!pRes.ok) {
        const body = await pRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${pRes.status}`);
      }
      if (!sRes.ok) {
        const body = await sRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${sRes.status}`);
      }
      const passageData: PassageData = await pRes.json();
      const sessionData: SessionData = await sRes.json();
      setData(passageData);
      setSession(sessionData);

      // Derive starting phase + cursor from session counters.
      const totalQuestions = passageData.questions.length;
      if (sessionData.questionsAnswered >= totalQuestions && totalQuestions > 0) {
        // Already answered everything — go straight to summary by
        // calling /complete (idempotent if status is already
        // 'completed', but in_progress→completed is the common path).
        await finalise(sessionData.sessionId);
      } else if (
        sessionData.questionsAnswered > 0 ||
        sessionData.pagesViewed >= passageData.passage.pageCount
      ) {
        setPhase('questions');
        setCurrentQuestionIndex(sessionData.questionsAnswered);
        setQuestionStartedAt(Date.now());
      } else {
        setPhase('reader');
        // pagesViewed is "pages advanced past" → 0-indexed cursor.
        setCurrentPageIndex(
          Math.min(sessionData.pagesViewed, Math.max(0, passageData.passage.pageCount - 1)),
        );
      }
      if (sessionData.resumed) {
        setResumeToastVisible(true);
        // Auto-dismiss after 4s; the kid can also tap × to close.
        setTimeout(() => setResumeToastVisible(false), 4000);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load story');
    } finally {
      setLoading(false);
    }
  }, [passageId]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passageId]);

  // ---- /complete + summary ----
  const finalise = useCallback(
    async (sid: string) => {
      try {
        const res = await fetch(
          `/api/student/reading/sessions/${sid}/complete`,
          { method: 'POST' },
        );
        if (res.ok) {
          const body = (await res.json()) as {
            questionsCorrect: number;
            totalQuestions: number;
          };
          setSummary({
            questionsCorrect: body.questionsCorrect,
            totalQuestions: body.totalQuestions,
          });
        }
      } catch {
        // Fallback to client-side counts if /complete fails — the
        // session row is still authoritative on the server.
        setSummary({
          questionsCorrect: Object.values(answers).filter((a) => a.isCorrect).length,
          totalQuestions: data?.questions.length ?? 0,
        });
      }
      setPhase('summary');
    },
    // answers + data participate via fallback only; recreating on every
    // change isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---- Reader navigation ----
  const goNextPage = useCallback(() => {
    if (!data || !session) return;
    const nextIdx = currentPageIndex + 1;
    if (nextIdx >= data.pages.length) {
      // Move to questions phase. Track pages viewed (the new ceiling
      // is full pageCount) and the question start time.
      setPhase('questions');
      setCurrentQuestionIndex(0);
      setQuestionStartedAt(Date.now());
      void fetch(
        `/api/student/reading/sessions/${session.sessionId}/progress`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagesViewed: data.pages.length }),
        },
      );
      return;
    }
    setPageSlideDirection(1);
    setCurrentPageIndex(nextIdx);
    void fetch(
      `/api/student/reading/sessions/${session.sessionId}/progress`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagesViewed: nextIdx }),
      },
    );
  }, [currentPageIndex, data, session]);

  const goPrevPage = useCallback(() => {
    if (currentPageIndex === 0) return;
    setPageSlideDirection(-1);
    setCurrentPageIndex((i) => Math.max(0, i - 1));
  }, [currentPageIndex]);

  // ---- Touch gesture handler (native, no deps) ----
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    // 50px threshold filters out scroll-y noise + accidental pokes.
    if (dx < -50) goNextPage();
    else if (dx > 50) goPrevPage();
  };

  // ---- Start over ----
  const startOver = useCallback(async () => {
    if (!session) return;
    if (!confirm('Start this story over? Your progress will be reset.')) return;
    try {
      const res = await fetch('/api/student/reading/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageId, force: true }),
      });
      if (!res.ok) throw new Error('Failed to restart');
      const newSession: SessionData = await res.json();
      setSession(newSession);
      setAnswers({});
      setSummary(null);
      setPhase('reader');
      setCurrentPageIndex(0);
      setCurrentQuestionIndex(0);
      setResumeToastVisible(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restart');
    }
  }, [passageId, session]);

  // ---- Question submission ----
  const submitAnswer = useCallback(
    async (
      question: Question,
      answerGiven: unknown,
    ): Promise<AnswerOutcome | null> => {
      if (!session) return null;
      const timeSeconds = Math.max(
        0,
        Math.round((Date.now() - questionStartedAt) / 1000),
      );
      try {
        const res = await fetch(
          `/api/student/reading/sessions/${session.sessionId}/answer`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionId: question.id,
              answerGiven,
              timeSeconds,
            }),
          },
        );
        if (!res.ok) {
          // 409 (already answered): pretend it was correct so the kid
          // can advance. Server-side stats are unaffected because the
          // first answer already counted.
          if (res.status === 409) {
            return {
              isCorrect: false,
              correctAnswer: { correctIndex: -1 },
            };
          }
          // One silent retry for transient failures.
          await new Promise((r) => setTimeout(r, 300));
          const retry = await fetch(
            `/api/student/reading/sessions/${session.sessionId}/answer`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                questionId: question.id,
                answerGiven,
                timeSeconds,
              }),
            },
          );
          if (!retry.ok) {
            throw new Error('Could not save answer. Try again?');
          }
          const body = (await retry.json()) as AnswerOutcome;
          return body;
        }
        const body = (await res.json()) as AnswerOutcome;
        return body;
      } catch {
        return null;
      }
    },
    [questionStartedAt, session],
  );

  const advanceFromQuestion = useCallback(async () => {
    if (!data || !session) return;
    const total = data.questions.length;
    if (currentQuestionIndex + 1 >= total) {
      await finalise(session.sessionId);
    } else {
      setCurrentQuestionIndex((i) => i + 1);
      setQuestionStartedAt(Date.now());
    }
  }, [currentQuestionIndex, data, session, finalise]);

  // ---- Render ----

  if (loading) {
    return <FullPageSkeleton />;
  }
  if (loadError || !data || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl border p-6 text-center max-w-sm w-full">
          <p className="text-gray-700 font-medium">
            Couldn&apos;t load this story.
          </p>
          {loadError && (
            <p className="text-xs text-gray-500 mt-1">{loadError}</p>
          )}
          <button
            type="button"
            onClick={() => void loadAll()}
            className="mt-4 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium active:scale-95"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-3 py-3 flex items-center gap-3">
          {/* Two left-side links so a kid mid-reader has both the
              "go back to the list" affordance (← Library) and a
              direct one-tap home button. The Home icon is always
              visible; the "Library" label hides on mobile to save
              width but the arrow stays. */}
          <div className="flex items-center gap-2">
            <Link
              href="/student/dashboard"
              className="inline-flex items-center text-blue-700 hover:text-blue-900 active:scale-95"
              aria-label="Back to dashboard"
            >
              <Home className="w-5 h-5" />
            </Link>
            <span className="text-gray-300" aria-hidden>
              |
            </span>
            <Link
              href="/student/reading"
              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 active:scale-95"
              aria-label="Back to library"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">Library</span>
            </Link>
          </div>
          <div className="flex-1 min-w-0 text-center">
            <p className="text-sm text-gray-500 truncate">{data.passage.title}</p>
            {phase === 'reader' && (
              <p className="text-xs text-gray-400">
                Page {currentPageIndex + 1} of {data.pages.length}
              </p>
            )}
            {phase === 'questions' && (
              <p className="text-xs text-gray-400">
                Question {currentQuestionIndex + 1} of {data.questions.length}
              </p>
            )}
          </div>
          {phase === 'reader' && (
            <button
              type="button"
              onClick={() => void startOver()}
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
              aria-label="Start over"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Start over</span>
            </button>
          )}
        </div>
      </header>

      {/* Resume toast */}
      {resumeToastVisible && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-blue-600 text-white text-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Continuing from where you left off
          <button
            type="button"
            onClick={() => setResumeToastVisible(false)}
            className="ml-2 text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main
        className="max-w-4xl mx-auto px-4 py-6"
        onTouchStart={phase === 'reader' ? onTouchStart : undefined}
        onTouchEnd={phase === 'reader' ? onTouchEnd : undefined}
      >
        {phase === 'reader' && (
          <ReaderView
            passageId={passageId}
            page={data.pages[currentPageIndex]!}
            currentIndex={currentPageIndex}
            totalPages={data.pages.length}
            slideDirection={pageSlideDirection}
            onPrev={goPrevPage}
            onNext={goNextPage}
          />
        )}
        {phase === 'questions' && data.questions[currentQuestionIndex] && (
          <QuestionView
            key={data.questions[currentQuestionIndex]!.id}
            question={data.questions[currentQuestionIndex]!}
            onAnswered={async (answerGiven) => {
              const outcome = await submitAnswer(
                data.questions[currentQuestionIndex]!,
                answerGiven,
              );
              if (outcome) {
                setAnswers((prev) => ({
                  ...prev,
                  [data.questions[currentQuestionIndex]!.id]: outcome,
                }));
              }
              return outcome;
            }}
            onContinue={() => void advanceFromQuestion()}
          />
        )}
        {phase === 'summary' && summary && (
          <SummaryView
            questionsCorrect={summary.questionsCorrect}
            totalQuestions={summary.totalQuestions}
            onAnother={() => router.push('/student/reading')}
            onAgain={() => void startOver()}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Reader sub-view ----------

function ReaderView({
  passageId,
  page,
  currentIndex,
  totalPages,
  slideDirection,
  onPrev,
  onNext,
}: {
  passageId: string;
  page: PageRow;
  currentIndex: number;
  totalPages: number;
  slideDirection: 1 | -1;
  onPrev: () => void;
  onNext: () => void;
}) {
  const isLast = currentIndex === totalPages - 1;
  // Keyed wrapper triggers a fresh CSS transition on each page change.
  // The `data-direction` attribute drives the slide direction in the
  // (very compact) animation classes below.
  return (
    <div className="space-y-6">
      <div
        key={page.pageNumber}
        data-direction={slideDirection}
        className="animate-page-in"
      >
        {page.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.imageUrl}
            alt={`Page ${page.pageNumber}`}
            className="w-full max-w-2xl mx-auto aspect-square object-cover rounded-2xl shadow-md bg-gray-100"
            draggable={false}
          />
        ) : (
          <div className="w-full max-w-2xl mx-auto aspect-square rounded-2xl bg-gray-100 shadow-inner" />
        )}
        <p className="mt-6 text-lg sm:text-xl lg:text-2xl leading-relaxed text-gray-900 max-w-2xl mx-auto whitespace-pre-wrap">
          {page.text}
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <PageRecordingPanel passageId={passageId} pageNumber={page.pageNumber} />
      </div>

      <nav className="flex items-center justify-between pt-4 max-w-2xl mx-auto">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Previous
        </button>
        <div className="flex gap-1.5">
          {Array.from({ length: totalPages }).map((_, i) => (
            <span
              key={i}
              className={[
                'w-2 h-2 rounded-full transition-colors',
                i === currentIndex ? 'bg-blue-600' : 'bg-gray-300',
              ].join(' ')}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium bg-blue-600 text-white shadow-sm active:scale-95"
        >
          {isLast ? 'Questions' : 'Next'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </nav>

      <style jsx>{`
        .animate-page-in[data-direction='1'] {
          animation: slideInRight 280ms ease-out;
        }
        .animate-page-in[data-direction='-1'] {
          animation: slideInLeft 280ms ease-out;
        }
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

// ---------- Question sub-view ----------

function QuestionView({
  question,
  onAnswered,
  onContinue,
}: {
  question: Question;
  onAnswered: (answerGiven: unknown) => Promise<AnswerOutcome | null>;
  onContinue: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  // Per-type "what the kid currently has selected".
  const [mcqSelected, setMcqSelected] = useState<number | null>(null);
  const [vocabSelectedWord, setVocabSelectedWord] = useState<string | null>(null);
  const [vocabPairings, setVocabPairings] = useState<
    Record<string, string>
  >({}); // wordVocabId → pictureVocabId
  const [sequenceOrder, setSequenceOrder] = useState<number[]>([]);

  // Initialise sequence_order shuffled.
  useEffect(() => {
    if (question.type !== 'sequence_order') return;
    const indices = question.payload.events.map((_, i) => i);
    // Fisher-Yates shuffle.
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }
    setSequenceOrder(indices);
  }, [question]);

  // Pre-shuffled picture column for vocab matching, stable across rerenders.
  const shuffledPictures = useMemo(() => {
    if (question.type !== 'vocab_matching') return [] as VocabPair[];
    const arr = [...question.payload.pairs];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }, [question]);

  // ---- Auto-advance on correct ----
  useEffect(() => {
    if (!outcome) return;
    if (!outcome.isCorrect) return; // wrong answers wait for manual continue
    const t = setTimeout(() => {
      onContinue();
    }, 1500);
    return () => clearTimeout(t);
  }, [outcome, onContinue]);

  // ---- MCQ ----
  if (question.type === 'mcq_comprehension') {
    const correctIndex =
      outcome && 'correctIndex' in outcome.correctAnswer
        ? outcome.correctAnswer.correctIndex
        : null;
    const submitMcq = async () => {
      if (mcqSelected === null || submitting) return;
      setSubmitting(true);
      const o = await onAnswered({ selectedIndex: mcqSelected });
      setSubmitting(false);
      if (o) setOutcome(o);
    };
    return (
      <div className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-center text-gray-900 max-w-2xl mx-auto">
          {question.questionText}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
          {question.payload.options.map((opt, i) => {
            const isPicked = mcqSelected === i;
            const isRight = correctIndex !== null && correctIndex === i;
            const isWrongPick = outcome && !outcome.isCorrect && isPicked;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (outcome) return;
                  setMcqSelected(i);
                }}
                disabled={!!outcome || submitting}
                className={[
                  'min-h-[80px] rounded-xl border-2 px-4 py-3 text-left flex items-center gap-3 transition active:scale-95',
                  outcome
                    ? isRight
                      ? 'bg-green-50 border-green-500'
                      : isWrongPick
                        ? 'bg-red-50 border-red-400'
                        : 'bg-white border-gray-200 opacity-60'
                    : isPicked
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-white border-gray-200 hover:border-blue-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold',
                    outcome && isRight
                      ? 'bg-green-500 text-white'
                      : isPicked
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-700',
                  ].join(' ')}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="text-base sm:text-lg text-gray-900 leading-snug">
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
        {outcome ? (
          <FeedbackBanner outcome={outcome} onContinue={onContinue} />
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void submitMcq()}
              disabled={mcqSelected === null || submitting}
              className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold disabled:opacity-40 active:scale-95"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Check answer'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Vocab matching (matched-zone pattern) ----
  // Field testing showed shared-color pairing was confusing — kids
  // couldn't keep track of which word "owned" which picture without
  // a literal connection. The new layout splits the screen in two:
  //   - Top zone: only UNMATCHED words + UNMATCHED pictures
  //   - Bottom zone "Your matches": each match rendered as a
  //     word→picture row. Tap a row to unpair.
  // Pairs animate from the top zone into the bottom zone on match
  // (and back on unpair) via simple CSS opacity+translate keyframes.
  if (question.type === 'vocab_matching') {
    const totalPairs = question.payload.pairs.length;
    const allPaired = Object.keys(vocabPairings).length === totalPairs;
    const correctMap =
      outcome && 'pairings' in outcome.correctAnswer
        ? new Map(
            outcome.correctAnswer.pairings.map((p) => [p.wordVocabId, p.pictureVocabId]),
          )
        : null;

    // O(1) lookups for unmatched filtering and "which word owns this
    // picture" rendering.
    const matchedWordIds = new Set(Object.keys(vocabPairings));
    const matchedPictureIds = new Set(Object.values(vocabPairings));
    const pairsByVocabId = new Map(
      question.payload.pairs.map((p) => [p.vocabId, p]),
    );

    const onWordTap = (vocabId: string) => {
      if (outcome) return;
      // Tap-to-toggle selection in the top zone. Already-matched words
      // can't be tapped here (they live in the bottom zone instead).
      setVocabSelectedWord((cur) => (cur === vocabId ? null : vocabId));
    };
    const onPictureTap = (pictureVocabId: string) => {
      if (outcome) return;
      // Need a selected word to pair with. (Already-matched pictures
      // never reach this handler — they don't render in the top zone.)
      if (!vocabSelectedWord) return;
      setVocabPairings((prev) => ({
        ...prev,
        [vocabSelectedWord]: pictureVocabId,
      }));
      setVocabSelectedWord(null);
    };
    const onUnpair = (wordVocabId: string) => {
      if (outcome) return;
      setVocabPairings((prev) => {
        const next = { ...prev };
        delete next[wordVocabId];
        return next;
      });
      setVocabSelectedWord(wordVocabId);
    };
    const onReset = () => {
      if (outcome) return;
      setVocabPairings({});
      setVocabSelectedWord(null);
    };
    const submitVocab = async () => {
      if (!allPaired || submitting) return;
      setSubmitting(true);
      const o = await onAnswered({
        pairings: Object.entries(vocabPairings).map(
          ([wordVocabId, pictureVocabId]) => ({ wordVocabId, pictureVocabId }),
        ),
      });
      setSubmitting(false);
      if (o) setOutcome(o);
    };

    const unmatchedWords = question.payload.pairs.filter(
      (p) => !matchedWordIds.has(p.vocabId),
    );
    const unmatchedPictures = shuffledPictures.filter(
      (p) => !matchedPictureIds.has(p.vocabId),
    );

    return (
      <div className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-center text-gray-900 max-w-2xl mx-auto">
          {question.questionText}
        </h2>

        {/* Top zone: unmatched words + pictures */}
        {(unmatchedWords.length > 0 || unmatchedPictures.length > 0) && !outcome && (
          <div className="grid grid-cols-2 gap-3 sm:gap-6 max-w-3xl mx-auto">
            <div className="space-y-2">
              {unmatchedWords.map((p) => {
                const selected = vocabSelectedWord === p.vocabId;
                return (
                  <button
                    key={p.vocabId}
                    type="button"
                    onClick={() => onWordTap(p.vocabId)}
                    className={[
                      'w-full min-h-[56px] rounded-xl border-2 px-3 py-2 font-semibold text-base sm:text-lg active:scale-95 transition vm-pop-in',
                      selected
                        ? 'bg-blue-100 border-blue-500 text-blue-900'
                        : 'bg-white border-gray-200 text-gray-900 hover:border-blue-300',
                    ].join(' ')}
                  >
                    {p.word}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {unmatchedPictures.map((pic) => (
                <button
                  key={pic.vocabId}
                  type="button"
                  onClick={() => onPictureTap(pic.vocabId)}
                  disabled={!vocabSelectedWord}
                  className={[
                    'aspect-square rounded-xl border-2 overflow-hidden bg-white active:scale-95 transition vm-pop-in',
                    vocabSelectedWord
                      ? 'border-blue-300 hover:border-blue-500 cursor-pointer'
                      : 'border-gray-200 opacity-70 cursor-not-allowed',
                  ].join(' ')}
                >
                  {pic.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pic.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      no image
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom zone: matches */}
        {Object.keys(vocabPairings).length > 0 && (
          <section className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">
                Your matches ({Object.keys(vocabPairings).length} of {totalPairs})
              </h3>
              {!outcome && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {Object.entries(vocabPairings).map(([wordVocabId, pictureVocabId]) => {
                const word = pairsByVocabId.get(wordVocabId);
                const picture = pairsByVocabId.get(pictureVocabId);
                const isCorrect =
                  correctMap && correctMap.get(wordVocabId) === pictureVocabId;
                const correctPicture =
                  outcome && !isCorrect
                    ? pairsByVocabId.get(wordVocabId)
                    : null;
                return (
                  <li
                    key={wordVocabId}
                    className={[
                      'flex items-center gap-3 rounded-xl border-2 px-3 py-2 bg-white vm-row-in',
                      outcome
                        ? isCorrect
                          ? 'border-green-500 bg-green-50'
                          : 'border-red-400 bg-red-50'
                        : 'border-gray-200',
                    ].join(' ')}
                  >
                    <span className="flex-1 font-semibold text-base sm:text-lg text-gray-900">
                      {word?.word ?? '—'}
                    </span>
                    <span className="text-gray-400 text-2xl leading-none">→</span>
                    <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border bg-gray-100 flex-shrink-0">
                      {picture?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={picture.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </span>
                    {/* Wrong-answer hint: show the correct picture
                        thumbnail next to the row so the kid can see
                        what the answer should have been without a
                        separate explanation panel. */}
                    {correctPicture && correctPicture.vocabId !== pictureVocabId && (
                      <>
                        <span className="text-green-600 text-xs font-semibold">
                          ✓
                        </span>
                        <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 border-green-500 bg-gray-100 flex-shrink-0">
                          {correctPicture.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={correctPicture.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </span>
                      </>
                    )}
                    {!outcome && (
                      <button
                        type="button"
                        onClick={() => onUnpair(wordVocabId)}
                        className="ml-1 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 text-gray-500 flex items-center justify-center"
                        aria-label={`Unpair ${word?.word ?? ''}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {outcome ? (
          <FeedbackBanner outcome={outcome} onContinue={onContinue} />
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void submitVocab()}
              disabled={!allPaired || submitting}
              className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold disabled:opacity-40 active:scale-95"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Done'}
            </button>
          </div>
        )}
        <style jsx>{`
          /* Top-zone tiles fade+slide in when they (re)appear after an
             unpair. Bottom-zone rows fade+slide UP from below for a
             "moved into the matches area" feel without a real DOM
             transition between the two zones. */
          :global(.vm-pop-in) {
            animation: vmPopIn 200ms ease-out;
          }
          :global(.vm-row-in) {
            animation: vmRowIn 240ms cubic-bezier(0.34, 1.2, 0.64, 1);
          }
          @keyframes vmPopIn {
            from {
              opacity: 0;
              transform: translateY(-6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes vmRowIn {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </div>
    );
  }

  // ---- Sequence order ----
  const events = question.payload.events;
  const moveUp = (i: number) => {
    if (i === 0 || outcome) return;
    setSequenceOrder((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });
  };
  const moveDown = (i: number) => {
    if (i === sequenceOrder.length - 1 || outcome) return;
    setSequenceOrder((prev) => {
      const next = [...prev];
      [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
      return next;
    });
  };
  const submitSequence = async () => {
    if (submitting) return;
    setSubmitting(true);
    const o = await onAnswered({ eventOrder: sequenceOrder });
    setSubmitting(false);
    if (o) setOutcome(o);
  };
  const correctOrder =
    outcome && 'eventOrder' in outcome.correctAnswer
      ? outcome.correctAnswer.eventOrder
      : null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-semibold text-center text-gray-900 max-w-2xl mx-auto">
        {question.questionText}
      </h2>
      <ol className="space-y-2 max-w-2xl mx-auto">
        {sequenceOrder.map((eventIdx, position) => {
          const isCorrectPosition =
            correctOrder !== null && correctOrder[position] === eventIdx;
          return (
            <li
              key={eventIdx}
              className={[
                'flex items-center gap-3 rounded-xl border-2 px-3 py-3 bg-white',
                outcome
                  ? isCorrectPosition
                    ? 'border-green-500 bg-green-50'
                    : 'border-red-400 bg-red-50'
                  : 'border-gray-200',
              ].join(' ')}
            >
              <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0">
                {position + 1}
              </span>
              <span className="flex-1 text-base sm:text-lg leading-snug">
                {events[eventIdx]}
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(position)}
                  disabled={position === 0 || !!outcome}
                  className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 active:scale-90 text-gray-700"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(position)}
                  disabled={position === sequenceOrder.length - 1 || !!outcome}
                  className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 active:scale-90 text-gray-700"
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {outcome ? (
        <FeedbackBanner outcome={outcome} onContinue={onContinue} />
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void submitSequence()}
            disabled={submitting}
            className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold active:scale-95 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Done'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Feedback banner ----------

function FeedbackBanner({
  outcome,
  onContinue,
}: {
  outcome: AnswerOutcome;
  onContinue: () => void;
}) {
  if (outcome.isCorrect) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 animate-pop-in">
        <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
          <Check className="w-12 h-12 text-white" strokeWidth={3} />
        </div>
        <p className="text-2xl font-bold text-green-700">Great job!</p>
        <style jsx>{`
          .animate-pop-in {
            animation: popIn 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          @keyframes popIn {
            from {
              opacity: 0;
              transform: scale(0.6);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-4 max-w-2xl mx-auto">
      <p className="text-base text-gray-700">
        Not quite — but check out the right answer above.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="px-6 py-3 rounded-full bg-blue-600 text-white font-semibold active:scale-95"
      >
        Continue
      </button>
    </div>
  );
}

// ---------- Summary ----------

function SummaryView({
  questionsCorrect,
  totalQuestions,
  onAnother,
  onAgain,
}: {
  questionsCorrect: number;
  totalQuestions: number;
  onAnother: () => void;
  onAgain: () => void;
}) {
  return (
    <div className="text-center py-8 max-w-md mx-auto">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Great reading!</h2>
      <p className="mt-2 text-lg text-gray-700">
        You got <span className="font-bold text-blue-700">{questionsCorrect}</span>{' '}
        out of {totalQuestions} right!
      </p>
      <div className="mt-6 flex justify-center gap-1.5">
        {Array.from({ length: totalQuestions }).map((_, i) => (
          <Star
            key={i}
            className={[
              'w-9 h-9 sm:w-10 sm:h-10',
              i < questionsCorrect
                ? 'fill-amber-400 text-amber-500'
                : 'fill-gray-200 text-gray-300',
            ].join(' ')}
            strokeWidth={1.5}
          />
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onAnother}
          className="px-5 py-3 rounded-full bg-blue-600 text-white font-semibold active:scale-95"
        >
          Read another story
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="px-5 py-3 rounded-full bg-white border border-gray-200 text-gray-700 font-medium active:scale-95"
        >
          Read again
        </button>
      </div>
    </div>
  );
}

// ---------- Skeleton ----------

function FullPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="h-12 bg-white rounded-xl animate-pulse" />
        <div className="aspect-square max-w-2xl mx-auto bg-gray-200 rounded-2xl animate-pulse" />
        <div className="space-y-2 max-w-2xl mx-auto">
          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4" />
          <div className="h-5 bg-gray-200 rounded animate-pulse w-2/3" />
        </div>
      </div>
    </div>
  );
}
