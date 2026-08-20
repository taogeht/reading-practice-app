// The Starling Rise front door.
//
// This is not a marketing site. Huaxia is the only school on the platform, so
// nobody arrives here to be sold anything — the traffic is four teachers, the
// students who typed the bare domain instead of using their /c/ code, and
// parents wondering what their child is doing. The page's whole job is to get
// each of those three people through the right door in a few seconds, in both
// the languages they read.
//
// Server component on purpose: only the flock and the code field need JS.

import Link from "next/link";
import Image from "next/image";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Murmuration } from "@/components/landing/murmuration";
import { ClassCodeEntry } from "@/components/landing/class-code-entry";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

// Traditional Chinese is set in whatever the device already has. Every phone
// and tablet in Taiwan ships a good zh-Hant face, and shipping a webfont for
// the handful of Chinese lines here would cost school tablets a megabyte for
// nothing.
const CJK_STACK =
  '"PingFang TC", "Heiti TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif';

/** What a child actually does in a week, for a parent reading this cold.
 *  Only things a student can genuinely open — the reading loop, then the
 *  week's spelling list with its practice games. */
const parentSteps = [
  { en: "Listen to the story read aloud.", zh: "先聆聽故事朗讀。" },
  { en: "Read it aloud and record.", zh: "接著自己大聲朗讀並錄音。" },
  { en: "The teacher listens and writes back.", zh: "老師聆聽後給予回饋。" },
  { en: "Practise this week's spelling words.", zh: "練習本週的拼字單字。" },
];

export default function Home() {
  return (
    <div
      className={`${display.variable} ${body.variable} min-h-screen bg-[var(--ink)] font-[family-name:var(--font-body)] text-[var(--chalk)]`}
      style={
        {
          "--ink": "#07172E",
          "--ink-2": "#0E2A4F",
          "--edge": "#1E4272",
          "--sky": "#3D8FD6",
          "--gold": "#F2B705",
          "--gold-lift": "#FFD873",
          "--chalk": "#EAF0F7",
          "--chalk-dim": "#93A9C4",
          "--cjk": CJK_STACK,
        } as React.CSSProperties
      }
    >
      <header className="relative z-10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image
              src="/starling-mark.png"
              alt=""
              width={36}
              height={36}
              className="rounded-lg"
              priority
            />
            <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
              Starling Rise
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm text-[var(--chalk-dim)] transition-colors hover:text-[var(--chalk)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
          >
            Log in <span lang="zh-Hant" style={{ fontFamily: "var(--cjk)" }}>登入</span>
          </Link>
        </nav>
      </header>

      {/* Hero — the flock drifts behind the lockup and nothing else moves. */}
      <section className="relative overflow-hidden">
        <Murmuration />
        <div className="relative mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-[clamp(2.6rem,7.5vw,5.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">
            Read it out loud.
          </h1>
          <p
            lang="zh-Hant"
            style={{ fontFamily: "var(--cjk)" }}
            className="mt-4 text-[clamp(1.35rem,3.4vw,2.15rem)] font-medium text-[var(--gold)]"
          >
            大聲朗讀出來。
          </p>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-[var(--chalk-dim)]">
            Students at Huaxia record themselves reading and practise the
            week&apos;s spelling words. Their teacher listens, and writes back.
          </p>
          <p
            lang="zh-Hant"
            style={{ fontFamily: "var(--cjk)" }}
            className="mt-2 max-w-xl text-lg leading-relaxed text-[var(--chalk-dim)]"
          >
            華夏的學生錄下自己朗讀，並練習本週的拼字單字，老師聆聽後給予回饋。
          </p>
        </div>
      </section>

      {/* Three doors. Labelled by who you are — there is no sequence here, so
          no numbering. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {/* Students outnumber everyone else 25:1, so their door is the lit
              one and it takes the code directly. */}
          <div className="rounded-2xl border border-[var(--gold)]/35 bg-[var(--ink-2)] p-6 shadow-[0_0_0_1px_rgba(242,183,5,0.06)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              I&apos;m a student
            </h2>
            <p
              lang="zh-Hant"
              style={{ fontFamily: "var(--cjk)" }}
              className="mt-1 text-[var(--gold)]"
            >
              我是學生
            </p>
            <ClassCodeEntry />
          </div>

          <div className="flex flex-col rounded-2xl border border-[var(--edge)] bg-[var(--ink-2)]/60 p-6">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              I&apos;m a teacher
            </h2>
            <p
              lang="zh-Hant"
              style={{ fontFamily: "var(--cjk)" }}
              className="mt-1 text-[var(--chalk-dim)]"
            >
              我是老師
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--chalk-dim)]">
              Assign stories and spelling, take attendance, and review what your
              students recorded.
            </p>
            <Link
              href="/login"
              className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--sky)]/50 px-4 py-2.5 font-semibold text-[var(--chalk)] transition-colors hover:border-[var(--sky)] hover:bg-[var(--sky)]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
            >
              Log in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex flex-col rounded-2xl border border-[var(--edge)] bg-[var(--ink-2)]/60 p-6">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              I&apos;m a parent
            </h2>
            <p
              lang="zh-Hant"
              style={{ fontFamily: "var(--cjk)" }}
              className="mt-1 text-[var(--chalk-dim)]"
            >
              我是家長
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--chalk-dim)]">
              There is nothing to sign in to. Your child&apos;s teacher shares
              their progress directly.
            </p>
            {/* Native <details>: no JS and keyboard-operable. Closed by
                default so the three doors stay the same height. */}
            <details className="group mt-4">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--sky)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]">
                What my child does each week
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-4 space-y-3.5">
                {parentSteps.map((step) => (
                  <li key={step.en} className="border-l-2 border-[var(--edge)] pl-3">
                    <span className="block text-sm text-[var(--chalk)]">
                      {step.en}
                    </span>
                    <span
                      lang="zh-Hant"
                      style={{ fontFamily: "var(--cjk)" }}
                      className="block text-sm text-[var(--chalk-dim)]"
                    >
                      {step.zh}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--edge)]/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-[var(--chalk-dim)] sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <Image
              src="/starling-mark.png"
              alt=""
              width={22}
              height={22}
              className="rounded"
            />
            <span>Starling Rise · Huaxia</span>
          </div>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
