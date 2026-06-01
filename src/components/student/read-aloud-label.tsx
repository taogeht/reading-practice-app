'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { UI_STRINGS, type UiStringId } from '@/lib/i18n/ui-strings';
import { usePlayTts } from '@/hooks/use-play-tts';

// Shared read-aloud context so a single Audio element is reused across every
// label on the dashboard (only one clip plays at a time). Defaults to a no-op
// so a <ReadAloudLabel> still renders text even if a provider is missing —
// the speaker just won't play until wrapped in <ReadAloudProvider>.
type ReadAloudCtx = {
  play: (id: UiStringId, text: string) => void;
  playingId: string | null;
};
const Ctx = createContext<ReadAloudCtx>({ play: () => {}, playingId: null });

export function ReadAloudProvider({ children }: { children: ReactNode }) {
  const { play, playingId } = usePlayTts();
  return <Ctx.Provider value={{ play, playingId }}>{children}</Ctx.Provider>;
}

export const useReadAloud = () => useContext(Ctx);

type Size = 'sm' | 'md' | 'lg';
const EN_SIZE: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl sm:text-2xl',
};
const ZH_SIZE: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base sm:text-lg',
};
const SPEAKER_SIZE: Record<Size, string> = {
  sm: 'w-9 h-9',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

interface ReadAloudLabelProps {
  id: UiStringId;
  size?: Size;
  /** 'stack' = EN over zh (default); 'inline' = EN · zh on one line. */
  layout?: 'stack' | 'inline';
  showSpeaker?: boolean;
  className?: string;
  /** Tone of the speaker button background, e.g. 'amber' | 'sky' | 'white'. */
  tone?: 'white' | 'amber' | 'sky' | 'emerald' | 'violet' | 'orange';
}

const TONE: Record<NonNullable<ReadAloudLabelProps['tone']>, string> = {
  white: 'bg-white/80 text-slate-700 hover:bg-white',
  amber: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  sky: 'bg-sky-100 text-sky-700 hover:bg-sky-200',
  emerald: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  violet: 'bg-violet-100 text-violet-700 hover:bg-violet-200',
  orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
};

/**
 * A bilingual label: English (display font) + Traditional-Chinese caption
 * (lang="zh-Hant") + a tap-to-hear speaker. The single read-aloud affordance
 * the whole dashboard navigates by.
 */
export function ReadAloudLabel({
  id,
  size = 'md',
  layout = 'stack',
  showSpeaker = true,
  className = '',
  tone = 'white',
}: ReadAloudLabelProps) {
  const { play, playingId } = useReadAloud();
  const s = UI_STRINGS[id];
  const playing = playingId === id;

  const text = (
    <span className={layout === 'inline' ? 'inline-flex items-baseline gap-1.5' : 'flex flex-col leading-tight'}>
      <span className={`font-[family-name:var(--font-kid-display)] font-semibold ${EN_SIZE[size]}`}>{s.en}</span>
      <span lang="zh-Hant" className={`font-[family-name:var(--font-kid-zh)] text-slate-500 ${ZH_SIZE[size]}`}>
        {s.zh}
      </span>
    </span>
  );

  if (!showSpeaker) return <span className={className}>{text}</span>;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {text}
      <button
        type="button"
        aria-label={`Hear: ${s.en} / ${s.zh}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          play(id, s.en);
        }}
        className={`shrink-0 rounded-full grid place-items-center transition-colors ${SPEAKER_SIZE[size]} ${TONE[tone]} ${playing ? 'kid-pulse ring-2 ring-current/40' : ''}`}
      >
        <Volume2 className="w-1/2 h-1/2" />
      </button>
    </span>
  );
}
