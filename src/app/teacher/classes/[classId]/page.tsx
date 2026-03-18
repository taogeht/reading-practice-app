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
import { SpellingWordsSection } from "@/components/spelling/spelling-words-section";
import { WordMasterySection } from "@/components/spelling/word-mastery-section";
import { AttendanceSection } from "@/components/attendance/attendance-section";

import { MakeupWorkSection } from "@/components/attendance/makeup-work-section";
import { LoginActivitySection } from "@/components/activity/login-activity-section";
import { ScheduleSection } from "@/components/schedule/schedule-section";
import { SortableCardList } from "@/components/ui/sortable-card-list";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  ChevronDown,
  Info,
  CreditCard,
} from "lucide-react";

interface Class {
  id: string;
  name: string;
  description: string | null;
  gradeLevel: number | null;
  academicYear: string | null;
  active: boolean;
  showPracticeStories: boolean;
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
  const [showStudentsSheet, setShowStudentsSheet] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    gradeLevel: "",
    academicYear: "",
    active: true,
    showPracticeStories: false,
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
          showPracticeStories: data.class.showPracticeStories || false,
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
          showPracticeStories: editForm.showPracticeStories,
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
      showPracticeStories: classData?.showPracticeStories || false,
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => router.push('/teacher/dashboard')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
              {classData.name}
              {!classData.active && (
                <Badge variant="secondary">Inactive</Badge>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="ml-1 text-gray-400 hover:text-blue-600 transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Class Information</h4>
                    {classData.description && (
                      <div>
                        <p className="text-xs font-medium text-gray-500">Description</p>
                        <p className="text-sm text-gray-900">{classData.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      {classData.gradeLevel && (
                        <div className="flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm">Grade {classData.gradeLevel}</span>
                        </div>
                      )}
                      {classData.academicYear && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm">{classData.academicYear}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm">{classData.studentCount} students</span>
                      </div>
                      <div>
                        <Badge variant={classData.active ? "default" : "secondary"} className="text-xs">
                          {classData.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Practice Stories</p>
                      <Badge variant={classData.showPracticeStories ? "default" : "secondary"} className="text-xs">
                        {classData.showPracticeStories ? "Enabled" : "Hidden"}
                      </Badge>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-gray-500 mb-2">Schedule</p>
                      <ScheduleSection classId={classId} compact={true} />
                    </div>
                    <p className="text-xs text-gray-400">Created {formatDate(classData.createdAt)}</p>
                  </div>
                </PopoverContent>
              </Popover>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setShowStudentsSheet(true)} variant="outline" size="sm">
              <Users className="w-4 h-4 mr-1.5" />
              Students ({classData.studentCount})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/teacher/assignments?classId=${classId}`)}
            >
              <FileText className="w-4 h-4 mr-1.5" />
              Assignments
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/teacher/classes/${classId}/progress`)}
            >
              <BookOpen className="w-4 h-4 mr-1.5" />
              Class Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleQRCodeClick}
            >
              <QrCode className="w-4 h-4 mr-1.5" />
              Class QR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/teacher/classes/${classId}/login-cards`)}
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Login Cards
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Column - Secondary Items */}
          <div className="lg:col-span-1 space-y-6">
            {/* Login Activity */}
            <LoginActivitySection classId={classId} defaultExpanded={false} />

            {/* Advanced Settings - Collapsible */}
            <details className="group">
              <summary className="cursor-pointer list-none p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Settings className="w-4 h-4" />
                    <span className="text-sm">Advanced Settings</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
                </div>
              </summary>
              <div className="mt-2 space-y-3">
                <div className="p-4 border rounded-lg bg-white">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Class
                  </Button>
                </div>
                <div className="p-4 border border-red-200 rounded-lg bg-red-50/50">
                  <h4 className="text-red-600 font-medium flex items-center gap-2 mb-2">
                    <Trash2 className="w-4 h-4" />
                    Danger Zone
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Irreversible actions for this class
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteClass}
                    size="sm"
                    disabled={classData.studentCount > 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Class
                  </Button>
                  {classData.studentCount > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Remove all students first
                    </p>
                  )}
                </div>
              </div>
            </details>
          </div>

          {/* Right Column - Main Content (drag to reorder) */}
          <div className="lg:col-span-3">
            <SortableCardList
              storageKey={`class-dashboard-${classId}`}
              cards={[
                {
                  id: "spelling",
                  node: <SpellingWordsSection classId={classId} defaultExpanded={true} />,
                },
                {
                  id: "word-mastery",
                  node: <WordMasterySection classId={classId} defaultExpanded={false} />,
                },
                {
                  id: "attendance",
                  node: <AttendanceSection classId={classId} className={classData.name} />,
                },
                {
                  id: "makeup",
                  node: <MakeupWorkSection classId={classId} />,
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Edit Class Dialog */}
      <Dialog open={isEditing} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                Edit Class
              </span>
            </DialogTitle>
            <DialogDescription>
              Update class settings and details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gradeLevel">Grade Level</Label>
                <Input
                  id="gradeLevel"
                  type="number"
                  value={editForm.gradeLevel}
                  onChange={(e) => setEditForm(prev => ({ ...prev, gradeLevel: e.target.value }))}
                  placeholder="Grade"
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
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showPracticeStories"
                checked={editForm.showPracticeStories}
                onChange={(e) => setEditForm(prev => ({ ...prev, showPracticeStories: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="showPracticeStories">
                <div>
                  <div>Show Practice Stories to Students</div>
                  <p className="text-xs text-gray-600 font-normal">Students will see a practice stories library on their dashboard</p>
                </div>
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button onClick={() => { handleSaveChanges(); }}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Student Login QR Code
              </div>
            </DialogTitle>
            <DialogDescription>
              Students can scan this QR code to access the login page for {classData?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* QR Code Display */}
            <div className="bg-white p-4 rounded-lg border flex justify-center">
              {isGeneratingQR ? (
                <div className="w-48 h-48 flex items-center justify-center text-gray-400">
                  Generating...
                </div>
              ) : qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Class login QR code"
                  className="w-48 h-48"
                  id="qr-code-image"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
                  Click to generate
                </div>
              )}
            </div>

            {/* URL Display */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Student Login URL:</p>
              <p className="text-sm font-mono break-all text-gray-700">
                {typeof window !== 'undefined' ? `${window.location.origin}/student-login/${classId}` : ''}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={copyToClipboard}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy URL
              </Button>
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

      {/* Students Sheet (Slide-out Panel) */}
      <Sheet open={showStudentsSheet} onOpenChange={setShowStudentsSheet}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Enrolled Students ({classData.studentCount})
            </SheetTitle>
            <SheetDescription>
              Manage students in {classData.name}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <Button onClick={() => setShowCreateStudent(true)} className="w-full">
              <UserPlus className="w-4 h-4 mr-2" />
              Add New Student
            </Button>

            {classData.students.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No students enrolled yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {classData.students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium text-sm">
                          {student.firstName[0]}{student.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">
                          {student.firstName} {student.lastName}
                        </h4>
                        <p className="text-xs text-gray-500">
                          {student.gradeLevel ? `Grade ${student.gradeLevel}` : 'No grade set'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/teacher/students/${student.id}`)}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveStudent(student.id, `${student.firstName} ${student.lastName}`)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

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