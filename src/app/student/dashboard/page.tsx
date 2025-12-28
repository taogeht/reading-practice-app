'use client';

import { useState, useEffect } from "react";
import { StoryLibrary } from "@/components/stories/story-library";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarPickerDialog } from "@/components/students/avatar-picker-dialog";
import { StudentSpellingSection } from "@/components/spelling/student-spelling-section";
import { AVATARS } from "@/components/auth/visual-password-options";
import { BookOpen, Clock, Star, Headphones, LogOut, SmilePlus } from "lucide-react";
import { useRouter } from "next/navigation";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  avatarUrl?: string | null;
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  storyId: string;
  storyTitle: string;
  dueAt: string | null;
  status: 'pending' | 'completed';
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

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Assignments */}
          <div className="lg:col-span-1 space-y-6">
            {/* Pending Assignments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-orange-500" />
                  Your Assignments
                </CardTitle>
                <CardDescription>
                  {pendingAssignments.length > 0
                    ? `${pendingAssignments.length} assignment${pendingAssignments.length !== 1 ? 's' : ''} to complete`
                    : 'All caught up! Great job! ⭐'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingAssignments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Star className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
                    <p className="font-medium">All assignments complete!</p>
                    <p className="text-sm">Check back later for new stories.</p>
                  </div>
                ) : (
                  pendingAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/student/assignments/${assignment.id}/practice`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium">{assignment.title}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Story: {assignment.storyTitle}
                      </p>
                      <div className="flex items-center text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Headphones className="w-3 h-3" />
                          Listen & Record
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent Completed */}
            {completedAssignments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-green-500" />
                    Completed
                  </CardTitle>
                  <CardDescription>
                    Your recent accomplishments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {completedAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className={`border border-green-200 bg-green-50 rounded-lg p-3 transition-colors ${assignment.hasTeacherFeedback ? '' : 'cursor-pointer hover:bg-green-100'
                        }`}
                      onClick={() => {
                        if (!assignment.hasTeacherFeedback) {
                          router.push(`/student/assignments/${assignment.id}/practice`);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-sm">{assignment.title}</h4>
                          <p className="text-xs text-gray-600">{assignment.storyTitle}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {assignment.bestScore && (
                            <Badge variant="default" className="bg-green-600">
                              {assignment.bestScore}%
                            </Badge>
                          )}
                          {assignment.hasTeacherFeedback && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              ✓ Reviewed
                            </Badge>
                          )}
                        </div>
                      </div>

                      {assignment.teacherFeedback && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <h5 className="text-xs font-medium text-blue-800 mb-1">Teacher Feedback:</h5>
                          <p className="text-xs text-blue-700">{assignment.teacherFeedback}</p>
                          {assignment.reviewedAt && (
                            <p className="text-xs text-blue-600 mt-1 opacity-75">
                              Reviewed on {new Date(assignment.reviewedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}

                      {!assignment.hasTeacherFeedback && assignment.status === 'completed' && (
                        <div className="mt-2 text-xs text-green-600">
                          Click to practice again while waiting for teacher feedback
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.completedAssignments}
                    </div>
                    <div className="text-xs text-gray-500">Completed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {stats.pendingAssignments}
                    </div>
                    <div className="text-xs text-gray-500">To Do</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Spelling Words */}
            <StudentSpellingSection />
          </div>

          {/* Right Column - Story Library */}
          {showPracticeStories && (
            <div className="lg:col-span-2">
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
                      // hasAudio: true, // Temporarily disabled until stories have TTS audio
                    }}
                    onStorySelect={(story) => {
                      // Navigate to reading practice page (free practice)
                      router.push(`/student/practice/${story.id}`);
                    }}
                    selectable={true}
                    showCreateButton={false}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
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
