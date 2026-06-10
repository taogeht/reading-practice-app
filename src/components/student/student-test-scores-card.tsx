'use client';

import { ReadAloudLabel } from '@/components/student/read-aloud-label';

export type StudentTestScore = {
  testId: string;
  testName: string;
  testType: string;
  testDate: string | null;
  score: number | null;
};

// Colour + emoji band for a percentage. Kept warm and encouraging for a 6-7yo:
// even a low score gets a "keep going" 💪 rather than anything red-alarm.
function band(score: number) {
  if (score >= 85) return { bg: 'bg-emerald-50 border-emerald-200', pill: 'bg-emerald-500', emoji: '🌟' };
  if (score >= 70) return { bg: 'bg-sky-50 border-sky-200', pill: 'bg-sky-500', emoji: '👍' };
  if (score >= 50) return { bg: 'bg-amber-50 border-amber-200', pill: 'bg-amber-500', emoji: '🙂' };
  return { bg: 'bg-rose-50 border-rose-200', pill: 'bg-rose-400', emoji: '💪' };
}

export function StudentTestScoresCard({ scores }: { scores: StudentTestScore[] }) {
  const withScores = scores.filter((s) => s.score != null).slice(0, 6);

  return (
    <section className="kid-rise rounded-3xl border-2 border-sky-100 bg-white/70 p-5">
      <div className="mb-3">
        <ReadAloudLabel id="scores.title" size="lg" tone="sky" />
      </div>

      {withScores.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <span className="text-2xl" aria-hidden>📋</span>
          <ReadAloudLabel id="scores.none" size="md" showSpeaker={false} />
        </div>
      ) : (
        <ul className="space-y-2">
          {withScores.map((s) => {
            const pct = Math.round(s.score as number);
            const b = band(pct);
            return (
              <li
                key={s.testId}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${b.bg}`}
              >
                <span className="min-w-0">
                  <span className="block font-[family-name:var(--font-kid-display)] font-semibold text-slate-800 truncate">
                    {s.testName}
                  </span>
                  {s.testDate && <span className="block text-xs text-slate-400">{s.testDate}</span>}
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  <span className="text-xl" aria-hidden>{b.emoji}</span>
                  <span className={`grid place-items-center rounded-full px-3 py-1 text-white font-bold ${b.pill}`}>
                    {pct}%
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
