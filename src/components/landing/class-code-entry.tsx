"use client";

// The student door. It does the real work rather than linking to a page that
// then asks for the code: /c/<code> already resolves a slug or a UUID prefix
// and falls back to /student-login on a miss, so anything typed here lands
// somewhere sensible. That means no client-side validation theatre — a child
// who mistypes gets the class picker, not an error.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function ClassCodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  const go = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toLowerCase();
    setPending(true);
    router.push(trimmed ? `/c/${encodeURIComponent(trimmed)}` : "/student-login");
  };

  return (
    <form onSubmit={go} className="mt-5">
      <label
        htmlFor="class-code"
        className="block text-sm text-[var(--chalk-dim)]"
      >
        Class code{" "}
        <span lang="zh-Hant" className="text-[var(--chalk-dim)]">
          班級代碼
        </span>
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="class-code"
          name="class-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="2b-2026-2027"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--ink)]/60 px-3 py-2.5 text-[var(--chalk)] placeholder:text-[var(--chalk-dim)]/50 outline-none transition-colors focus-visible:border-[var(--gold)] focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--gold)] px-4 py-2.5 font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--gold-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-2)] disabled:opacity-60"
        >
          {pending ? "Opening" : "Go"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {/* Each language on its own line — mixing them inline lets the wrap
          break a two-character word across lines. */}
      <p className="mt-2.5 text-sm text-[var(--chalk-dim)]">
        <span className="block">No code? Ask your teacher.</span>
        <span lang="zh-Hant" className="block">
          沒有代碼？請問老師。
        </span>
      </p>
    </form>
  );
}
