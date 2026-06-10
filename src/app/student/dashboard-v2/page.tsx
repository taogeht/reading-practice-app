'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home as HomeIcon,
  Mic,
  BookA,
  BookOpen,
  Loader2,
  Gamepad2,
  Send,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { useHeartbeat } from '@/hooks/use-heartbeat';
import { UI_STRINGS, type UiStringId } from '@/lib/i18n/ui-strings';

import { StudentDashboardHeader } from '@/components/student/student-dashboard-header';
import { HomeworkHeroCard, type HeroAssignment } from '@/components/student/homework-hero-card';
import { LatestRecordingCard, type LatestRecording } from '@/components/student/latest-recording-card';
import { ReadAloudLabel } from '@/components/student/read-aloud-label';
import { StudentProgressionCard } from '@/components/gamification/student-progression-card';
import { StudentTestScoresCard } from '@/components/student/student-test-scores-card';
import { StudentAttemptCard } from '@/components/student/student-attempt-card';
import { StudentSpellingSection } from '@/components/spelling/student-spelling-section';
import { SnowmanGame } from '@/components/spelling/snowman-game';
import { ListenAndSpellGame } from '@/components/spelling/listen-spell-game';
import { UnscrambleGame } from '@/components/spelling/unscramble-game';
import { MissingLettersGame } from '@/components/spelling/missing-letters-game';
import { FlashcardGame } from '@/components/spelling/flashcard-game';
import { RecordedPassagesSection } from '@/components/recordings/recorded-passages-section';
import { StudentMediaGallery } from '@/components/student-media/student-media-gallery';
import { ReadingLibrary } from '@/components/reading/reading-library';
import { StoryLibrary } from '@/components/stories/story-library';
import { StudentHomeworkSection } from '@/components/student/student-homework-section';
import { PracticeSession } from '@/components/practice/practice-session';
import { PracticeStatsCard } from '@/components/practice/practice-stats-card';
import { PhonicsDeck } from '@/components/practice/phonics-deck';
import { WeeklyRecapView } from '@/components/recap/weekly-recap-view';

type Attempt = {
  id: string;
  attemptNumber: number | null;
  status: 'pending' | 'reviewed' | 'flagged' | 'submitted';
  accuracyScore: number | null;
  letterGrade: string | null;
  submittedAt: string | null;
  teacherFeedback: string | null;
  audioDurationSeconds: number | null;
  analysisJson: Record<string, unknown> | null;
  [k: string]: unknown;
};
type Assignment = {
  id: string;
  title: string;
  storyTitle: string;
  dueAt: string | null;
  status: 'pending' | 'submitted' | 'completed';
  bestScore: number | null;
  letterGrade: string | null;
  hasTeacherFeedback: boolean;
  attemptsList: Attempt[];
};
type Student = {
  id: string;
  firstName: string;
  oupEmail?: string | null;
  oupPassword?: string | null;
  readingLevel: string | null;
  gradeLevel: number | null;
};
type TestScore = {
  testId: string;
  testName: string;
  testType: string;
  testDate: string | null;
  score: number | null;
};
type DashboardData = {
  student: Student;
  assignments: Assignment[];
  pastAssignments: Assignment[];
  showPracticeStories: boolean;
  recentTestScores?: TestScore[];
};

// Newest submitted attempt across all assignments → the "my last recording" hero.
function pickLatest(all: Assignment[]): LatestRecording | null {
  let best: { att: Attempt; a: Assignment } | null = null;
  for (const a of all) {
    for (const att of a.attemptsList) {
      if (!att.submittedAt) continue;
      if (!best || new Date(att.submittedAt) > new Date(best.att.submittedAt!)) {
        best = { att, a };
      }
    }
  }
  if (!best) return null;
  return {
    id: best.att.id,
    assignmentTitle: best.a.title,
    storyTitle: best.a.storyTitle,
    letterGrade: best.att.letterGrade,
    bestScore: best.att.accuracyScore,
    hasFeedback: Boolean(best.att.teacherFeedback) || best.a.hasTeacherFeedback,
    audioDurationSeconds: best.att.audioDurationSeconds,
  };
}

const TAB_COLOR: Record<string, string> = {
  home: 'data-[state=active]:bg-amber-100 data-[state=active]:border-amber-300 data-[state=active]:text-amber-800',
  recordings: 'data-[state=active]:bg-violet-100 data-[state=active]:border-violet-300 data-[state=active]:text-violet-800',
  spelling: 'data-[state=active]:bg-sky-100 data-[state=active]:border-sky-300 data-[state=active]:text-sky-800',
  stories: 'data-[state=active]:bg-emerald-100 data-[state=active]:border-emerald-300 data-[state=active]:text-emerald-800',
};

function BigTab({ value, labelId, icon: Icon }: { value: string; labelId: UiStringId; icon: typeof HomeIcon }) {
  const s = UI_STRINGS[labelId];
  return (
    <TabsTrigger
      value={value}
      className={`flex flex-col items-center justify-center gap-1 min-h-[76px] rounded-2xl border-2 border-transparent bg-white/70 text-slate-600 transition-all data-[state=active]:shadow-[0_4px_0_rgba(0,0,0,0.06)] data-[state=active]:-translate-y-0.5 ${TAB_COLOR[value]}`}
    >
      <Icon className="w-7 h-7 shrink-0" />
      <span className="leading-tight text-center">
        <span className="block font-[family-name:var(--font-kid-display)] font-semibold text-sm">{s.en}</span>
        <span lang="zh-Hant" className="block font-[family-name:var(--font-kid-zh)] text-[11px] opacity-70">{s.zh}</span>
      </span>
    </TabsTrigger>
  );
}

function SectionHeading({ id }: { id: UiStringId }) {
  return (
    <div className="mb-3">
      <ReadAloudLabel id={id} size="md" tone="white" />
    </div>
  );
}

export default function StudentDashboardV2Page() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('home');
  const [copied, setCopied] = useState<string | null>(null);

  useHeartbeat();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/student/dashboard');
        if (!res.ok) throw new Error('failed');
        setData(await res.json());
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <ReadAloudLabel id="empty.loading" size="md" showSpeaker={false} />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen grid place-items-center">
        <ReadAloudLabel id="empty.error" size="md" showSpeaker={false} />
      </div>
    );
  }

  const { student, assignments, showPracticeStories } = data;
  const pastAssignments = data.pastAssignments ?? [];
  const pending: HeroAssignment[] = assignments
    .filter((a) => a.status === 'pending')
    .map((a) => ({ id: a.id, title: a.title, storyTitle: a.storyTitle, dueAt: a.dueAt }));
  const submitted = assignments.filter((a) => a.status === 'submitted');
  const completed = assignments.filter((a) => a.status === 'completed');
  const latest = pickLatest([...assignments, ...pastAssignments]);
  const recordingsForReview = [...completed, ...pastAssignments].filter((a) => a.attemptsList.length > 0);

  return (
    <div className="min-h-screen pb-16">
      <StudentDashboardHeader firstName={student.firstName} />

      <main className="max-w-5xl mx-auto px-3 sm:px-4 pt-4">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          {/* Four big picture buttons. */}
          {/* h-auto! (important) is required: shadcn's TabsList base injects a
              fixed h-9 via a variant selector that out-specifies a plain
              h-auto, which would pin the bar to 36px and let the tall tab
              cards overflow onto the content below. */}
          <TabsList className="w-full h-auto! bg-transparent p-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
            <BigTab value="home" labelId="tab.home" icon={HomeIcon} />
            <BigTab value="recordings" labelId="tab.recordings" icon={Mic} />
            <BigTab value="spelling" labelId="tab.spelling" icon={BookA} />
            <BigTab value="stories" labelId="tab.stories" icon={BookOpen} />
          </TabsList>

          {/* ---------------- HOME ---------------- */}
          <TabsContent value="home" className="space-y-5 mt-0">
            <HomeworkHeroCard pending={pending} onReadStories={() => setTab('stories')} />
            <LatestRecordingCard recording={latest} onSeeAll={() => setTab('recordings')} />

            <div className="kid-rise"><StudentProgressionCard /></div>

            {(data.recentTestScores?.length ?? 0) > 0 && (
              <StudentTestScoresCard scores={data.recentTestScores!} />
            )}

            {submitted.length > 0 && (
              <section className="kid-rise rounded-3xl border-2 border-amber-100 bg-white/70 p-5">
                <SectionHeading id="status.inReview" />
                <div className="space-y-2">
                  {submitted.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => router.push(`/student/assignments/${a.id}/practice`)}
                      className="w-full text-left rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors p-3 flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block font-[family-name:var(--font-kid-display)] font-semibold text-slate-800 truncate">{a.title}</span>
                        <span className="block text-sm text-slate-500 truncate">{a.storyTitle}</span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 text-amber-700 text-sm font-semibold">
                        <Send className="w-4 h-4" /> {UI_STRINGS['status.inReview'].zh}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Secondary stuff tucked away so Home stays calm. */}
            {(student.oupEmail || true) && (
              <CollapsibleCard
                title={`${UI_STRINGS['section.more'].en} · ${UI_STRINGS['section.more'].zh}`}
                defaultOpen={false}
                storageKey="dashboard-v2.more"
              >
                <div className="space-y-5">
                  {student.oupEmail && student.oupPassword && (
                    <div className="space-y-2">
                      {[
                        { k: 'email', label: 'Email', val: student.oupEmail },
                        { k: 'password', label: 'Password', val: student.oupPassword },
                      ].map(({ k, label, val }) => (
                        <div key={k} className="flex items-center justify-between gap-2 rounded-xl border-2 border-sky-100 bg-white p-3">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">{label}</p>
                            <p className="font-mono font-bold text-slate-800 break-all">{val}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(val!);
                              setCopied(k);
                              setTimeout(() => setCopied((c) => (c === k ? null : c)), 1500);
                            }}
                            className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-white text-sm font-semibold ${copied === k ? 'bg-emerald-500' : 'bg-sky-500'}`}
                          >
                            {copied === k ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied === k ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => window.open('https://afaf2e.ouponlinepractice.com/auth/index', '_blank')}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3 font-semibold"
                      >
                        <ExternalLink className="w-4 h-4" /> Online Practice
                      </button>
                    </div>
                  )}
                  <div>
                    <SectionHeading id="section.thisWeek" />
                    <WeeklyRecapView />
                  </div>
                </div>
              </CollapsibleCard>
            )}
          </TabsContent>

          {/* ---------------- MY RECORDINGS ---------------- */}
          <TabsContent value="recordings" className="space-y-5 mt-0">
            <SectionHeading id="tab.recordings" />
            {recordingsForReview.length === 0 && (
              <div className="rounded-3xl border-2 border-violet-100 bg-white/70 p-6 text-center">
                <div className="text-4xl mb-1" aria-hidden>🎙️</div>
                <ReadAloudLabel id="latest.none" size="md" tone="violet" />
              </div>
            )}
            {recordingsForReview.map((a) => (
              <div key={a.id} className="rounded-2xl border-2 border-violet-100 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-kid-display)] font-semibold text-slate-800 truncate">{a.title}</p>
                    <p className="text-sm text-slate-500 truncate">{a.storyTitle}</p>
                  </div>
                  {a.letterGrade && (
                    <span className="shrink-0 rounded-full bg-violet-600 text-white text-xs font-bold px-2 py-0.5">{a.letterGrade}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {a.attemptsList.map((att) => (
                    <StudentAttemptCard key={att.id} attempt={att as never} />
                  ))}
                </div>
              </div>
            ))}
            <RecordedPassagesSection />
            <StudentMediaGallery studentId={student.id} />
          </TabsContent>

          {/* ---------------- SPELLING ---------------- */}
          <TabsContent value="spelling" className="space-y-6 mt-0">
            <StudentSpellingSection />
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-[family-name:var(--font-kid-display)] text-xl font-bold text-slate-800">
                <Gamepad2 className="w-6 h-6 text-sky-500" /> Spelling games · 拼字遊戲
              </h2>
              <Tabs defaultValue="snowman" className="w-full">
                <TabsList className="grid grid-cols-2 sm:grid-cols-5 gap-1 h-auto bg-white/60 border border-sky-100 p-1">
                  <TabsTrigger value="snowman" className="text-xs sm:text-sm data-[state=active]:bg-sky-100">⛄ Snowman</TabsTrigger>
                  <TabsTrigger value="listen" className="text-xs sm:text-sm data-[state=active]:bg-sky-100">🎧 Listen</TabsTrigger>
                  <TabsTrigger value="unscramble" className="text-xs sm:text-sm data-[state=active]:bg-sky-100">🔀 Unscramble</TabsTrigger>
                  <TabsTrigger value="missing" className="text-xs sm:text-sm data-[state=active]:bg-sky-100">✏️ Missing</TabsTrigger>
                  <TabsTrigger value="flash" className="text-xs sm:text-sm data-[state=active]:bg-sky-100">🃏 Flashcards</TabsTrigger>
                </TabsList>
                <TabsContent value="snowman" className="mt-3"><SnowmanGame /></TabsContent>
                <TabsContent value="listen" className="mt-3"><ListenAndSpellGame /></TabsContent>
                <TabsContent value="unscramble" className="mt-3"><UnscrambleGame /></TabsContent>
                <TabsContent value="missing" className="mt-3"><MissingLettersGame /></TabsContent>
                <TabsContent value="flash" className="mt-3"><FlashcardGame /></TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          {/* ---------------- STORIES ---------------- */}
          <TabsContent value="stories" className="space-y-6 mt-0">
            <ReadingLibrary
              student={{ firstName: student.firstName, readingLevel: student.readingLevel }}
            />
            {showPracticeStories && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 font-[family-name:var(--font-kid-display)] text-xl font-bold text-slate-800">
                  <BookOpen className="w-6 h-6 text-emerald-500" /> Practice stories · 練習故事
                </h2>
                <StoryLibrary
                  variant="compact"
                  filter={{ readingLevel: student.readingLevel || undefined, gradeLevel: student.gradeLevel || undefined }}
                  onStorySelect={(story) => router.push(`/student/practice/${story.id}`)}
                  selectable
                  showCreateButton={false}
                />
              </div>
            )}
            <StudentHomeworkSection />
            <div className="space-y-3">
              <PracticeStatsCard />
              <PracticeSession />
              {process.env.NEXT_PUBLIC_ENABLE_STUDENT_PHONICS === 'true' && <PhonicsDeck />}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
