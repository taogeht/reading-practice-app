"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StoryLibrary } from "@/components/stories/story-library";
import { CreateAssignmentDialog } from "@/components/assignments/create-assignment-dialog";
import { CreateClassDialog } from "@/components/classes/create-class-dialog";
import { CreateStudentDialog } from "@/components/students/create-student-dialog";
import { CreateStoryDialog } from "@/components/stories/create-story-dialog";
import { ClassQRCode } from "@/components/classes/class-qr-code";
import { StudentAttentionAlert } from "@/components/activity/student-attention-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  BookOpen,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Volume2,
  BarChart3,
  LogOut,
  List
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  classes: {
    id: string;
    name: string;
    studentCount: number;
    pendingSubmissions: number;
    recentActivity: number;
  }[];
};

type Submission = {
  id: string;
  studentName: string;
  assignmentTitle: string;
  submittedAt: string;
  status: 'pending' | 'submitted' | 'reviewed' | 'flagged';
  attemptNumber: number;
  score?: number;
  flagReason?: string;
};

type Stats = {
  totalStudents: number;
  activeAssignments: number;
  pendingReviews: number;
  storiesWithoutAudio: number;
};

type AssignmentSummary = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  classId: string | null;
  className: string | null;
  totalStudents: number;
  completedStudents: number;
};

type DashboardData = {
  teacher: Teacher;
  stats: Stats;
  recentSubmissions: Submission[];
  assignmentsSummary: AssignmentSummary[];
};

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/teacher/dashboard');

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
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Redirect to login page or home page after successful logout
        window.location.href = '/login';
      } else {
        console.error('Logout failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours === 0) return "Just now";
    if (diffInHours === 1) return "1 hour ago";
    if (diffInHours < 24) return `${diffInHours} hours ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "1 day ago";
    return `${diffInDays} days ago`;
  };

  const handleAssignmentCreated = () => {
    // Refresh dashboard data after assignment creation
    fetchDashboardData();
    console.log('Assignment created successfully!');
  };

  const handleClassCreated = () => {
    // Refresh dashboard data after class creation
    fetchDashboardData();
  };

  const handleStudentCreated = () => {
    // Refresh dashboard data after student creation
    fetchDashboardData();
  };

  const handleStoryCreated = () => {
    // Refresh dashboard data after story creation
    fetchDashboardData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error || 'Failed to load dashboard'}</div>
      </div>
    );
  }

  const { teacher, stats, recentSubmissions, assignmentsSummary = [] } = dashboardData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {teacher.firstName}! 👋
              </h1>
              <p className="text-gray-600 mt-1">
                Manage your reading assignments and student progress
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="outline" onClick={() => router.push('/teacher/assignments')}>
                <List className="w-4 h-4 mr-2" />
                Manage Assignments
              </Button>
              <Button onClick={() => setShowCreateAssignment(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Assignment
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="w-8 h-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Students</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <BookOpen className="w-8 h-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Assignments</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.activeAssignments}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="w-8 h-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending Reviews</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingReviews}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Volume2 className="w-8 h-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Need TTS Audio</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.storiesWithoutAudio}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Student Attention Alert */}
        <StudentAttentionAlert classes={teacher.classes.map(c => ({ id: c.id, name: c.name }))} />

        {/* Class Selection - Prominent Buttons */}
        {teacher.classes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Your Classes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {teacher.classes.map((classInfo) => (
                <button
                  key={classInfo.id}
                  onClick={() => router.push(`/teacher/classes/${classInfo.id}`)}
                  className="bg-white border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl p-5 text-left transition-all shadow-sm hover:shadow-md group"
                >
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-700 truncate">
                    {classInfo.name}
                  </h3>
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {classInfo.studentCount} students
                    </span>
                    {classInfo.pendingSubmissions > 0 && (
                      <span className="flex items-center gap-1 text-orange-600 font-medium">
                        <Clock className="w-4 h-4" />
                        {classInfo.pendingSubmissions} pending
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {/* Add Class Button */}
              <button
                onClick={() => setShowCreateClass(true)}
                className="border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-xl p-5 text-left transition-all flex flex-col items-center justify-center text-gray-500 hover:text-blue-600"
              >
                <Plus className="w-8 h-8 mb-1" />
                <span className="font-medium">Add Class</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Recent Activity */}
          <div className="lg:col-span-1 space-y-6">
            {/* Recent Submissions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Submissions</CardTitle>
                <CardDescription>
                  Latest student recordings to review
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentSubmissions.map((submission) => (
                  <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-sm">{submission.studentName}</h4>
                        <p className="text-xs text-gray-600 truncate">
                          {submission.assignmentTitle}
                        </p>
                      </div>
                      {submission.status === 'pending' && (
                        <Badge variant="secondary">
                          <Clock className="w-3 h-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                      {submission.status === 'reviewed' && (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {submission.score}%
                        </Badge>
                      )}
                      {submission.status === 'flagged' && (
                        <Badge variant="destructive">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Flagged
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatTimeAgo(submission.submittedAt)}</span>
                      <span>Attempt #{submission.attemptNumber}</span>
                    </div>

                    {submission.flagReason && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                        {submission.flagReason}
                      </div>
                    )}
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push('/teacher/submissions')}
                >
                  View All Submissions
                </Button>
              </CardContent>
            </Card>

            {/* Assignment Progress */}
            <Card>
              <CardHeader>
                <CardTitle>Assignment Progress</CardTitle>
                <CardDescription>
                  Track completion across your current assignments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {assignmentsSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active assignments yet. Create one to get started.
                  </p>
                ) : (
                  assignmentsSummary.map((assignment) => {
                    const completionRate = assignment.totalStudents > 0
                      ? Math.round((assignment.completedStudents / assignment.totalStudents) * 100)
                      : 0;

                    return (
                      <div
                        key={assignment.id}
                        className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/teacher/assignments/${assignment.id}`)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-medium text-sm text-gray-900">
                              {assignment.title}
                            </h4>
                            <p className="text-xs text-gray-500">
                              {assignment.className || 'Class'}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {assignment.completedStudents}/{assignment.totalStudents || 0}
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-2 bg-green-500"
                              style={{ width: `${Math.min(100, completionRate)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
                            <span>{completionRate}% complete</span>
                            {assignment.dueAt ? (
                              <span>Due {format(new Date(assignment.dueAt), 'MMM d')}</span>
                            ) : (
                              <span>No due date</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push('/teacher/assignments')}
                >
                  View All Assignments
                </Button>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowCreateAssignment(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Assignment
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowCreateClass(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Class
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowCreateStudent(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Student
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/teacher/classes')}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Manage Classes & Students
                </Button>
              </CardContent>
            </Card>

            {/* Archived Stories Section */}
            <Card>
              <CardHeader>
                <CardTitle>Archived Stories</CardTitle>
                <CardDescription>
                  Stories you've archived - not visible to students
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StoryLibrary
                  variant="compact"
                  archivedOnly={true}
                  selectable={true}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Story Library */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Story Library</CardTitle>
                <CardDescription>
                  Manage your reading materials and create assignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StoryLibrary
                  variant="grid"
                  showCreateButton={true}
                  selectable={true}
                  onCreateStory={() => setShowCreateStory(true)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CreateAssignmentDialog
        open={showCreateAssignment}
        onOpenChange={setShowCreateAssignment}
        onSuccess={handleAssignmentCreated}
      />

      <CreateClassDialog
        open={showCreateClass}
        onOpenChange={setShowCreateClass}
        onSuccess={handleClassCreated}
      />

      <CreateStudentDialog
        open={showCreateStudent}
        onOpenChange={setShowCreateStudent}
        onSuccess={handleStudentCreated}
      />

      <CreateStoryDialog
        open={showCreateStory}
        onOpenChange={setShowCreateStory}
        onSuccess={handleStoryCreated}
      />
    </div >
  );
}
