"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreateStudentDialog } from "@/components/students/create-student-dialog";
import { ScheduleSection } from "@/components/schedule/schedule-section";
import {
  Users,
  UserPlus,
  Calendar,
  GraduationCap,
  BookOpen,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Trash2,
  Settings,
  FileText,
  Plus,
  Crown,
  User,
} from "lucide-react";

interface Class {
  id: string;
  name: string;
  description: string | null;
  gradeLevel: number | null;
  academicYear: string | null;
  active: boolean;
  createdAt: string;
  studentCount: number;
  students: Student[];
  teacher?: Teacher;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  enrolledAt: string;
}

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function AdminClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;

  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    gradeLevel: "",
    academicYear: "",
    active: true,
  });

  useEffect(() => {
    if (classId) {
      fetchClassData();
    }
  }, [classId]);

  const fetchClassData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/classes/${classId}`);

      if (response.ok) {
        const data = await response.json();
        setClassData(data.class);
        setEditForm({
          name: data.class.name,
          description: data.class.description || "",
          gradeLevel: data.class.gradeLevel?.toString() || "",
          academicYear: data.class.academicYear || "",
          active: data.class.active,
        });
      } else {
        console.error('Failed to fetch class data');
        router.push('/admin/classes');
      }
    } catch (error) {
      console.error('Error fetching class data:', error);
      router.push('/admin/classes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      const response = await fetch(`/api/admin/classes/${classId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          gradeLevel: editForm.gradeLevel ? parseInt(editForm.gradeLevel) : null,
          academicYear: editForm.academicYear || null,
          active: editForm.active,
        }),
      });

      if (response.ok) {
        await fetchClassData();
        setIsEditing(false);
      } else {
        console.error('Failed to update class');
      }
    } catch (error) {
      console.error('Error updating class:', error);
    }
  };

  const handleDeleteClass = async () => {
    if (!classData) return;

    const confirmed = confirm(
      `Are you sure you want to delete "${classData.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/classes/${classId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/classes');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete class');
      }
    } catch (error) {
      console.error('Error deleting class:', error);
      alert('Failed to delete class');
    }
  };

  const handleStudentCreated = () => {
    fetchClassData();
  };

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    const confirmed = confirm(
      `Are you sure you want to remove ${studentName} from this class?`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/classes/${classId}/students/${studentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchClassData();
      } else {
        console.error('Failed to remove student');
      }
    } catch (error) {
      console.error('Error removing student:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm({
      name: classData?.name || "",
      description: classData?.description || "",
      gradeLevel: classData?.gradeLevel?.toString() || "",
      academicYear: classData?.academicYear || "",
      active: classData?.active || true,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading class details...</div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Class Not Found</h2>
          <p className="text-gray-600 mb-4">The class you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/admin/classes')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Classes
          </Button>
        </div>
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
              <Button
                variant="outline"
                onClick={() => router.push('/admin/classes')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Classes
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-8 h-8 text-blue-600" />
                  {classData.name}
                  {!classData.active && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    <Crown className="w-3 h-3 mr-1" />
                    Admin View
                  </Badge>
                </h1>
                <p className="text-gray-600 mt-1">
                  Administrative class management and oversight
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowCreateStudent(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/admin/assignments?classId=${classId}`)}
              >
                <FileText className="w-4 h-4 mr-2" />
                View Assignments
              </Button>
              {!isEditing ? (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Class
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={handleSaveChanges} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="outline" onClick={cancelEdit} size="sm">
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Class Details */}
          <div className="lg:col-span-1 space-y-6">
            {/* Class Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Class Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div>
                      <Label htmlFor="className">Class Name</Label>
                      <Input
                        id="className"
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter class name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enter class description"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="gradeLevel">Grade Level</Label>
                      <Input
                        id="gradeLevel"
                        type="number"
                        value={editForm.gradeLevel}
                        onChange={(e) => setEditForm(prev => ({ ...prev, gradeLevel: e.target.value }))}
                        placeholder="Enter grade level"
                        min="1"
                        max="12"
                      />
                    </div>
                    <div>
                      <Label htmlFor="academicYear">Academic Year</Label>
                      <Input
                        id="academicYear"
                        value={editForm.academicYear}
                        onChange={(e) => setEditForm(prev => ({ ...prev, academicYear: e.target.value }))}
                        placeholder="e.g., 2024-2025"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="active"
                        checked={editForm.active}
                        onChange={(e) => setEditForm(prev => ({ ...prev, active: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="active">Active Class</Label>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Description</p>
                      <p className="text-gray-900">{classData.description || "No description"}</p>
                    </div>
                    {classData.gradeLevel && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-900">Grade {classData.gradeLevel}</span>
                      </div>
                    )}
                    {classData.academicYear && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-900">{classData.academicYear}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-600">Created</p>
                      <p className="text-gray-900">{formatDate(classData.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status</p>
                      <Badge variant={classData.active ? "default" : "secondary"}>
                        {classData.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Teacher Information */}
            {classData.teacher && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Assigned Teacher
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 font-medium">
                        {classData.teacher.firstName[0]}{classData.teacher.lastName[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {classData.teacher.firstName} {classData.teacher.lastName}
                      </p>
                      <p className="text-sm text-gray-600">{classData.teacher.email}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {classData.studentCount}
                  </div>
                  <p className="text-gray-600">
                    {classData.studentCount === 1 ? 'Student' : 'Students'} Enrolled
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Class Schedule - Admin can edit */}
            <ScheduleSection classId={classId} isAdmin={true} />

            {/* Danger Zone */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible administrative actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={handleDeleteClass}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Class (Admin Override)
                </Button>
                <p className="text-sm text-gray-500 mt-2">
                  As an admin, you can delete classes even with enrolled students
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Students */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Enrolled Students ({classData.studentCount})
                    </CardTitle>
                    <CardDescription>
                      Manage students in this class
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowCreateStudent(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Student
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {classData.students.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No students enrolled</h3>
                    <p className="text-gray-600 mb-6">
                      Start building this class by adding students
                    </p>
                    <Button onClick={() => setShowCreateStudent(true)}>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add First Student
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {classData.students.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-medium">
                                {student.firstName[0]}{student.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">
                                {student.firstName} {student.lastName}
                              </h4>
                              <div className="flex items-center gap-3 text-sm text-gray-600">
                                {student.gradeLevel && (
                                  <span>Grade {student.gradeLevel}</span>
                                )}
                                {student.readingLevel && (
                                  <span>Reading Level: {student.readingLevel}</span>
                                )}
                                <span>Enrolled {formatDate(student.enrolledAt)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/students/${student.id}`)}
                          >
                            View Profile
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveStudent(student.id, `${student.firstName} ${student.lastName}`)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create Student Dialog */}
      <CreateStudentDialog
        open={showCreateStudent}
        onOpenChange={setShowCreateStudent}
        onSuccess={handleStudentCreated}
        preselectedClassId={classId}
      />
    </div>
  );
}