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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  QrCode,
  Copy,
  Download,
  Share2,
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
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  enrolledAt: string;
}

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;

  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
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
      const response = await fetch(`/api/teacher/classes/${classId}`);

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
        router.push('/teacher/classes');
      }
    } catch (error) {
      console.error('Error fetching class data:', error);
      router.push('/teacher/classes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      const response = await fetch(`/api/teacher/classes/${classId}`, {
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
      const response = await fetch(`/api/teacher/classes/${classId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/teacher/classes');
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
      const response = await fetch(`/api/teacher/classes/${classId}/students/${studentId}`, {
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

  const generateQRCode = async () => {
    setIsGeneratingQR(true);
    try {
      const studentLoginUrl = `${window.location.origin}/student-login/${classId}`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(studentLoginUrl)}`;
      setQrCodeUrl(qrApiUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
    } finally {
      setIsGeneratingQR(false);
    }
  };

  const copyToClipboard = () => {
    const studentLoginUrl = `${window.location.origin}/student-login/${classId}`;
    navigator.clipboard.writeText(studentLoginUrl);
  };

  const downloadQRCode = () => {
    if (qrCodeUrl && classData) {
      const link = document.createElement('a');
      link.href = qrCodeUrl;
      link.download = `${classData.name}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleQRCodeClick = () => {
    setShowQRDialog(true);
    generateQRCode();
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
          <div className="flex gap-2">
            <Button onClick={() => router.push('/teacher/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <Button variant="outline" onClick={() => router.push('/teacher/classes')}>
              All Classes
            </Button>
          </div>
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/teacher/dashboard')}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/teacher/classes')}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  All Classes
                </Button>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-8 h-8 text-blue-600" />
                  {classData.name}
                  {!classData.active && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </h1>
                <p className="text-gray-600 mt-1">
                  Class management and student overview
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* QR Code for student class login */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleQRCodeClick}
              >
                <QrCode className="w-4 h-4 mr-2" />
                Class QR Code
              </Button>
              <Button onClick={() => setShowCreateStudent(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/teacher/assignments?classId=${classId}`)}
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

            {/* Danger Zone */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible actions for this class
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={handleDeleteClass}
                  className="w-full"
                  disabled={classData.studentCount > 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Class
                </Button>
                {classData.studentCount > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Remove all students before deleting the class
                  </p>
                )}
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
                      Start building your class by adding students
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
                            onClick={() => router.push(`/teacher/students/${student.id}`)}
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

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Student Login QR Code
            </DialogTitle>
            <DialogDescription>
              Students can scan this QR code to access the login page for {classData?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* QR Code Display */}
            <Card>
              <CardContent className="p-6">
                <div className="text-center">
                  {isGeneratingQR ? (
                    <div className="flex items-center justify-center h-48">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : qrCodeUrl ? (
                    <div className="space-y-4">
                      <img
                        src={qrCodeUrl}
                        alt={`QR Code for ${classData?.name}`}
                        className="mx-auto border rounded-lg"
                        width={300}
                        height={300}
                      />
                      <p className="text-xs text-gray-500">
                        Scan with any QR code reader or camera app
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-gray-400">
                      <QrCode className="w-16 h-16" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* URL Display */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Direct Link</CardTitle>
                <CardDescription className="text-xs">
                  Share this link directly with students
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 p-2 bg-gray-50 rounded text-xs font-mono break-all">
                    {`${typeof window !== 'undefined' ? window.location.origin : ''}/student-login/${classId}`}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyToClipboard}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={downloadQRCode}
                disabled={!qrCodeUrl}
              >
                <Download className="w-4 h-4 mr-2" />
                Download QR
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const studentLoginUrl = `${window.location.origin}/student-login/${classId}`;
                  if (navigator.share) {
                    navigator.share({
                      title: `${classData?.name} - Student Login`,
                      text: `Join ${classData?.name} for reading practice`,
                      url: studentLoginUrl,
                    });
                  } else {
                    copyToClipboard();
                  }
                }}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share Link
              </Button>
            </div>

            {/* Instructions */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <h4 className="font-medium text-blue-800 mb-2 text-sm">How to use:</h4>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Share the QR code with your students</li>
                  <li>• Students scan the code with their device camera</li>
                  <li>• They'll see only students from {classData?.name}</li>
                  <li>• Students can then log in with their visual password</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

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