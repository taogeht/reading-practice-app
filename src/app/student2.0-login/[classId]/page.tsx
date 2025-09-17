"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { StudentSelector } from "@/components/auth/student-selector";
import { VisualPasswordInput } from "@/components/auth/visual-password-input";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  visualPasswordType: 'animal' | 'object' | 'color_shape';
  visualPasswordData: any;
}

interface ClassInfo {
  id: string;
  name: string;
  teacherName: string;
}

export default function ClassStudentLoginPage() {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;

  useEffect(() => {
    if (classId) {
      fetchClassInfo();
    }
  }, [classId]);

  const fetchClassInfo = async () => {
    try {
      const response = await fetch(`/api/classes/${classId}/info`);
      if (response.ok) {
        const data = await response.json();
        setClassInfo(data.class);
      } else {
        setError('Class not found or not accessible');
      }
    } catch (error) {
      console.error('Error fetching class info:', error);
      setError('Failed to load class information');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student);
  };

  const handleBack = () => {
    setSelectedStudent(null);
  };

  const handleLoginSuccess = async (visualPassword: string) => {
    if (!selectedStudent) return;

    try {
      const response = await fetch('/api/auth/student-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          visualPassword: visualPassword,
          classId: classId, // Include class context
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      console.log(`Student ${selectedStudent.firstName} logged in successfully`);

      // Use replace instead of push to avoid back navigation issues
      try {
        router.replace('/student2.0/dashboard');
        // Force redirect after a short delay if router doesn't work
        setTimeout(() => {
          if (window.location.pathname.includes('/student2.0-login')) {
            window.location.href = '/student2.0/dashboard';
          }
        }, 1000);
      } catch (routerError) {
        console.log('Router failed, using window.location fallback');
        window.location.href = '/student2.0/dashboard';
      }
    } catch (error) {
      console.error('Login error:', error);
      // Handle error - could show toast or pass error back to VisualPasswordInput
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading class information...</div>
      </div>
    );
  }

  if (error || !classInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Class Not Found</h2>
          <p className="text-red-600 mb-6">{error || 'The class link you used is not valid.'}</p>
          <button
            onClick={() => router.push('/student2.0-login')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Go to General Student Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-center min-h-full">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              📚 Reading Practice
            </h1>
            <div className="bg-white rounded-lg p-4 mb-6 border border-blue-200">
              <h2 className="text-xl font-semibold text-blue-800 mb-1">
                {classInfo.name}
              </h2>
              <p className="text-blue-600">
                Teacher: {classInfo.teacherName}
              </p>
            </div>
            <p className="text-lg text-gray-600">
              Student Login
            </p>
          </div>

          {!selectedStudent ? (
            <StudentSelector
              onStudentSelect={handleStudentSelect}
              classId={classId}
            />
          ) : (
            <VisualPasswordInput
              student={selectedStudent}
              onBack={handleBack}
              onSuccess={handleLoginSuccess}
            />
          )}

          <div className="text-center">
            <p className="text-sm text-gray-500">
              Are you a teacher? {" "}
              <a href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                Sign in here
              </a>
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Looking for a different class? {" "}
              <a href="/student2.0-login" className="text-blue-600 hover:text-blue-500">
                View all students
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}