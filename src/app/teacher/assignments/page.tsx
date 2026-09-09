"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateAssignmentDialog } from "@/components/assignments/create-assignment-dialog";
import {
  ArrowLeft,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  Users,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Clock,
  Archive,
  RotateCcw,
  GraduationCap,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";

interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
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
  storyTitle: string;
  classId: string;
  className: string;
  classGradeLevel?: number | null;
  classAcademicYear?: string | null;
  classActive?: boolean | null;
  classPromotedToClassId?: string | null;
  totalStudents: number;
  reviewedCount: number;
  needsReviewStudents: StudentSummary[];
  notStartedStudents: StudentSummary[];
}

interface TeacherClass {
  id: string;
  name: string;
  gradeLevel: number | null;
  academicYear: string | null;
  active: boolean | null;
  promotedToClassId: string | null;
}

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get('classId');

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || 'all');
  const [activeTab, setActiveTab] = useState<'current' | 'archived'>('current');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Fetch classes for the dropdown filter
  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/teacher/classes');
      if (!res.ok) throw new Error('Failed to fetch classes');
      const data = await res.json();
      const list: TeacherClass[] = Array.isArray(data) ? data : (data.classes ?? []);
      setClasses(list);
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  const fetchAssignments = useCallback(async (classFilter?: string) => {
    try {
      setLoading(true);
      setError(null);
      const targetClass = classFilter !== undefined ? classFilter : selectedClassId;
      const url = targetClass && targetClass !== 'all'
        ? `/api/assignments?classId=${encodeURIComponent(targetClass)}`
        : '/api/assignments';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }

      const data = await response.json();
      const formattedAssignments: Assignment[] = (data.assignments || []).map((assignment: any) => ({
        ...assignment,
        totalStudents: assignment.totalStudents ?? 0,
        reviewedCount: assignment.reviewedCount ?? 0,
        needsReviewStudents: assignment.needsReviewStudents ?? [],
        notStartedStudents: assignment.notStartedStudents ?? [],
      }));
      setAssignments(formattedAssignments);
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    fetchClasses();
    fetchAssignments(initialClassId || 'all');
  }, []);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    fetchAssignments(classId);

    // Update URL without page reload
    if (classId && classId !== 'all') {
      router.replace(`/teacher/assignments?classId=${encodeURIComponent(classId)}`);
    } else {
      router.replace('/teacher/assignments');
    }
  };

  const handleAssignmentCreated = () => {
    fetchAssignments();
    setShowCreateDialog(false);
  };

  const handleArchiveAssignment = async (assignmentId: string, assignmentTitle: string) => {
    const confirmed = confirm(
      `Archive "${assignmentTitle}"? It will move to the Archived section and stay accessible to students in their past reading history.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/assignments/${assignmentId}/archive`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to archive assignment');
      fetchAssignments();
    } catch (err) {
      console.error('Error archiving assignment:', err);
      alert('Failed to archive assignment. Please try again.');
    }
  };

  const handleRestoreAssignment = async (assignmentId: string, assignmentTitle: string) => {
    const confirmed = confirm(
      `Restore "${assignmentTitle}" to active assignments?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/assignments/${assignmentId}/unarchive`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to restore assignment');
      fetchAssignments();
    } catch (err) {
      console.error('Error restoring assignment:', err);
      alert('Failed to restore assignment. Please try again.');
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
      if (!response.ok) throw new Error('Failed to delete assignment');
      fetchAssignments();
    } catch (err) {
      console.error('Error deleting assignment:', err);
      alert('Failed to delete assignment. Please try again.');
    }
  };

  const isAssignmentArchived = (a: Assignment) => {
    return a.status === 'archived' || a.classActive === false || Boolean(a.classPromotedToClassId);
  };

  const currentAssignments = assignments.filter((a) => !isAssignmentArchived(a));
  const archivedAssignments = assignments.filter((a) => isAssignmentArchived(a));
  const displayedAssignments = activeTab === 'current' ? currentAssignments : archivedAssignments;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    return format(new Date(dateString), 'MMM d, yyyy');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'archived': return 'bg-gray-100 text-gray-700';
      case 'draft': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const sortedClasses = [...classes].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if ((a.gradeLevel ?? 0) !== (b.gradeLevel ?? 0)) {
      return (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(selectedClassId !== 'all' ? `/teacher/classes/${selectedClassId}` : '/teacher/dashboard')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {selectedClassId !== 'all' ? 'Back to Class' : 'Back to Dashboard'}
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Assignments</h1>
                <p className="text-gray-600 mt-1">
                  Manage reading homework and track student recording progress
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Class Filter Dropdown */}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <Select value={selectedClassId} onValueChange={handleClassChange}>
                  <SelectTrigger id="assignment-class-filter" className="w-[200px] h-9 bg-white">
                    <SelectValue placeholder="All Classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {sortedClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.gradeLevel != null ? `Grade ${cls.gradeLevel} · ${cls.name}` : cls.name}
                        {cls.active === false ? ' (Archived)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Assignment
              </Button>
            </div>
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

        {/* Current vs Archived Tabs */}
        <div className="flex items-center justify-between mb-6">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'current' | 'archived')} className="w-auto">
            <TabsList className="bg-gray-100 p-1">
              <TabsTrigger value="current" className="flex items-center gap-2 px-4 py-2">
                <BookOpen className="w-4 h-4" />
                <span>Current Assignments</span>
                <Badge variant="secondary" className="ml-1 bg-white text-gray-700 text-xs">
                  {currentAssignments.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2 px-4 py-2">
                <Archive className="w-4 h-4" />
                <span>Archived Assignments</span>
                <Badge variant="secondary" className="ml-1 bg-white text-gray-700 text-xs">
                  {archivedAssignments.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <span className="text-sm text-gray-500 hidden sm:inline">
            {activeTab === 'current'
              ? 'Showing active reading assignments'
              : 'Past semester and completed assignments'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500">
            Loading assignments...
          </div>
        ) : displayedAssignments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              {activeTab === 'current' ? (
                <>
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No current assignments</h3>
                  <p className="text-gray-600 mb-6">
                    {selectedClassId !== 'all'
                      ? 'This class has no active reading homework. Create one to get started!'
                      : 'Create your first assignment to get started with student reading practice.'}
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Assignment
                  </Button>
                </>
              ) : (
                <>
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No archived assignments</h3>
                  <p className="text-gray-600">
                    Assignments you archive or from previous semesters will appear here for reference.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {displayedAssignments.map((assignment) => {
              const needsReviewNames = assignment.needsReviewStudents.map((student) => `${student.firstName} ${student.lastName}`.trim());
              const displayedNeedsReview = needsReviewNames.slice(0, 5);
              const extraNeedsReview = needsReviewNames.length - displayedNeedsReview.length;

              const notStartedNames = assignment.notStartedStudents.map((student) => `${student.firstName} ${student.lastName}`.trim());
              const displayedNotStarted = notStartedNames.slice(0, 5);
              const extraNotStarted = notStartedNames.length - displayedNotStarted.length;

              const completionRate = assignment.totalStudents > 0
                ? Math.round((assignment.reviewedCount / assignment.totalStudents) * 100)
                : 0;

              const isPastCohort = assignment.classActive === false || Boolean(assignment.classPromotedToClassId);

              return (
                <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <CardTitle className="text-xl">{assignment.title}</CardTitle>
                          <Badge className={getStatusColor(assignment.status)}>
                            {assignment.status === 'archived' ? 'Archived' : assignment.status}
                          </Badge>
                          {isPastCohort && (
                            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 text-xs">
                              Past Semester Class
                            </Badge>
                          )}
                          {assignment.classGradeLevel != null && (
                            <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                              Grade {assignment.classGradeLevel}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-base">
                          {assignment.description || 'No description provided'}
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
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

                        {/* Archive / Restore Action */}
                        {activeTab === 'current' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-gray-600 hover:text-gray-900"
                            onClick={() => handleArchiveAssignment(assignment.id, assignment.title)}
                            title="Archive assignment (move off current board)"
                          >
                            <Archive className="w-4 h-4 mr-1" />
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => handleRestoreAssignment(assignment.id, assignment.title)}
                            title="Restore assignment back to active board"
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Restore
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
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" />
                          {assignment.totalStudents > 0
                            ? `${assignment.reviewedCount} of ${assignment.totalStudents} fully reviewed (${completionRate}%)`
                            : 'No students enrolled yet'}
                        </span>
                      </div>

                      {assignment.totalStudents > 0 && (
                        <div className="flex flex-col gap-2">
                          {/* Needs Review Section */}
                          {needsReviewNames.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded-md border border-amber-100">
                              <span className="flex items-center gap-1 font-medium">
                                <AlertCircle className="w-4 h-4" />
                                {needsReviewNames.length} Needs Review:
                              </span>
                              {displayedNeedsReview.map((name) => (
                                <Badge key={name} variant="outline" className="text-amber-700 bg-white border-amber-300">
                                  {name}
                                </Badge>
                              ))}
                              {extraNeedsReview > 0 && (
                                <span className="text-xs text-amber-500">+{extraNeedsReview} more</span>
                              )}
                            </div>
                          )}

                          {/* Not Started Section */}
                          {notStartedNames.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                              <span className="flex items-center gap-1 font-medium text-gray-600">
                                <Clock className="w-4 h-4" />
                                {notStartedNames.length} Not Started:
                              </span>
                              {displayedNotStarted.map((name) => (
                                <Badge key={name} variant="outline" className="text-gray-600 bg-gray-50 border-gray-200">
                                  {name}
                                </Badge>
                              ))}
                              {extraNotStarted > 0 && (
                                <span className="text-xs text-gray-400">+{extraNotStarted} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <BookOpen className="w-4 h-4" />
                        <span>Story: {assignment.storyTitle}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <GraduationCap className="w-4 h-4" />
                        <span>Class: {assignment.className}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>Due: {formatDate(assignment.dueAt)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm text-gray-500 border-t pt-4">
                      <span>Max attempts: {assignment.maxAttempts}</span>
                      <span>Created {format(new Date(assignment.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
