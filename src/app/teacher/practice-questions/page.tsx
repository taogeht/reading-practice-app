'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

type Question = {
  id: string;
  unit: number;
  questionType: string;
  prompt: string;
  correctAnswer: string;
  distractors: string[];
  active: boolean;
  timesServed: number;
  createdAt: string;
};

export default function PracticeQuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingUnit, setGeneratingUnit] = useState<number | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/practice-questions');
      const data = await res.json();
      if (res.ok) setQuestions(data.questions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unitCounts = useMemo(() => {
    const counts = new Map<number, { active: number; total: number }>();
    for (const u of UNITS) counts.set(u.unit, { active: 0, total: 0 });
    for (const q of questions) {
      const entry = counts.get(q.unit);
      if (!entry) continue;
      entry.total += 1;
      if (q.active) entry.active += 1;
    }
    return counts;
  }, [questions]);

  const filtered = questions.filter((q) => q.unit === selectedUnit);

  const generate = async (unit: number, count = 5) => {
    setGeneratingUnit(unit);
    setError(null);
    try {
      const res = await fetch('/api/practice-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGeneratingUnit(null);
    }
  };

  const toggleActive = async (q: Question) => {
    const res = await fetch(`/api/practice-questions/${q.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !q.active }),
    });
    if (res.ok) {
      setQuestions((prev) =>
        prev.map((item) => (item.id === q.id ? { ...item, active: !item.active } : item))
      );
    }
  };

  const remove = async (q: Question) => {
    if (!confirm(`Delete this question permanently?\n\n"${q.prompt}"`)) return;
    const res = await fetch(`/api/practice-questions/${q.id}`, { method: 'DELETE' });
    if (res.ok) setQuestions((prev) => prev.filter((item) => item.id !== q.id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.push('/teacher/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Practice Questions</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Question pool by unit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {UNITS.map((u) => {
                const counts = unitCounts.get(u.unit) ?? { active: 0, total: 0 };
                const isSelected = selectedUnit === u.unit;
                return (
                  <button
                    key={u.unit}
                    onClick={() => setSelectedUnit(u.unit)}
                    className={`text-left rounded-xl p-4 border-2 transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                      Unit {u.unit}
                    </div>
                    <div className="text-sm font-bold text-gray-900">{u.topic}</div>
                    <div className="text-xs text-gray-600 mt-2">
                      {counts.active} active · {counts.total} total
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Unit {selectedUnit} — {UNITS.find((u) => u.unit === selectedUnit)?.topic}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => generate(selectedUnit, 5)}
                disabled={generatingUnit !== null}
              >
                {generatingUnit === selectedUnit ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Generate 5 more
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}
            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                No questions for this unit yet. Click Generate to create some.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((q) => (
                  <div
                    key={q.id}
                    className={`border rounded-lg p-4 ${
                      q.active ? 'bg-white' : 'bg-gray-50 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="text-base font-semibold text-gray-900">{q.prompt}</div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            {q.correctAnswer}
                          </Badge>
                          {q.distractors.map((d, i) => (
                            <Badge key={i} variant="outline" className="text-gray-600">
                              {d}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          Served {q.timesServed}× · {q.active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(q)}
                          title={q.active ? 'Deactivate' : 'Activate'}
                        >
                          {q.active ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(q)}
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
