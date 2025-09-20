"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateAssignmentDialog } from "@/components/assignments/create-assignment-dialog";
import { ArrowLeft, Plus, Eye, Edit2, Trash2, Calendar, Users, BookOpen, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

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
  storyTitle: string;
  className: string;
}

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/assignments');

      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }

      const data = await response.json();
      setAssignments(data.assignments || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentCreated = () => {
    fetchAssignments();
    setShowCreateDialog(false);
  };

  const handleMarkAsCompleted = async (assignmentId: string, assignmentTitle: string) => {
    const confirmed = confirm(
      `Mark "${assignmentTitle}" as completed? Students will still be able to see this assignment and teacher feedback.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/assignments/${assignmentId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark assignment as completed');
      }

      // Refresh the assignments list
      fetchAssignments();
    } catch (error) {
      console.error('Error marking assignment as completed:', error);
      alert('Failed to mark assignment as completed. Please try again.');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string, assignmentTitle: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${assignmentTitle}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete assignment');
      }

      // Refresh the assignments list
      fetchAssignments();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Failed to delete assignment. Please try again.');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'archived': return 'bg-blue-100 text-blue-800'; // Treat archived as completed
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'archived': return 'completed'; // Show archived as completed
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading assignments...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/teacher/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">My Assignments</h1>
                <p className="text-gray-600 mt-1">
                  Manage your reading assignments and track student progress
                </p>
              </div>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Assignment
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="text-red-600">{error}</div>
            </CardContent>
          </Card>
        )}

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">No assignments yet</h3>
              <p className="text-gray-600 mb-6">
                Create your first assignment to get started with student reading practice.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Assignment
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {assignments.map((assignment) => (
              <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{assignment.title}</CardTitle>
                        <Badge className={getStatusColor(assignment.status)}>
                          {getStatusLabel(assignment.status)}
                        </Badge>
                      </div>
                      <CardDescription className="text-base">
                        {assignment.description || 'No description provided'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/teacher/assignments/${assignment.id}`)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/teacher/assignments/${assignment.id}/edit`)}
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      {assignment.status === 'published' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => handleMarkAsCompleted(assignment.id, assignment.title)}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Mark Complete
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteAssignment(assignment.id, assignment.title)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <BookOpen className="w-4 h-4" />
                      <span>Story: {assignment.storyTitle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>Class: {assignment.className}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Due: {formatDate(assignment.dueAt)}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <span>Max attempts: {assignment.maxAttempts}</span>
                      <span>Created {format(new Date(assignment.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateAssignmentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleAssignmentCreated}
      />
    </div>
  );
}