'use client';

import { useState, useEffect } from "react";
import { StoryLibrary } from "@/components/stories/story-library";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Star, Headphones } from "lucide-react";
import { useRouter } from "next/navigation";

type Student = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
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
};

export default function Student2DashboardPage() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading your dashboard...</div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">{error || 'Failed to load dashboard'}</div>
      </div>
    );
  }

  const { student, assignments, stats } = dashboardData;
  const pendingAssignments = assignments.filter(a => a.status === 'pending');
  const completedAssignments = assignments.filter(a => a.status === 'completed');

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Due today";
    if (diffInDays === 1) return "Due tomorrow";
    if (diffInDays > 0) return `Due in ${diffInDays} days`;
    return "Overdue";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome back, {student.firstName}! 📚
        </h1>
        <p className="text-gray-600">
          Ready to practice reading today?
        </p>
        <div className="flex items-center gap-4 mt-4">
          {student.gradeLevel && (
            <Badge variant="outline" className="text-sm">
              Grade {student.gradeLevel}
            </Badge>
          )}
          {student.readingLevel && (
            <Badge variant="outline" className="text-sm">
              {student.readingLevel} Reader
            </Badge>
          )}
        </div>
      </div>

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
                    onClick={() => router.push(`/student2.0/assignments/${assignment.id}/practice`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium">{assignment.title}</h3>
                      {assignment.dueAt && (
                        <Badge variant="secondary" className="text-xs">
                          {formatDueDate(assignment.dueAt)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Story: {assignment.storyTitle}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Headphones className="w-3 h-3" />
                        Listen & Record
                      </span>
                      <span>
                        {assignment.attempts}/{assignment.maxAttempts} attempts
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
                {completedAssignments.slice(0, 3).map((assignment) => (
                  <div
                    key={assignment.id}
                    className={`border border-green-200 bg-green-50 rounded-lg p-3 transition-colors ${
                      assignment.hasTeacherFeedback ? '' : 'cursor-pointer hover:bg-green-100'
                    }`}
                    onClick={() => {
                      if (!assignment.hasTeacherFeedback) {
                        router.push(`/student2.0/assignments/${assignment.id}/practice`);
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
        </div>

        {/* Right Column - Story Library */}
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
                  readingLevel: student.readingLevel,
                  gradeLevel: student.gradeLevel,
                }}
                onStorySelect={(story) => {
                  router.push(`/student2.0/practice/${story.id}`);
                }}
                selectable={true}
                showCreateButton={false}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
