'use client';

import { LogOut } from 'lucide-react';
import { UI_STRINGS } from '@/lib/i18n/ui-strings';

// Compact sticky header for the V2 dashboard: a bilingual greeting + logout.
// The gamification surfaces (student avatar + stars balance) are intentionally
// omitted here while that work isn't ready for prod. Star earning still runs in
// the background via the providers mounted in src/app/student/layout.tsx — only
// the header chrome is hidden, so re-adding it later is a pure UI change.
export function StudentDashboardHeader({ firstName }: { firstName: string }) {
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch {
      /* fall through to redirect */
    } finally {
      window.location.href = '/student-login';
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-kid-display)] text-lg sm:text-xl font-semibold">
          {UI_STRINGS['header.hi'].en} {firstName}{' '}
          <span lang="zh-Hant" className="font-[family-name:var(--font-kid-zh)] text-slate-400 text-sm">
            {UI_STRINGS['header.hi'].zh}
          </span>{' '}
          <span aria-hidden>👋</span>
        </p>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out 登出"
          className="shrink-0 grid place-items-center w-10 h-10 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
