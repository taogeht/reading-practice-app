'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Trophy, Check, X, RotateCw, ArrowLeft } from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

type Question = {
  id: string;
  prompt: string;
  choices: string[];
};

type View =
  | { name: 'picker' }
  | { name: 'loading' }
  | { name: 'quiz'; unit: number; questions: Question[]; index: number; correctCount: number }
  | { name: 'results'; unit: number; correctCount: number; total: number }
  | { name: 'empty'; unit: number; message: string };

export function PracticeSession() {
  const [view, setView] = useState<View>({ name: 'picker' });
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startUnit = async (unit: number) => {
    setView({ name: 'loading' });
    try {
      const res = await fetch(`/api/practice/session?unit=${unit}`);
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
    if (view.name !== 'quiz' || !selected || submitting) return;
    setSubmitting(true);
    const currentQuestion = view.questions[view.index];
    try {
      const res = await fetch('/api/practice/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedAnswer: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setFeedback({ correct: data.isCorrect, correctAnswer: data.correctAnswer });
      if (data.isCorrect) {
        setView({ ...view, correctCount: view.correctCount + 1 });
      }
    } catch {
      setFeedback({ correct: false, correctAnswer: '' });
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
      setFeedback(null);
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {UNITS.map((u) => (
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
  const unitInfo = UNITS.find((u) => u.unit === view.unit);

  return (
    <Card>
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
        <div className="text-2xl sm:text-3xl font-bold text-center py-6 text-gray-900">
          {question.prompt.split('____').map((part, i, arr) => (
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
          {question.choices.map((choice) => {
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
              {feedback.correct
                ? 'Correct! Great job!'
                : `Good try! The answer was "${feedback.correctAnswer}".`}
            </div>
            <Button className="w-full py-6 text-base" onClick={nextQuestion}>
              {view.index + 1 === view.questions.length ? 'See results' : 'Next question'}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full py-6 text-base"
            disabled={!selected || submitting}
            onClick={submitAnswer}
          >
            Check answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
