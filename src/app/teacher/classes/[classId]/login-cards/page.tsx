"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  loginToken: string | null;
}

interface ClassResponse {
  class: {
    id: string;
    name: string;
    description: string | null;
    students: Student[];
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
    // Prefer NEXT_PUBLIC_APP_URL so QR codes always point to production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (appUrl) {
      setOrigin(appUrl);
    } else if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
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

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Preparing login cards...
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

  const base = origin || "";

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Login Cards for {classData.name}</h1>
            <p className="text-gray-600">
              Print and cut these cards. Each student has a unique QR code for instant login — no password needed.
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
              const loginUrl = student.loginToken
                ? `${base}/s/${student.loginToken}`
                : null;

              return (
                <Card
                  key={student.id}
                  className="bg-white border-2 border-gray-200 shadow-sm print:shadow-none print:border-gray-400"
                >
                  <CardContent className="p-4 flex flex-col h-full justify-between">
                    <div className="space-y-3 text-center">
                      <div className="flex flex-col items-center">
                        {loginUrl ? (
                          <QRCodeSVG
                            value={loginUrl}
                            size={120}
                            level="M"
                            className="border border-gray-200 rounded p-1"
                          />
                        ) : (
                          <div className="w-[120px] h-[120px] border border-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                            No token
                          </div>
                        )}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {student.firstName} {student.lastName}
                        </h2>
                        <p className="text-sm text-gray-500">{classData.name}</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                          Scan to Log In
                        </p>
                        <p className="text-sm text-green-800 mt-1">
                          Point your camera at the QR code to log in instantly.
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        Ask your teacher for help if you have trouble logging in.
                      </p>
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
