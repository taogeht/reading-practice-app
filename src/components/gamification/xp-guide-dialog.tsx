"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANIMAL_UNLOCK_ORDER,
  STREAK_MILESTONES,
  XP_EVENT_LABELS,
  XP_VALUES,
  type XpEventIcon,
  xpRequiredForLevel,
} from "@/lib/gamification/rules";
import {
  BookOpen,
  CheckCircle2,
  Flame,
  Lock,
  LogIn,
  Mic,
  Sparkles,
  SpellCheck,
  Star,
  X,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLevel: number;
  totalXp: number;
  currentStreakDays: number;
}

function iconFor(name: XpEventIcon) {
  switch (name) {
    case "mic":
      return <Mic className="w-4 h-4" />;
    case "book":
      return <BookOpen className="w-4 h-4" />;
    case "spell":
      return <SpellCheck className="w-4 h-4" />;
    case "star":
      return <Star className="w-4 h-4" />;
    case "login":
      return <LogIn className="w-4 h-4" />;
  }
}

export function XpGuideDialog({
  open,
  onOpenChange,
  currentLevel,
  totalXp,
  currentStreakDays,
}: Props) {
  const earnRows = XP_EVENT_LABELS.filter((e) => e.eventType !== "daily_login");
  const dailyLogin = XP_EVENT_LABELS.find((e) => e.eventType === "daily_login");

  const nextStreak = STREAK_MILESTONES.find((m) => m.days > currentStreakDays);

  const maxAnimalLevel = ANIMAL_UNLOCK_ORDER.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 rounded-full p-1"
        >
          <X className="w-4 h-4" />
        </button>

        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              How XP Works
            </span>
          </DialogTitle>
          <DialogDescription>
            Earn XP by reading, spelling, and practicing. Keep going each day to
            level up and unlock new animal friends!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Section 1: Ways to earn XP */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-2">
              Ways to earn XP
            </h3>
            <ul className="space-y-2">
              {earnRows.map((row) => (
                <li
                  key={row.eventType}
                  className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100"
                >
                  <span className="shrink-0 w-8 h-8 rounded-full bg-white border border-amber-200 flex items-center justify-center text-amber-700">
                    {iconFor(row.icon)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {row.label}
                    </p>
                    <p className="text-xs text-gray-600 leading-snug">
                      {row.description}
                    </p>
                  </div>
                  <Badge className="bg-amber-500 text-white border-0 shrink-0">
                    +{XP_VALUES[row.eventType]} XP
                  </Badge>
                </li>
              ))}
            </ul>
            {dailyLogin && (
              <div className="mt-2 flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="shrink-0 w-8 h-8 rounded-full bg-white border border-emerald-200 flex items-center justify-center text-emerald-700">
                  {iconFor(dailyLogin.icon)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">
                    {dailyLogin.label}
                  </p>
                  <p className="text-xs text-emerald-800 leading-snug">
                    {dailyLogin.description}
                  </p>
                </div>
                <Badge className="bg-emerald-500 text-white border-0 shrink-0">
                  +{XP_VALUES[dailyLogin.eventType]} XP
                </Badge>
              </div>
            )}
          </section>

          {/* Section 2: Streak bonuses */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-2">
              Streak bonuses
            </h3>
            <p className="text-xs text-gray-600 mb-2">
              Practice every day to grow your streak. You&rsquo;re currently at{" "}
              <span className="font-semibold text-orange-700">
                {currentStreakDays} day{currentStreakDays === 1 ? "" : "s"}
              </span>
              {nextStreak ? (
                <>
                  {" "}— {nextStreak.days - currentStreakDays} more{" "}
                  {nextStreak.days - currentStreakDays === 1 ? "day" : "days"} to
                  the {nextStreak.days}-day bonus.
                </>
              ) : (
                <> — you&rsquo;ve hit every streak bonus, amazing!</>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {STREAK_MILESTONES.map((m) => {
                const reached = currentStreakDays >= m.days;
                const isNext = nextStreak?.days === m.days;
                return (
                  <div
                    key={m.days}
                    className={`rounded-lg border p-3 text-center ${
                      reached
                        ? "bg-orange-100 border-orange-300"
                        : isNext
                          ? "bg-orange-50 border-orange-300 ring-2 ring-orange-300"
                          : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <Flame
                      className={`w-5 h-5 mx-auto ${
                        reached || isNext ? "text-orange-500" : "text-gray-400"
                      }`}
                    />
                    <p
                      className={`text-sm font-bold mt-1 ${
                        reached || isNext ? "text-orange-900" : "text-gray-700"
                      }`}
                    >
                      {m.days} days
                    </p>
                    <p
                      className={`text-xs ${
                        reached || isNext ? "text-orange-800" : "text-gray-500"
                      }`}
                    >
                      +{XP_VALUES[m.eventType]} XP
                    </p>
                    {reached && (
                      <p className="text-[10px] mt-1 font-semibold uppercase text-orange-700">
                        Earned
                      </p>
                    )}
                    {isNext && !reached && (
                      <p className="text-[10px] mt-1 font-semibold uppercase text-orange-700">
                        Next up
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Animals you'll unlock */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-2">
              Animals you&rsquo;ll unlock
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              You unlock a new animal friend every time you level up. Your
              current avatar is the highest level you&rsquo;ve reached.
            </p>
            <ul className="space-y-2">
              {ANIMAL_UNLOCK_ORDER.map((animal, idx) => {
                const level = idx + 1;
                const xpThreshold = xpRequiredForLevel(level);
                const isUnlocked = level <= currentLevel;
                const isNext = level === currentLevel + 1;
                const xpToGo = xpThreshold - totalXp;
                return (
                  <li
                    key={animal.key}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isUnlocked
                        ? "bg-white border-amber-200"
                        : isNext
                          ? "bg-amber-50 border-amber-300 ring-2 ring-amber-300"
                          : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div
                      className={`shrink-0 w-12 h-12 rounded-xl bg-white border flex items-center justify-center overflow-hidden ${
                        isUnlocked
                          ? "border-amber-200"
                          : "border-gray-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={animal.image}
                        alt={animal.displayName}
                        className={`w-full h-full object-contain p-1 ${
                          isUnlocked ? "" : "grayscale opacity-50"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                          Level {level}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            isUnlocked
                              ? "text-gray-900"
                              : isNext
                                ? "text-amber-900"
                                : "text-gray-500"
                          }`}
                        >
                          {animal.displayName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        {xpThreshold === 0
                          ? "Starting level"
                          : `${xpThreshold} total XP`}
                      </p>
                      {isNext && (
                        <p className="text-xs font-semibold text-amber-700 mt-0.5">
                          {xpToGo > 0
                            ? `${xpToGo} more XP to unlock!`
                            : "Ready to unlock — keep going!"}
                        </p>
                      )}
                    </div>
                    {isUnlocked && (
                      <Badge className="bg-emerald-500 text-white border-0 shrink-0">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Unlocked
                      </Badge>
                    )}
                    {isNext && (
                      <Badge className="bg-amber-500 text-white border-0 shrink-0">
                        You&rsquo;re here
                      </Badge>
                    )}
                    {!isUnlocked && !isNext && (
                      <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
            {currentLevel >= maxAnimalLevel && (
              <p className="text-xs text-gray-500 mt-3 italic">
                You&rsquo;ve unlocked every animal friend! You&rsquo;ll keep
                your {ANIMAL_UNLOCK_ORDER[maxAnimalLevel - 1].displayName} until
                we add more.
              </p>
            )}
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
