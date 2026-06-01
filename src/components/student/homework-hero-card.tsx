'use client';

import { useRouter } from 'next/navigation';
import { Headphones, Mic, ChevronRight } from 'lucide-react';
import { ReadAloudLabel } from './read-aloud-label';
import { UI_STRINGS } from '@/lib/i18n/ui-strings';

export type HeroAssignment = {
  id: string;
  title: string;
  storyTitle: string;
  dueAt: string | null;
};

// The single dominant "what do I do now" surface. With pending homework it is a
// big warm card with ONE giant, tactile (squishy) CTA into the record flow;
// with none it flips to a celebratory empty state so the child never lands on
// a dead screen.
export function HomeworkHeroCard({
  pending,
  onReadStories,
}: {
  pending: HeroAssignment[];
  onReadStories: () => void;
}) {
  const router = useRouter();

  if (pending.length === 0) {
    return (
      <section className="kid-rise rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 sm:p-8 text-center shadow-[0_8px_0_rgba(16,185,129,0.15)]">
        <div className="text-6xl mb-2" aria-hidden>🎉</div>
        <div className="flex flex-col items-center gap-1">
          <ReadAloudLabel id="hero.allDone" size="lg" tone="emerald" />
          <p className="font-[family-name:var(--font-kid-zh)] text-slate-500" lang="zh-Hant">
            {UI_STRINGS['hero.allDoneSub'].zh}
          </p>
        </div>
        <button
          type="button"
          onClick={onReadStories}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-[family-name:var(--font-kid-display)] font-semibold text-emerald-700 border-2 border-emerald-200 shadow-[0_4px_0_rgba(16,185,129,0.2)] active:translate-y-1 active:shadow-[0_1px_0_rgba(16,185,129,0.2)] transition-all"
        >
          {UI_STRINGS['hero.readStories'].en}
          <span lang="zh-Hant" className="font-[family-name:var(--font-kid-zh)] text-emerald-500 text-sm">
            {UI_STRINGS['hero.readStories'].zh}
          </span>
        </button>
      </section>
    );
  }

  const next = pending[0];
  const rest = pending.slice(1);

  return (
    <section className="kid-rise rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5 sm:p-7 shadow-[0_8px_0_rgba(249,115,22,0.18)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-orange-500 text-white shadow-md shrink-0" aria-hidden>
          <Mic className="w-5 h-5" />
        </span>
        <ReadAloudLabel id="hero.haveOne" size="md" tone="orange" />
      </div>

      <div className="mb-5">
        <h2 className="font-[family-name:var(--font-kid-display)] text-2xl sm:text-3xl font-bold text-slate-800 leading-tight">
          {next.title}
        </h2>
        <p className="text-slate-500 truncate">{next.storyTitle}</p>
      </div>

      {/* The one giant, squishy CTA. */}
      <button
        type="button"
        onClick={() => router.push(`/student/assignments/${next.id}/practice`)}
        className="group w-full min-h-[64px] rounded-2xl bg-orange-500 hover:bg-orange-500 text-white px-6 flex items-center justify-center gap-3 shadow-[0_6px_0_#c2410c] active:translate-y-1 active:shadow-[0_2px_0_#c2410c] transition-all"
      >
        <Headphones className="w-7 h-7 shrink-0" />
        <span className="flex flex-col items-start leading-tight">
          <span className="font-[family-name:var(--font-kid-display)] text-lg sm:text-xl font-bold">
            {UI_STRINGS['hero.cta'].en}
          </span>
          <span lang="zh-Hant" className="font-[family-name:var(--font-kid-zh)] text-orange-100 text-sm">
            {UI_STRINGS['hero.cta'].zh}
          </span>
        </span>
        <ChevronRight className="w-6 h-6 ml-1 shrink-0 transition-transform group-active:translate-x-0.5" />
      </button>

      {rest.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-orange-700/80 font-[family-name:var(--font-kid-display)]">
            +{rest.length} {UI_STRINGS['hero.more'].en}{' '}
            <span lang="zh-Hant">{UI_STRINGS['hero.more'].zh}</span>
          </span>
          {rest.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => router.push(`/student/assignments/${a.id}/practice`)}
              className="max-w-[12rem] truncate rounded-full bg-white/80 border border-orange-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white transition-colors"
            >
              {a.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
