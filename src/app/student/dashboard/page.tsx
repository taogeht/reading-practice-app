'use client';

import { useState, useEffect } from "react";
import { StoryLibrary } from "@/components/stories/story-library";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPickerDialog } from "@/components/students/avatar-picker-dialog";
import { StudentSpellingSection } from "@/components/spelling/student-spelling-section";
import { SnowmanGame } from "@/components/spelling/snowman-game";
import { ListenAndSpellGame } from "@/components/spelling/listen-spell-game";
import { UnscrambleGame } from "@/components/spelling/unscramble-game";
import { MissingLettersGame } from "@/components/spelling/missing-letters-game";
import { FlashcardGame } from "@/components/spelling/flashcard-game";

import { StudentHomeworkSection } from "@/components/student/student-homework-section";
import { StudentMediaGallery } from "@/components/student-media/student-media-gallery";
import { PracticeSession } from "@/components/practice/practice-session";
import { PracticeStatsCard } from "@/components/practice/practice-stats-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AVATARS } from "@/components/auth/visual-password-options";
import { BookOpen, Clock, Star, Headphones, LogOut, SmilePlus, Send, Gamepad2, Mic, ExternalLink, Copy, Check, SpellCheck, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useHeartbeat } from "@/hooks/use-heartbeat";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  avatarUrl?: string | null;
  oupEmail?: string | null;
  oupPassword?: string | null;
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  storyId: string;
  storyTitle: string;
  dueAt: string | null;
  status: 'pending' | 'submitted' | 'completed';
  attempts: number;
  maxAttempts: number;
  bestScore: number | null;
  instructions: string | null;
  className: string;
  teacherFeedback: string | null;
  reviewedAt: string | null;
  hasTeacherFeedback: boolean;
};

type DashboardData = {
  student: Student;
  assignments: Assignment[];
  stats: {
    totalAssignments: number;
    pendingAssignments: number;
    submittedAssignments: number;
    completedAssignments: number;
    averageScore: number | null;
  };
  showPracticeStories: boolean;
};

export default function StudentDashboardPage() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showOupPanel, setShowOupPanel] = useState(false);

  // Track student activity with periodic heartbeats
  useHeartbeat();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/student/dashboard');

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      window.location.href = '/student-login';
    }
  };

  const handleAvatarSelect = async (emoji: string) => {
    try {
      setUpdatingAvatar(true);
      const response = await fetch('/api/student/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatar: emoji }),
      });

      if (!response.ok) {
        throw new Error('Failed to update avatar');
      }

      setDashboardData((prev) =>
        prev
          ? {
            ...prev,
            student: {
              ...prev.student,
              avatarUrl: emoji,
            },
          }
          : prev
      );
      setShowAvatarDialog(false);
    } catch (error) {
      console.error('Avatar update error:', error);
    } finally {
      setUpdatingAvatar(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading your dashboard...</div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-red-600">{error || 'Failed to load dashboard'}</div>
      </div>
    );
  }

  const { student, assignments, stats, showPracticeStories } = dashboardData;
  const pendingAssignments = assignments.filter(a => a.status === 'pending');
  const submittedAssignments = assignments.filter(a => a.status === 'submitted');
  const completedAssignments = assignments.filter(a => a.status === 'completed');
  const avatarEmoji = student.avatarUrl || AVATARS[0].emoji;


  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {student.firstName}! 📚
              </h1>
              <p className="text-gray-600 mt-1">
                Ready to practice reading today?
              </p>
            </div>
            <div className="flex items-center gap-6 flex-wrap justify-end">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="text-2xl">
                    {avatarEmoji}
                  </AvatarFallback>
                </Avatar>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAvatarDialog(true)}
                  className="flex items-center gap-2"
                >
                  <SmilePlus className="w-4 h-4" />
                  Choose Avatar
                </Button>
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
              <div className="text-right">
                {student.gradeLevel && (
                  <Badge variant="outline" className="text-sm">
                    Grade {student.gradeLevel}
                  </Badge>
                )}
                {student.readingLevel && (
                  <div className="text-xs text-gray-500 mt-1">
                    {student.readingLevel} Reader
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Online Practice Login */}
        {student.oupEmail && student.oupPassword && (
          <>
            {!showOupPanel ? (
              <Button
                onClick={() => setShowOupPanel(true)}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg py-6 text-lg rounded-xl"
                size="lg"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Login to Online Practice
              </Button>
            ) : (
              <Card className="border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-lg">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-blue-800">Online Practice Login</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowOupPanel(false)} className="text-gray-400">
                      Close
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {/* Email */}
                    <div className="bg-white rounded-xl border-2 border-blue-200 p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 mb-1">Email</p>
                        <p className="text-lg font-mono font-bold text-gray-900 break-all">{student.oupEmail}</p>
                      </div>
                      <Button
                        size="lg"
                        className={`shrink-0 px-5 ${copiedField === 'email' ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                        onClick={() => {
                          navigator.clipboard.writeText(student.oupEmail!);
                          setCopiedField('email');
                          setTimeout(() => setCopiedField(f => f === 'email' ? null : f), 2000);
                        }}
                      >
                        {copiedField === 'email' ? (
                          <><Check className="w-5 h-5 mr-1" /> Copied!</>
                        ) : (
                          <><Copy className="w-5 h-5 mr-1" /> Copy</>
                        )}
                      </Button>
                    </div>

                    {/* Password */}
                    <div className="bg-white rounded-xl border-2 border-blue-200 p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-500 mb-1">Password</p>
                        <p className="text-2xl font-mono font-bold text-gray-900 tracking-wider">{student.oupPassword}</p>
                      </div>
                      <Button
                        size="lg"
                        className={`shrink-0 px-5 ${copiedField === 'password' ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                        onClick={() => {
                          navigator.clipboard.writeText(student.oupPassword!);
                          setCopiedField('password');
                          setTimeout(() => setCopiedField(f => f === 'password' ? null : f), 2000);
                        }}
                      >
                        {copiedField === 'password' ? (
                          <><Check className="w-5 h-5 mr-1" /> Copied!</>
                        ) : (
                          <><Copy className="w-5 h-5 mr-1" /> Copy</>
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-5 text-lg rounded-xl"
                    size="lg"
                    onClick={() => window.open('https://afaf2e.ouponlinepractice.com/auth/index', '_blank')}
                  >
                    <ExternalLink className="w-5 h-5 mr-2" />
                    Open Online Practice
                  </Button>

                  <p className="text-xs text-center text-blue-600">
                    Copy your email, open the site, paste it in. Then come back and copy your password.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Pending Recording Assignments - Prominent at top */}
        {pendingAssignments.length > 0 && (
          <Card className="border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-700">
                <Mic className="w-6 h-6" />
                {pendingAssignments.length === 1
                  ? "You have a recording assignment!"
                  : `You have ${pendingAssignments.length} recording assignments!`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white border border-orange-200 rounded-xl p-4 hover:bg-orange-50 cursor-pointer transition-all hover:shadow-md flex items-center justify-between gap-4"
                    onClick={() => router.push(`/student/assignments/${assignment.id}/practice`)}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base lg:text-lg text-gray-900">{assignment.title}</h3>
                      <p className="text-sm text-gray-600 truncate">{assignment.storyTitle}</p>
                      {assignment.dueAt && (
                        <p className="text-xs text-orange-600 mt-1">
                          Due: {new Date(assignment.dueAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Button className="bg-orange-500 hover:bg-orange-600 text-white shrink-0">
                      <Headphones className="w-4 h-4 mr-2" />
                      Start
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main sections — tabbed to keep the dashboard tidy as more learning activities are added */}
        <Tabs defaultValue="reading" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-white/60 border border-gray-200">
            <TabsTrigger value="reading" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 py-2 gap-2">
              <BookOpen className="w-4 h-4" />
              Reading
            </TabsTrigger>
            <TabsTrigger value="spelling" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 py-2 gap-2">
              <SpellCheck className="w-4 h-4" />
              Spelling
            </TabsTrigger>
            <TabsTrigger value="practice" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 py-2 gap-2">
              <Trophy className="w-4 h-4" />
              Practice
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reading" className="mt-6 space-y-8">
        {/* Assignment History - Prominent at top with feedback */}
        {(submittedAssignments.length > 0 || completedAssignments.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                My Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={submittedAssignments.length > 0 ? "submitted" : "completed"} className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="submitted" className="flex gap-2">
                    <Send className="w-4 h-4" />
                    In Review
                    {submittedAssignments.length > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 min-w-[1.25rem] h-5 flex items-center justify-center bg-amber-100 text-amber-700">
                        {submittedAssignments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="flex gap-2">
                    <Star className="w-4 h-4" />
                    Completed
                    {completedAssignments.length > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 min-w-[1.25rem] h-5 flex items-center justify-center bg-green-100 text-green-700">
                        {completedAssignments.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="submitted" className="space-y-3">
                  {submittedAssignments.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="font-medium text-sm">Nothing currently under review.</p>
                    </div>
                  ) : (
                    submittedAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="border border-amber-200 bg-amber-50 rounded-lg p-3 cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => router.push(`/student/assignments/${assignment.id}/practice`)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <h4 className="font-medium text-sm text-gray-900">{assignment.title}</h4>
                            <p className="text-xs text-gray-600">{assignment.storyTitle}</p>
                          </div>
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">
                            Submitted
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="completed" className="space-y-3">
                  {completedAssignments.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <p className="font-medium text-sm">Completed assignments will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {completedAssignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className={`border border-green-200 bg-green-50 rounded-lg p-3 transition-colors ${assignment.hasTeacherFeedback ? '' : 'cursor-pointer hover:bg-green-100'}`}
                          onClick={() => {
                            if (!assignment.hasTeacherFeedback) {
                              router.push(`/student/assignments/${assignment.id}/practice`);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <h4 className="font-medium text-sm text-gray-900">{assignment.title}</h4>
                              <p className="text-xs text-gray-600">{assignment.storyTitle}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {assignment.bestScore && (
                                <Badge variant="default" className="bg-green-600 text-[10px] px-1.5 py-0 h-5">
                                  {assignment.bestScore}%
                                </Badge>
                              )}
                              {assignment.hasTeacherFeedback && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0 h-5">
                                  Feedback
                                </Badge>
                              )}
                            </div>
                          </div>

                          {assignment.teacherFeedback && (
                            <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md">
                              <p className="text-xs font-medium text-blue-700 mb-0.5">Teacher feedback:</p>
                              <p className="text-sm text-blue-900 leading-snug">&ldquo;{assignment.teacherFeedback}&rdquo;</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Student Media Gallery - only shows if teacher has uploaded media */}
        <StudentMediaGallery studentId={student.id} />

        {/* Homework & Practice Stories */}
        <StudentHomeworkSection />

        {showPracticeStories && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Practice Stories
              </CardTitle>
              <CardDescription>
                Listen to stories and practice reading along
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StoryLibrary
                variant="compact"
                filter={{
                  readingLevel: student.readingLevel || undefined,
                  gradeLevel: student.gradeLevel || undefined,
                }}
                onStorySelect={(story) => {
                  router.push(`/student/practice/${story.id}`);
                }}
                selectable={true}
                showCreateButton={false}
              />
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="spelling" className="mt-6 space-y-8">
            {/* Spelling Words - Prominent full-width section */}
            <StudentSpellingSection />

            {/* Spelling Games via Tabs */}
            <div className="space-y-4">
              <Tabs defaultValue="snowman" className="w-full">
                <div className="space-y-2 mb-2">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Gamepad2 className="w-6 h-6 text-indigo-500" />
                    Spelling Practice
                  </h2>
                  <TabsList className="bg-white/50 border border-gray-200 h-auto gap-1 p-1 w-full grid grid-cols-3 sm:grid-cols-5">
                    <TabsTrigger value="snowman" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 text-xs sm:text-sm">
                      ⛄ Snowman
                    </TabsTrigger>
                    <TabsTrigger value="listen" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 text-xs sm:text-sm">
                      🎧 Listen & Spell
                    </TabsTrigger>
                    <TabsTrigger value="unscramble" className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800 text-xs sm:text-sm">
                      🔀 Unscramble
                    </TabsTrigger>
                    <TabsTrigger value="missing" className="data-[state=active]:bg-violet-100 data-[state=active]:text-violet-800 text-xs sm:text-sm">
                      ✏️ Missing Letters
                    </TabsTrigger>
                    <TabsTrigger value="flashcards" className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 text-xs sm:text-sm">
                      🃏 Flashcards
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="snowman" className="mt-0">
                  <SnowmanGame />
                </TabsContent>

                <TabsContent value="listen" className="mt-0">
                  <ListenAndSpellGame />
                </TabsContent>

                <TabsContent value="unscramble" className="mt-0">
                  <UnscrambleGame />
                </TabsContent>

                <TabsContent value="missing" className="mt-0">
                  <MissingLettersGame />
                </TabsContent>

                <TabsContent value="flashcards" className="mt-0">
                  <FlashcardGame />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="practice" className="mt-6 space-y-6">
            <PracticeStatsCard />
            <PracticeSession />
          </TabsContent>
        </Tabs>
      </div>

      <AvatarPickerDialog
        open={showAvatarDialog}
        onOpenChange={setShowAvatarDialog}
        avatars={AVATARS}
        selectedAvatar={student.avatarUrl}
        onSelect={handleAvatarSelect}
        loading={updatingAvatar}
      />
    </div>
  );
}
