"use client";

import { useState } from "react";
import { StudentSelector } from "@/components/auth/student-selector";
import { VisualPasswordInput } from "@/components/auth/visual-password-input";
import { useRouter } from "next/navigation";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  visualPasswordType: 'animal' | 'object' | 'color_shape';
  visualPasswordData: any;
}

export default function StudentLoginPage() {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const router = useRouter();

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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      console.log(`Student ${selectedStudent.firstName} logged in successfully`);

      // Use replace instead of push to avoid back navigation issues
      // Also use window.location.href as a fallback
      try {
        router.replace('/student/dashboard');
        // Force redirect after a short delay if router doesn't work
        setTimeout(() => {
          if (window.location.pathname === '/student-login') {
            window.location.href = '/student/dashboard';
          }
        }, 1000);
      } catch (routerError) {
        console.log('Router failed, using window.location fallback');
        window.location.href = '/student/dashboard';
      }
    } catch (error) {
      console.error('Login error:', error);
      // Handle error - could show toast or pass error back to VisualPasswordInput
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-center min-h-full">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              📚 Reading Practice
            </h1>
            <p className="text-lg text-gray-600">
              Student Login
            </p>
          </div>
          
          {!selectedStudent ? (
            <StudentSelector onStudentSelect={handleStudentSelect} />
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
          </div>
        </div>
      </div>
    </div>
  );
}