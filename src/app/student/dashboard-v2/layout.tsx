import type { ReactNode, CSSProperties } from 'react';
import { Fredoka, Nunito } from 'next/font/google';
import { ReadAloudProvider } from '@/components/student/read-aloud-label';

// Playful, characterful type — scoped to the V2 dashboard only (the rest of the
// app keeps its Inter stack). Fredoka = rounded display; Nunito = friendly,
// highly legible body. Traditional-Chinese captions fall to a system CJK stack
// (PingFang TC / Microsoft JhengHei) so we don't ship a heavy CJK webfont.
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-kid-display',
  display: 'swap',
});
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-kid-body',
  display: 'swap',
});

export default function DashboardV2Layout({ children }: { children: ReactNode }) {
  const themeVars = {
    '--font-kid-zh': '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Heiti TC", sans-serif',
    fontFamily: 'var(--font-kid-body)',
  } as CSSProperties;

  return (
    <div
      className={`${fredoka.variable} ${nunito.variable} min-h-screen text-slate-800`}
      style={themeVars}
    >
      {/* Storybook sky → meadow wash with a soft sun glow, behind everything. */}
      <div
        className="min-h-screen bg-[radial-gradient(120%_80%_at_50%_-10%,#fff7e6_0%,#eaf6ff_38%,#e6f7ee_100%)]"
      >
        <ReadAloudProvider>{children}</ReadAloudProvider>
      </div>
    </div>
  );
}
