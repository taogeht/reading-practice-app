"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Loader2, Printer, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  ANIMALS,
  OBJECTS,
  type VisualPasswordOption,
} from "@/components/auth/visual-password-options";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  loginToken: string | null;
  visualPasswordType: 'animal' | 'object' | null;
  visualPasswordData: { animal?: string; object?: string } | null;
}

interface ClassResponse {
  class: {
    id: string;
    name: string;
    description: string | null;
    slug: string | null;
    students: Student[];
  };
}

type Layout = 'qr' | 'passcode';

function lookupPasswordOption(student: Student): VisualPasswordOption | null {
  const data = student.visualPasswordData;
  if (!data) return null;
  if (student.visualPasswordType === 'animal' && data.animal) {
    return ANIMALS.find((o) => o.id === data.animal) ?? null;
  }
  if (student.visualPasswordType === 'object' && data.object) {
    return OBJECTS.find((o) => o.id === data.object) ?? null;
  }
  return null;
}

export default function LoginCardsPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params?.classId as string | undefined;

  const [classData, setClassData] = useState<ClassResponse["class"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [layout, setLayout] = useState<Layout>('qr');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined") {
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
        setSelectedIds(new Set(data.class.students.map((s) => s.id)));
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

  const visibleStudents = useMemo(() => {
    if (!classData) return [];
    return classData.students.filter((s) => selectedIds.has(s.id));
  }, [classData, selectedIds]);

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!classData) return;
    setSelectedIds(new Set(classData.students.map((s) => s.id)));
  };
  const selectNone = () => setSelectedIds(new Set());

  if (loading || !origin) {
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
        <Button onClick={() => router.push(`/teacher/classes/${classId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
        </Button>
      </div>
    );
  }

  const base = origin || "";
  const classLoginUrl = classData.slug
    ? `${base}/c/${classData.slug}`
    : `${base}/student-login/${classId}`;
  const classLoginUrlDisplay = classData.slug
    ? `${base.replace(/^https?:\/\//, "")}/c/${classData.slug}`
    : `${base.replace(/^https?:\/\//, "")}/student-login/${classId}`;
  const totalCount = classData.students.length;
  const selectedCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.4in; }
          html, body { background: #fff !important; }
          .print-cards-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 0.25in !important;
          }
          .print-card {
            break-inside: avoid;
            page-break-inside: avoid;
            height: 4.85in;
            box-sizing: border-box;
          }
        }
      `}</style>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 mb-6 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Login Cards for {classData.name}</h1>
              <p className="text-gray-600">
                {layout === 'qr'
                  ? 'Each student has a unique QR code for instant login — no password needed.'
                  : 'Each student gets the class URL and the picture they tap on the login screen.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push(`/teacher/classes/${classId}`)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
              </Button>
              <Button onClick={handlePrint} disabled={selectedCount === 0}>
                <Printer className="w-4 h-4 mr-2" /> Print Cards
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Card layout
                </label>
                <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qr">QR code only</SelectItem>
                    <SelectItem value="passcode">URL + picture password</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[220px]">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Students
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="mt-1 w-full justify-start font-normal">
                      <Users className="w-4 h-4 mr-2" />
                      {selectedCount === totalCount
                        ? `All ${totalCount} students`
                        : `${selectedCount} of ${totalCount} selected`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-xs font-medium text-gray-700">
                        Choose who to print
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          All
                        </button>
                        <span className="text-xs text-gray-300">·</span>
                        <button
                          type="button"
                          onClick={selectNone}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {classData.students.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleStudent(s.id)}
                          />
                          <span className="text-sm">
                            {s.firstName} {s.lastName}
                          </span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>
        </div>

        {totalCount === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <p className="text-gray-600">No students enrolled in this class yet.</p>
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center">
            <p className="text-gray-600">No students selected. Pick at least one to print.</p>
          </div>
        ) : (
          <div className="print-cards-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 print:grid-cols-2 print:gap-3">
            {visibleStudents.map((student) =>
              layout === 'qr' ? (
                <QrCard
                  key={student.id}
                  student={student}
                  base={base}
                  className={classData.name}
                />
              ) : (
                <PasscodeCard
                  key={student.id}
                  student={student}
                  loginUrl={classLoginUrl}
                  loginUrlDisplay={classLoginUrlDisplay}
                  className={classData.name}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QrCard({
  student,
  base,
  className,
}: {
  student: Student;
  base: string;
  className: string;
}) {
  const loginUrl = student.loginToken ? `${base}/s/${student.loginToken}` : null;
  return (
    <Card className="print-card bg-white border-2 border-gray-200 shadow-sm print:shadow-none print:border-gray-400">
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
            <p className="text-sm text-gray-500">{className}</p>
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
}

function PasscodeCard({
  student,
  loginUrl,
  loginUrlDisplay,
  className,
}: {
  student: Student;
  loginUrl: string;
  loginUrlDisplay: string;
  className: string;
}) {
  const password = lookupPasswordOption(student);
  return (
    <Card className="print-card bg-white border-2 border-gray-200 shadow-sm print:shadow-none print:border-gray-400">
      <CardContent className="p-4 flex flex-col h-full justify-between">
        <div className="space-y-3 text-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {student.firstName} {student.lastName}
            </h2>
            <p className="text-sm text-gray-500">{className}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              Step 1 — Go to
            </p>
            <p className="text-base font-mono font-semibold text-blue-900 break-all mt-1">
              {loginUrlDisplay}
            </p>
            {/* Hidden link to keep the full URL discoverable for digital copies. */}
            <a href={loginUrl} className="hidden">{loginUrl}</a>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
              Step 2 — Tap your picture
            </p>
            {password ? (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-5xl leading-none" aria-hidden>
                  {password.emoji}
                </span>
                <span className="text-lg font-semibold text-purple-900">
                  {password.name}
                </span>
              </div>
            ) : (
              <p className="text-sm text-purple-900 mt-2 italic">
                No picture password set yet — ask your teacher.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Tap your name on the class page, then tap your picture to log in.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
