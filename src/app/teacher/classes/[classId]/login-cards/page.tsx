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
import { ArrowLeft, Download, Loader2, Printer, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  lookupPasswordOption,
  buildDuplexCardGrid,
  chunkStudents,
  type StudentCardData,
} from "@/lib/pdf/login-cards-shared";

type Student = StudentCardData;

interface ClassResponse {
  class: {
    id: string;
    name: string;
    description: string | null;
    slug: string | null;
    students: Student[];
  };
}

type Layout = 'double_sided' | 'qr' | 'passcode';

export default function LoginCardsPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params?.classId as string | undefined;

  const [classData, setClassData] = useState<ClassResponse["class"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [layout, setLayout] = useState<Layout>('double_sided');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

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

  const studentChunks = useMemo(() => {
    return chunkStudents(visibleStudents, 4);
  }, [visibleStudents]);

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

  const handleDownloadPdf = async () => {
    if (!classId || visibleStudents.length === 0) return;
    setDownloading(true);
    try {
      const studentIds = visibleStudents.map((s) => s.id).join(',');
      const url = `/api/teacher/classes/${classId}/login-cards/pdf?layout=${layout}&students=${encodeURIComponent(studentIds)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate PDF");
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const safeName = (classData?.name || "class").replace(/[^a-z0-9]+/gi, "-");
      a.download = `${safeName}-login-cards-${layout}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

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
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Class
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
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8 print:p-0 print:bg-white print:min-h-0">
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.4in;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-page {
            width: 100% !important;
            height: 10.2in !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-page-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: 1fr 1fr !important;
            gap: 0.25in !important;
            width: 100% !important;
            height: 100% !important;
          }
          .print-card {
            height: 4.85in !important;
            max-height: 4.85in !important;
            box-sizing: border-box !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 2px dashed #94a3b8 !important;
            box-shadow: none !important;
            border-radius: 12px !important;
          }
          .print-card-empty {
            border: 2px dashed transparent !important;
            visibility: hidden !important;
          }
        }
      `}</style>
      <div className="max-w-6xl mx-auto print:max-w-none print:w-full">
        {/* Controls header (hidden on print) */}
        <div className="flex flex-col gap-4 mb-6 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Login Cards for {classData.name}</h1>
              <p className="text-gray-600 mt-1">
                {layout === 'double_sided' &&
                  'Double-sided printing: QR code on the front and website/picture password on the back.'}
                {layout === 'qr' &&
                  'Single-sided QR layout: each card contains the student’s permanent scan-to-login QR code.'}
                {layout === 'passcode' &&
                  'Single-sided password layout: each card contains the class URL and picture password.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => router.push(`/teacher/classes/${classId}`)}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Class
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={selectedCount === 0 || downloading}
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {downloading ? "Generating PDF…" : "Download PDF"}
              </Button>
              <Button onClick={handlePrint} disabled={selectedCount === 0}>
                <Printer className="w-4 h-4 mr-2" /> Print Cards
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 min-w-[240px]">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Card layout
                </label>
                <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="double_sided">Double-Sided (QR front + Password back)</SelectItem>
                    <SelectItem value="qr">QR code only (Single-sided)</SelectItem>
                    <SelectItem value="passcode">URL + picture password (Single-sided)</SelectItem>
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

          {/* Teacher guidance banner for double-sided mode */}
          {layout === 'double_sided' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Printer className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 leading-relaxed">
                <span className="font-semibold">Ready for Double-Sided Printing: </span>
                When printing from your browser or PDF viewer, select <span className="font-semibold">Print on both sides (Duplex)</span> and <span className="font-semibold">Flip on long edge</span>. Cards are pre-aligned so that each student’s passcode prints directly on the reverse side of their QR code.
              </div>
            </div>
          )}
        </div>

        {totalCount === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center print:hidden">
            <p className="text-gray-600">No students enrolled in this class yet.</p>
          </div>
        ) : visibleStudents.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center print:hidden">
            <p className="text-gray-600">No students selected. Pick at least one to print.</p>
          </div>
        ) : (
          <div className="space-y-8 print:space-y-0">
            {studentChunks.map((chunk, cIdx) => {
              const paddedChunk: (Student | null)[] = [
                chunk[0] ?? null,
                chunk[1] ?? null,
                chunk[2] ?? null,
                chunk[3] ?? null,
              ];
              const sheetNum = cIdx + 1;

              if (layout === 'double_sided') {
                const { front, back } = buildDuplexCardGrid(paddedChunk);

                return (
                  <div key={`duplex-chunk-${cIdx}`} className="space-y-6 print:space-y-0">
                    {/* Front Sheet: QR Codes */}
                    <div className="bg-white p-4 sm:p-6 rounded-xl border shadow-sm print:p-0 print:border-0 print:shadow-none print:bg-transparent print-page">
                      <div className="print:hidden flex items-center justify-between mb-3 pb-2 border-b">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">
                            Sheet {sheetNum} · Front
                          </span>
                          <span className="text-sm font-semibold text-gray-700">QR Code Cards</span>
                        </div>
                        <span className="text-xs text-gray-400">Prints on Page {(sheetNum - 1) * 2 + 1}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-page-grid">
                        {front.map((s, sIdx) =>
                          s ? (
                            <QrCard key={s.id} student={s} base={base} className={classData.name} />
                          ) : (
                            <EmptyCard key={`empty-front-${cIdx}-${sIdx}`} />
                          ),
                        )}
                      </div>
                    </div>

                    {/* Back Sheet: Passcodes (horizontally mirrored for duplex) */}
                    <div className="bg-white p-4 sm:p-6 rounded-xl border shadow-sm print:p-0 print:border-0 print:shadow-none print:bg-transparent print-page">
                      <div className="print:hidden flex items-center justify-between mb-3 pb-2 border-b">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
                            Sheet {sheetNum} · Back
                          </span>
                          <span className="text-sm font-semibold text-gray-700">URL & Picture Passwords</span>
                        </div>
                        <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
                          Mirrored for Duplex (Page {(sheetNum - 1) * 2 + 2})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-page-grid">
                        {back.map((s, sIdx) =>
                          s ? (
                            <PasscodeCard
                              key={s.id}
                              student={s}
                              loginUrl={classLoginUrl}
                              loginUrlDisplay={classLoginUrlDisplay}
                              className={classData.name}
                            />
                          ) : (
                            <EmptyCard key={`empty-back-${cIdx}-${sIdx}`} />
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (layout === 'qr') {
                return (
                  <div
                    key={`qr-chunk-${cIdx}`}
                    className="bg-white p-4 sm:p-6 rounded-xl border shadow-sm print:p-0 print:border-0 print:shadow-none print:bg-transparent print-page"
                  >
                    <div className="print:hidden flex items-center justify-between mb-3 pb-2 border-b">
                      <span className="text-sm font-semibold text-gray-700">Sheet {sheetNum} (QR Codes)</span>
                      <span className="text-xs text-gray-400">Page {sheetNum}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-page-grid">
                      {paddedChunk.map((s, sIdx) =>
                        s ? (
                          <QrCard key={s.id} student={s} base={base} className={classData.name} />
                        ) : (
                          <EmptyCard key={`empty-qr-${cIdx}-${sIdx}`} />
                        ),
                      )}
                    </div>
                  </div>
                );
              }

              // Passcode single-sided
              return (
                <div
                  key={`passcode-chunk-${cIdx}`}
                  className="bg-white p-4 sm:p-6 rounded-xl border shadow-sm print:p-0 print:border-0 print:shadow-none print:bg-transparent print-page"
                >
                  <div className="print:hidden flex items-center justify-between mb-3 pb-2 border-b">
                    <span className="text-sm font-semibold text-gray-700">Sheet {sheetNum} (Passwords)</span>
                    <span className="text-xs text-gray-400">Page {sheetNum}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print-page-grid">
                    {paddedChunk.map((s, sIdx) =>
                      s ? (
                        <PasscodeCard
                          key={s.id}
                          student={s}
                          loginUrl={classLoginUrl}
                          loginUrlDisplay={classLoginUrlDisplay}
                          className={classData.name}
                        />
                      ) : (
                        <EmptyCard key={`empty-passcode-${cIdx}-${sIdx}`} />
                      ),
                    )}
                  </div>
                </div>
              );
            })}
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
    <Card className="print-card bg-white border-2 border-dashed border-gray-300 shadow-sm print:shadow-none print:border-dashed print:border-slate-400 rounded-xl overflow-hidden">
      <CardContent className="p-5 flex flex-col h-full justify-between">
        <div className="space-y-3 text-center flex flex-col h-full justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {student.firstName} {student.lastName}
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-0.5">{className}</p>
          </div>

          <div className="flex flex-col items-center justify-center my-1">
            {loginUrl ? (
              <div className="p-2 border border-gray-200 rounded-lg bg-white shadow-xs">
                <QRCodeSVG
                  value={loginUrl}
                  size={126}
                  level="M"
                />
              </div>
            ) : (
              <div className="w-[126px] h-[126px] border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                No token
              </div>
            )}
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
            <p className="text-xs font-bold text-green-700 uppercase tracking-wide">
              Scan to Log In
            </p>
            <p className="text-xs text-green-800 mt-0.5">
              Point camera or scan with Starling Rise app
            </p>
          </div>

          <p className="text-[11px] text-gray-400">
            Permanent QR code · Keep this card safe
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
    <Card className="print-card bg-white border-2 border-dashed border-gray-300 shadow-sm print:shadow-none print:border-dashed print:border-slate-400 rounded-xl overflow-hidden">
      <CardContent className="p-5 flex flex-col h-full justify-between">
        <div className="space-y-3 text-center flex flex-col h-full justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {student.firstName} {student.lastName}
            </h2>
            <p className="text-sm font-medium text-gray-500 mt-0.5">{className}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
              Step 1 — Go to website
            </p>
            <p className="text-sm font-mono font-bold text-blue-900 break-all mt-0.5">
              {loginUrlDisplay}
            </p>
            <a href={loginUrl} className="hidden">{loginUrl}</a>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
            <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">
              Step 2 — Tap your picture
            </p>
            {password ? (
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-4xl leading-none" aria-hidden>
                  {password.emoji}
                </span>
                <span className="text-base font-bold text-purple-900">
                  {password.name}
                </span>
              </div>
            ) : (
              <p className="text-xs text-purple-800 mt-1 italic">
                Ask your teacher for picture password
              </p>
            )}
          </div>

          <p className="text-[11px] text-gray-400">
            Tap your name, then tap your picture to log in
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCard() {
  return (
    <Card className="print-card print-card-empty border-2 border-dashed border-transparent bg-transparent opacity-40 print:opacity-0 flex items-center justify-center">
      <CardContent className="p-4 flex items-center justify-center text-xs text-gray-400">
        (Empty slot)
      </CardContent>
    </Card>
  );
}
