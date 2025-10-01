"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { StudentSelector } from "@/components/auth/student-selector";
import { VisualPasswordInput } from "@/components/auth/visual-password-input";
import { useAuth } from "@/components/providers/auth-provider";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  visualPasswordType: "animal" | "object";
}

interface ClassInfo {
  id: string;
  name: string;
  teacherName: string;
}

export default function ClassStudentLoginPage() {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [loadingClass, setLoadingClass] = useState(true);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshUser } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const classId = params.classId as string;

  const studentIdFromUrl = useMemo(
    () => searchParams?.get("student") ?? null,
    [searchParams],
  );

  useEffect(() => {
    if (classId) {
      fetchClassInfo();
    }
  }, [classId]);

  useEffect(() => {
    if (!classId || !studentIdFromUrl) return;

    const autoSelectStudent = async () => {
      try {
        setLoadingStudent(true);
        const response = await fetch(
          `/api/classes/${classId}/students/${studentIdFromUrl}`,
        );
        if (!response.ok) {
          throw new Error("Student not found");
        }
        const data = await response.json();
        setSelectedStudent(data.student);
      } catch (err) {
        console.error("Failed to preselect student", err);
      } finally {
        setLoadingStudent(false);
      }
    };

    autoSelectStudent();
  }, [classId, studentIdFromUrl]);

  const fetchClassInfo = async () => {
    try {
      const response = await fetch(`/api/classes/${classId}/info`);
      if (response.ok) {
        const data = await response.json();
        setClassInfo(data.class);
      } else {
        setError("Class not found or not accessible");
      }
    } catch (error) {
      console.error("Error fetching class info:", error);
      setError("Failed to load class information");
    } finally {
      setLoadingClass(false);
    }
  };

  const handleStudentSelect = (student: Student) => {
    setSelectedStudent(student);
  };

  const handleBack = () => {
    setSelectedStudent(null);
  };

  const handlePasswordAttempt = async (
    visualPassword: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!selectedStudent) {
      return { success: false, error: "Select your name to continue." };
    }

    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          visualPassword,
          classId,
        }),
      });

      if (response.ok) {
        await refreshUser();
        router.replace("/student/dashboard");
        return { success: true };
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return { success: false, error: data.error || "That's not the right picture. Try again!" };
      }

      return { success: false, error: data.error || "Login failed. Please try again." };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "We couldn't reach the server. Please try again." };
    }
  };

  if (loadingClass || loadingStudent) {
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
          <p className="text-red-600 mb-6">{error || "The class link you used is not valid."}</p>
          <button
            onClick={() => router.push("/student-login")}
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
            <h1 className="text-4xl font-bold text-gray-900 mb-2">📚 Reading Practice</h1>
            <div className="bg-white rounded-lg p-4 mb-6 border border-blue-200">
              <h2 className="text-xl font-semibold text-blue-800 mb-1">{classInfo.name}</h2>
              <p className="text-blue-600">Teacher: {classInfo.teacherName}</p>
            </div>
            <p className="text-lg text-gray-600">Student Login</p>
          </div>

          {!selectedStudent ? (
            <StudentSelector onStudentSelect={handleStudentSelect} classId={classId} />
          ) : (
            <VisualPasswordInput
              student={selectedStudent}
              onBack={studentIdFromUrl ? undefined : handleBack}
              onAttempt={handlePasswordAttempt}
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
              Need a different class link? {" "}
              <a href="/student-login" className="text-blue-600 hover:text-blue-500">
                Enter another code
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
