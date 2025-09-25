"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ANIMALS, OBJECTS, VisualPasswordOption } from "@/components/auth/visual-password-options";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  visualPasswordType: "animal" | "object" | null;
  visualPasswordData: any;
}

interface ClassResponse {
  class: {
    id: string;
    name: string;
    description: string | null;
    students: Student[];
  };
}

interface VisualPasswordDisplay {
  label: string;
  emoji: string;
  description: string;
}

function capitalize(value?: string | null): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getOptionById(options: VisualPasswordOption[], id?: string | null) {
  if (!id) return undefined;
  return options.find((option) => option.id === id);
}

function getVisualPasswordDisplay(
  type: Student["visualPasswordType"],
  data: Student["visualPasswordData"],
): VisualPasswordDisplay {
  if (!type || !data) {
    return {
      label: "Visual Password",
      emoji: "❔",
      description: "Password not set",
    };
  }

  if (type === "animal") {
    const option = getOptionById(ANIMALS, data?.animal);
    return {
      label: "Animal Password",
      emoji: option?.emoji ?? "🐾",
      description: option?.name ?? capitalize(data?.animal),
    };
  }

  if (type === "object") {
    const option = getOptionById(OBJECTS, data?.object);
    return {
      label: "Picture Password",
      emoji: option?.emoji ?? "🎨",
      description: option?.name ?? capitalize(data?.object),
    };
  }

  return {
    label: "Visual Password",
    emoji: "❔",
    description: "Password not set",
  };
}

export default function LoginCardsPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params?.classId as string | undefined;

  const [classData, setClassData] = useState<ClassResponse["class"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    } else if (process.env.NEXT_PUBLIC_APP_URL) {
      setOrigin(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
    }
  }, []);

  useEffect(() => {
    if (!classId) return;

    const fetchClass = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/teacher/classes/${classId}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load class information");
        }
        const data = (await response.json()) as ClassResponse;
        setClassData(data.class);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load class information");
      } finally {
        setLoading(false);
      }
    };

    fetchClass();
  }, [classId]);

  const loginUrl = useMemo(() => {
    if (!classId) return "";
    const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/student-login/${classId}`;
  }, [classId, origin]);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading login cards...
        </div>
      </div>
    );
  }

  if (error || !classData || !classId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <p className="text-red-600 mb-4">{error || "Class not found"}</p>
        <Button onClick={() => router.push('/teacher/classes')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Login Cards for {classData.name}</h1>
            <p className="text-gray-600">
              Print and cut these cards. Each card includes your class QR code and the student's visual password.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/teacher/classes')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" /> Print Cards
            </Button>
          </div>
        </div>

        {classData.students.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <p className="text-gray-600">No students enrolled in this class yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 print:grid-cols-2 print:gap-3">
            {classData.students.map((student) => {
              const visual = getVisualPasswordDisplay(student.visualPasswordType, student.visualPasswordData);

              return (
                <Card
                  key={student.id}
                  className="bg-white border-2 border-gray-200 shadow-sm print:shadow-none print:border-gray-400"
                >
                  <CardContent className="p-4 flex flex-col h-full justify-between">
                    <div className="space-y-3 text-center">
                      {(() => {
                        const studentLoginUrl = `${loginUrl}?student=${student.id}`;
                        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(studentLoginUrl)}`;
                        return (
                          <img
                            src={qrSrc}
                            alt={`QR code for ${student.firstName}`}
                            className="mx-auto w-24 h-24 border border-gray-200 rounded"
                          />
                        );
                      })()}
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {student.firstName} {student.lastName}
                        </h2>
                        <p className="text-sm text-gray-500">{classData.name}</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                          {visual.label}
                        </p>
                        <div className="text-4xl mb-1">{visual.emoji}</div>
                        <p className="text-sm text-blue-800 font-medium">{visual.description}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        Ask your teacher for help if you can't scan the code.
                      </p>
                    </div>
                    <div className="mt-4 text-xs text-gray-400 text-center">
                      Scan the QR code or visit the link above. Choose your name and tap your picture password to log in.
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
