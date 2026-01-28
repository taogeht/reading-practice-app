"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit2, Trash2, Calendar, Users, BookOpen, Clock, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";

interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  active: boolean;
  completed: boolean;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignedAt: string;
  dueAt: string | null;
  maxAttempts: number;
  instructions: string | null;
  createdAt: string;
  storyId: string;
  storyTitle: string;
  classId: string;
  className: string;
}

interface StudentProgressSummary {
  totalStudents: number;
  completedCount: number;
  completedStudents: StudentSummary[];
  pendingStudents: StudentSummary[];
}

export default function ViewAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [studentProgress, setStudentProgress] = useState<StudentProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchAssignment();
  }, [assignmentId]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/assignments/${assignmentId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Assignment not found');
        } else {
          throw new Error('Failed to fetch assignment');
        }
        return;
      }

      const data = await response.json();
      setAssignment(data.assignment);
      setStudentProgress(data.studentProgress ?? null);
    } catch (error) {
      console.error('Error fetching assignment:', error);
      setError('Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!assignment) return;

    const confirmed = confirm(
      `Are you sure you want to delete "${assignment.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete assignment');
      }

      router.push('/teacher/assignments');
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Failed to delete assignment. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    return format(new Date(dateString), 'EEEE, MMMM d, yyyy \'at\' h:mm a');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading assignment...</div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Assignment not found'}</p>
            <Button onClick={() => router.push('/teacher/assignments')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assignments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/teacher/assignments')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Assignments
              </Button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold text-gray-900">{assignment.title}</h1>
                  <Badge className={getStatusColor(assignment.status)}>
                    {assignment.status}
                  </Badge>
                </div>
                <p className="text-gray-600">Assignment Details</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push(`/teacher/assignments/${assignmentId}/edit`)}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-6">
          {/* Assignment Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Assignment Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignment.description && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-700">{assignment.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span className="font-medium">Story:</span>
                  <span>{assignment.storyTitle}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-green-600" />
                  <span className="font-medium">Class:</span>
                  <span>{assignment.className}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span className="font-medium">Due:</span>
                  <span>{formatDate(assignment.dueAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span className="font-medium">Max Attempts:</span>
                  <span>{assignment.maxAttempts}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {studentProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Student Progress
                </CardTitle>
                <CardDescription>
                  Track which students have submitted recordings for this assignment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="flex items-center gap-2 text-green-600 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    {studentProgress.completedCount} of {studentProgress.totalStudents} students have submitted
                  </span>
                  {studentProgress.totalStudents > 0 && (
                    <Badge variant="secondary">
                      Completion Rate: {studentProgress.totalStudents > 0
                        ? Math.round((studentProgress.completedCount / studentProgress.totalStudents) * 100)
                        : 0}%
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      Completed ({studentProgress.completedCount})
                    </h4>
                    {studentProgress.completedStudents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No completed submissions yet.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {studentProgress.completedStudents.map((student) => (
                          <li key={student.id} className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                            <span className="text-green-700 font-medium">
                              {student.firstName} {student.lastName}
                            </span>
                            {student.readingLevel && (
                              <span className="text-xs text-green-600">Level {student.readingLevel}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      Pending ({studentProgress.pendingStudents.length})
                    </h4>
                    {studentProgress.pendingStudents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">All students have completed this assignment.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {studentProgress.pendingStudents.map((student) => (
                          <li key={student.id} className="flex items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
                            <span className="text-orange-700 font-medium">
                              {student.firstName} {student.lastName}
                            </span>
                            {student.readingLevel && (
                              <span className="text-xs text-orange-600">Level {student.readingLevel}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          {assignment.instructions && (
            <Card>
              <CardHeader>
                <CardTitle>Instructions for Students</CardTitle>
                <CardDescription>
                  These instructions will be shown to students when they access this assignment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800 whitespace-pre-wrap">{assignment.instructions}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Assignment Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Created:</span>
                  <span className="ml-2">{format(new Date(assignment.createdAt), 'PPP')}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Assigned:</span>
                  <span className="ml-2">{format(new Date(assignment.assignedAt), 'PPP')}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Assignment ID:</span>
                  <span className="ml-2 font-mono text-xs">{assignment.id}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Status:</span>
                  <Badge className={`ml-2 ${getStatusColor(assignment.status)}`}>
                    {assignment.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => router.push(`/student/practice/${assignment.storyId}`)}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Preview Story
                </Button>
                <Button variant="outline">
                  <Users className="w-4 h-4 mr-2" />
                  View Student Progress
                </Button>
                <Button variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Download Reports
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
