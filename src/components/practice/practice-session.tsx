'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Trophy, Check, X, RotateCw, ArrowLeft, Loader2, Wand2, Sparkles } from 'lucide-react';
import type { UnitInfo } from '@/lib/practice/units';

type QuestionType = 'fill_blank_mcq' | 'true_false' | 'sentence_builder';

// Field set varies by questionType — fill_blank_mcq/true_false have prompt+choices,
// sentence_builder has tokens (and no prompt — the prompt IS the answer).
type Question = {
  id: string;
  questionType: QuestionType;
  imageUrl?: string | null;
  prompt?: string;
  choices?: string[];
  tokens?: string[];
};

type View =
  | { name: 'picker' }
  | { name: 'loading' }
  | { name: 'quiz'; unit: number; questions: Question[]; index: number; correctCount: number }
  | { name: 'results'; unit: number; correctCount: number; total: number }
  | { name: 'empty'; unit: number; message: string };

type SessionLength = 5 | 10 | 20;

export function PracticeSession() {
  const [view, setView] = useState<View>({ name: 'picker' });
  const [selected, setSelected] = useState<string | null>(null);
  // For sentence_builder: indices into the question.tokens array, in tap order.
  const [assembled, setAssembled] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    correctAnswer: string;
    xpEarned: number;
    firstTryBonus: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<UnitInfo[] | null>(null);
  const [sessionLength, setSessionLength] = useState<SessionLength>(5);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/practice/available-units');
        if (!res.ok) {
          if (!cancelled) setAvailableUnits([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setAvailableUnits(data.units || []);
      } catch {
        if (!cancelled) setAvailableUnits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startUnit = async (unit: number) => {
    setView({ name: 'loading' });
    try {
      const res = await fetch(`/api/practice/session?unit=${unit}&count=${sessionLength}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load');
      if (!data.questions || data.questions.length === 0) {
        setView({
          name: 'empty',
          unit,
          message: data.message || 'No questions yet for this unit.',
        });
        return;
      }
      setView({
        name: 'quiz',
        unit,
        questions: data.questions,
        index: 0,
        correctCount: 0,
      });
      setSelected(null);
      setAssembled([]);
      setFeedback(null);
    } catch {
      setView({
        name: 'empty',
        unit,
        message: 'Something went wrong loading questions.',
      });
    }
  };

  const submitAnswer = async () => {
    if (view.name !== 'quiz' || submitting) return;
    const currentQuestion = view.questions[view.index];
    const submission =
      currentQuestion.questionType === 'sentence_builder'
        ? assembled.map((i) => currentQuestion.tokens?.[i] ?? '').join(' ')
        : selected;
    if (!submission) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/practice/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedAnswer: submission,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setFeedback({
        correct: data.isCorrect,
        correctAnswer: data.correctAnswer,
        xpEarned: typeof data.xpEarned === 'number' ? data.xpEarned : 0,
        firstTryBonus: typeof data.firstTryBonus === 'number' ? data.firstTryBonus : 0,
      });
      if (data.isCorrect) {
        setView({ ...view, correctCount: view.correctCount + 1 });
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
      }
    } catch {
      setFeedback({ correct: false, correctAnswer: '', xpEarned: 0, firstTryBonus: 0 });
    } finally {
      setSubmitting(false);
    }
  };

  const nextQuestion = () => {
    if (view.name !== 'quiz') return;
    const nextIndex = view.index + 1;
    if (nextIndex >= view.questions.length) {
      setView({
        name: 'results',
        unit: view.unit,
        correctCount: view.correctCount,
        total: view.questions.length,
      });
    } else {
      setView({ ...view, index: nextIndex });
      setSelected(null);
      setAssembled([]);
      setFeedback(null);
      setShowConfetti(false);
    }
  };

  // --- Picker ---
  if (view.name === 'picker') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            Pick a Unit to Practice
          </CardTitle>
        </CardHeader>
        <CardContent>
          {availableUnits === null ? (
            <div className="py-8 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading units…
            </div>
          ) : availableUnits.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              No practice units are turned on for your class yet. Ask your teacher!
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm font-semibold text-gray-700">
                  How many questions?
                </div>
                <div className="inline-flex rounded-lg border-2 border-indigo-200 bg-white overflow-hidden self-start sm:self-auto">
                  {([5, 10, 20] as const).map((n) => {
                    const active = sessionLength === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSessionLength(n)}
                        className={`px-4 py-2 text-sm font-bold transition ${
                          active
                            ? 'bg-indigo-500 text-white'
                            : 'text-indigo-700 hover:bg-indigo-50'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {availableUnits.map((u) => (
                  <button
                    key={u.unit}
                    onClick={() => startUnit(u.unit)}
                    className="text-left border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition rounded-xl p-4 cursor-pointer"
                  >
                    <div className="text-3xl mb-1">{u.emoji}</div>
                    <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                      Unit {u.unit}
                    </div>
                    <div className="text-sm font-bold text-gray-900">{u.topic}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // --- Loading ---
  if (view.name === 'loading') {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-600">
          Loading your practice questions...
        </CardContent>
      </Card>
    );
  }

  // --- Empty pool ---
  if (view.name === 'empty') {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <div className="text-5xl">📝</div>
          <div className="text-lg font-semibold text-gray-800">{view.message}</div>
          <Button variant="outline" onClick={() => setView({ name: 'picker' })}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Pick another unit
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- Results ---
  if (view.name === 'results') {
    const pct = Math.round((view.correctCount / view.total) * 100);
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-5">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
          <div>
            <div className="text-4xl font-bold text-gray-900">
              {view.correctCount} / {view.total}
            </div>
            <div className="text-gray-600 mt-1">{pct}% correct</div>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => startUnit(view.unit)}>
              <RotateCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <Button variant="outline" onClick={() => setView({ name: 'picker' })}>
              Pick another unit
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Quiz ---
  const question = view.questions[view.index];
  const isAnswered = feedback !== null;
  const unitInfo = (availableUnits ?? []).find((u) => u.unit === view.unit);

  return (
    <Card className="relative overflow-hidden">
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                animationDelay: `${Math.random() * 0.4}s`,
                animationDuration: `${0.8 + Math.random() * 1.2}s`,
                fontSize: `${16 + Math.random() * 12}px`,
              }}
            >
              {['🎉', '⭐', '✨', '🌟', '💫'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-sm">
            {unitInfo?.emoji} Unit {view.unit}
          </Badge>
          <span className="text-sm font-semibold text-gray-600">
            Question {view.index + 1} of {view.questions.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {question.imageUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.imageUrl}
              alt=""
              className="max-h-56 sm:max-h-64 w-auto rounded-xl border border-gray-200 bg-white object-contain"
            />
          </div>
        )}
        {question.questionType === 'sentence_builder' ? (
          <SentenceBuilder
            tokens={question.tokens ?? []}
            assembled={assembled}
            isAnswered={isAnswered}
            onTapTray={(idx) =>
              !isAnswered && setAssembled((prev) => (prev.includes(idx) ? prev : [...prev, idx]))
            }
            onTapAssembled={(positionInAssembled) =>
              !isAnswered &&
              setAssembled((prev) => prev.filter((_, i) => i !== positionInAssembled))
            }
          />
        ) : (
          <>
            <div className="text-2xl sm:text-3xl font-bold text-center py-2 text-gray-900">
              {(question.prompt ?? '').split('____').map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className="inline-block min-w-[80px] border-b-4 border-indigo-400 mx-2">
                      &nbsp;
                    </span>
                  )}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(question.choices ?? []).map((choice) => {
                const isSelected = selected === choice;
                const isCorrectChoice =
                  feedback && feedback.correctAnswer.toLowerCase() === choice.toLowerCase();
                const isWrongSelected = isAnswered && isSelected && !feedback?.correct;

                let className =
                  'text-xl font-bold py-5 rounded-xl border-2 transition cursor-pointer ';
                if (isAnswered && isCorrectChoice) {
                  className += 'bg-green-100 border-green-500 text-green-800';
                } else if (isWrongSelected) {
                  className += 'bg-red-100 border-red-500 text-red-800';
                } else if (isSelected) {
                  className += 'bg-indigo-100 border-indigo-500 text-indigo-800';
                } else {
                  className += 'bg-white border-gray-300 hover:border-indigo-400 hover:bg-indigo-50';
                }

                return (
                  <button
                    key={choice}
                    onClick={() => !isAnswered && setSelected(choice)}
                    disabled={isAnswered}
                    className={className}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {isAnswered ? (
          <div className="space-y-3">
            <div
              className={`p-4 rounded-lg flex items-center gap-2 font-semibold ${
                feedback.correct
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}
            >
              {feedback.correct ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <span className="flex-1">
                {feedback.correct
                  ? 'Correct! Great job!'
                  : `Good try! The answer was "${feedback.correctAnswer}".`}
              </span>
              {feedback.xpEarned > 0 && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold border ${
                    feedback.correct
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  +{feedback.xpEarned} XP
                </span>
              )}
            </div>
            {feedback.correct && feedback.firstTryBonus > 0 && (
              <div className="text-center text-xs font-semibold text-amber-700">
                ✨ First correct of the day! +{feedback.firstTryBonus} bonus XP
              </div>
            )}
            <Button className="w-full py-6 text-base" onClick={nextQuestion}>
              {view.index + 1 === view.questions.length ? 'See results' : 'Next question'}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full py-6 text-base"
            disabled={
              submitting ||
              (question.questionType === 'sentence_builder'
                ? assembled.length !== (question.tokens?.length ?? 0) || assembled.length === 0
                : !selected)
            }
            onClick={submitAnswer}
          >
            Check answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface SentenceBuilderProps {
  tokens: string[];
  assembled: number[];
  isAnswered: boolean;
  onTapTray: (idx: number) => void;
  onTapAssembled: (positionInAssembled: number) => void;
}

function SentenceBuilder({ tokens, assembled, isAnswered, onTapTray, onTapAssembled }: SentenceBuilderProps) {
  const usedSet = new Set(assembled);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wide">
        <Wand2 className="w-4 h-4" />
        Build the sentence
      </div>

      {/* Assembled line — tap a placed word to send it back to the tray */}
      <div className="min-h-[64px] rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-3 flex flex-wrap items-center justify-center gap-2">
        {assembled.length === 0 ? (
          <span className="text-sm text-gray-400 italic">Tap words below to build the sentence</span>
        ) : (
          assembled.map((tokenIdx, position) => (
            <button
              key={`${tokenIdx}-${position}`}
              onClick={() => onTapAssembled(position)}
              disabled={isAnswered}
              className="text-lg sm:text-xl font-semibold px-3 py-1.5 rounded-lg bg-white border-2 border-indigo-400 text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-80 disabled:cursor-default transition"
            >
              {tokens[tokenIdx]}
            </button>
          ))
        )}
      </div>

      {/* Tray — shuffled tokens. Used ones are dimmed */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {tokens.map((tok, i) => {
          const used = usedSet.has(i);
          return (
            <button
              key={i}
              onClick={() => onTapTray(i)}
              disabled={used || isAnswered}
              className={`text-lg sm:text-xl font-semibold px-3 py-1.5 rounded-lg border-2 transition ${
                used
                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-default'
                  : 'bg-white border-gray-300 text-gray-800 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
              }`}
            >
              {tok}
            </button>
          );
        })}
      </div>
    </div>
  );
}
