"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateClassDialog } from "@/components/classes/create-class-dialog";
import { CreateStudentDialog } from "@/components/students/create-student-dialog";
import {
  Users,
  Plus,
  Settings,
  BookOpen,
  UserPlus,
  Calendar,
  GraduationCap,
} from "lucide-react";

interface Class {
  id: string;
  name: string;
  description: string | null;
  gradeLevel: number | null;
  academicYear: string | null;
  active: boolean;
  createdAt: string;
  schoolName: string;
  studentCount?: number;
  students?: Student[];
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  enrolledAt: string;
}

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/teacher/classes');

      if (response.ok) {
        const data = await response.json();
        setClasses(data.classes || []);
      } else {
        console.error('Failed to fetch classes');
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassDetails = async (classId: string) => {
    try {
      const response = await fetch(`/api/teacher/classes/${classId}`);

      if (response.ok) {
        const data = await response.json();
        setClasses(prev => prev.map(cls =>
          cls.id === classId
            ? { ...cls, studentCount: data.class.studentCount, students: data.class.students }
            : cls
        ));
      }
    } catch (error) {
      console.error('Error fetching class details:', error);
    }
  };

  const handleClassCreated = () => {
    fetchClasses();
  };

  const handleStudentCreated = () => {
    fetchClasses();
    if (expandedClass) {
      fetchClassDetails(expandedClass);
    }
  };

  const handleAddStudentToClass = (classId: string) => {
    setSelectedClassId(classId);
    setShowCreateStudent(true);
  };

  const toggleClassExpansion = (classId: string) => {
    if (expandedClass === classId) {
      setExpandedClass(null);
    } else {
      setExpandedClass(classId);
      fetchClassDetails(classId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading classes...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
              <p className="text-gray-600 mt-1">
                Manage your classes and students
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowCreateStudent(true)} variant="outline">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Student
              </Button>
              <Button onClick={() => setShowCreateClass(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Class
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {classes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <GraduationCap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No classes yet</h3>
              <p className="text-gray-600 mb-6">
                Create your first class to start managing students and assignments
              </p>
              <Button onClick={() => setShowCreateClass(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {classes.map((cls) => (
              <Card key={cls.id} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                        {cls.name}
                        {!cls.active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {cls.description && (
                          <span className="block">{cls.description}</span>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          {cls.gradeLevel && (
                            <span className="flex items-center gap-1">
                              <GraduationCap className="w-4 h-4" />
                              Grade {cls.gradeLevel}
                            </span>
                          )}
                          {cls.academicYear && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {cls.academicYear}
                            </span>
                          )}
                          <span>Created {formatDate(cls.createdAt)}</span>
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {cls.studentCount ?? 0} students
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddStudentToClass(cls.id)}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Add Student
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleClassExpansion(cls.id)}
                      >
                        {expandedClass === cls.id ? 'Hide Details' : 'View Details'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedClass === cls.id && (
                  <CardContent className="border-t bg-gray-50">
                    <div className="py-4">
                      <h4 className="font-medium text-gray-900 mb-3">
                        Enrolled Students ({cls.students?.length || 0})
                      </h4>
                      {cls.students && cls.students.length > 0 ? (
                        <div className="grid gap-2">
                          {cls.students.map((student) => (
                            <div
                              key={student.id}
                              className="flex items-center justify-between p-3 bg-white rounded-lg border"
                            >
                              <div>
                                <div className="font-medium">
                                  {student.firstName} {student.lastName}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {student.gradeLevel && `Grade ${student.gradeLevel}`}
                                  {student.gradeLevel && student.readingLevel && ' • '}
                                  {student.readingLevel && `Reading Level: ${student.readingLevel}`}
                                </div>
                              </div>
                              <div className="text-sm text-gray-500">
                                Enrolled {formatDate(student.enrolledAt)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                          <p>No students enrolled yet</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => handleAddStudentToClass(cls.id)}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Add First Student
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateClassDialog
        open={showCreateClass}
        onOpenChange={setShowCreateClass}
        onSuccess={handleClassCreated}
      />

      <CreateStudentDialog
        open={showCreateStudent}
        onOpenChange={(open) => {
          setShowCreateStudent(open);
          if (!open) setSelectedClassId(null);
        }}
        onSuccess={handleStudentCreated}
        preselectedClassId={selectedClassId || undefined}
      />
    </div>
  );
}