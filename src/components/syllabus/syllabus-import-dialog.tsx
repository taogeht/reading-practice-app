"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Upload,
  Loader2,
  AlertTriangle,
  Check,
  FileSpreadsheet,
} from "lucide-react";
import {
  parseSyllabusSheet,
} from "@/lib/syllabus/parse-xlsx";
import {
  bookColumnHeader,
  type ParsedWeek,
  type ParseResult,
  type BookForImport,
} from "@/lib/syllabus/types";

interface Props {
  classId: string;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

interface ClassBooksResponse {
  books: { bookId: string; title: string }[];
}

export function SyllabusImportDialog({
  classId,
  className,
  open,
  onOpenChange,
  onImported,
}: Props) {
  const [classBooks, setClassBooks] = useState<BookForImport[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsedFileName, setParsedFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset everything every time the dialog reopens.
  useEffect(() => {
    if (!open) return;
    setParseResult(null);
    setParsedFileName(null);
    setError(null);
    setSuccess(null);
    (async () => {
      setLoadingBooks(true);
      try {
        const res = await fetch(`/api/classes/${classId}/books`);
        const data = (await res.json()) as ClassBooksResponse;
        setClassBooks(
          (data.books ?? []).map((b) => ({ id: b.bookId, title: b.title })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load class books");
      } finally {
        setLoadingBooks(false);
      }
    })();
  }, [open, classId]);

  const downloadTemplate = () => {
    // Server generates the .xlsx with this class's specific book columns.
    window.location.href = `/api/teacher/classes/${classId}/syllabus/template`;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    setParsedFileName(file.name);
    try {
      // Lazy-load xlsx so the parser only ships when this dialog is opened.
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const result = parseSyllabusSheet(wb, classBooks);
      setParseResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read file");
      setParseResult(null);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const submit = async () => {
    if (!parseResult || parseResult.weeks.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/teacher/classes/${classId}/syllabus/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeks: parseResult.weeks }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import failed");
      setSuccess(
        `Imported ${data.weeksCreated} weeks. ${data.recapsCreated} draft recaps created.`,
      );
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Heads-up: any book columns the teacher has in their file that don't match
  // a class book. We don't outright reject — we just call them out so they
  // know the column was ignored.
  const expectedBookHeaders = new Set(
    classBooks.map((b) => bookColumnHeader(b.title)),
  );
  const unrecognizedBookHeaders = (parseResult?.foundHeaders ?? []).filter(
    (h) => h.startsWith("Pages: ") && !expectedBookHeaders.has(h),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Import Syllabus — {className}
            </span>
          </DialogTitle>
          <DialogDescription>
            Upload your filled-in semester syllabus. This replaces all existing
            weeks and weekly recap drafts for this class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: download template */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm text-gray-900">
                  1. Download the template
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  One column per book this class uses. Fill in week dates,
                  pages, and any vocab / test / homework you have planned.
                </p>
                {classBooks.length === 0 && !loadingBooks && (
                  <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    This class has no books assigned yet. Add books to the
                    class before importing so they appear as columns.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                disabled={loadingBooks || classBooks.length === 0}
              >
                {loadingBooks ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download .xlsx
              </Button>
            </div>
          </div>

          {/* Step 2: upload */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-white hover:bg-gray-50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-700 font-medium">
              Drop your filled-in .xlsx here
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or{" "}
              <button
                type="button"
                className="text-indigo-600 hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                browse for a file
              </button>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={onFileChange}
            />
            {parsedFileName && (
              <p className="text-xs text-gray-500 mt-3 flex items-center justify-center gap-1">
                <FileSpreadsheet className="w-3 h-3" />
                {parsedFileName}
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 3: preview */}
          {parseResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge className="bg-green-100 text-green-800 border-green-300">
                  {parseResult.weeks.length} valid week
                  {parseResult.weeks.length === 1 ? "" : "s"}
                </Badge>
                {parseResult.warnings.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                    {parseResult.warnings.length} warning
                    {parseResult.warnings.length === 1 ? "" : "s"}
                  </Badge>
                )}
                {unrecognizedBookHeaders.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                    {unrecognizedBookHeaders.length} unknown book column
                    {unrecognizedBookHeaders.length === 1 ? "" : "s"} (ignored)
                  </Badge>
                )}
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded p-3 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {parseResult.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-900">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>
                        {w.rowIndex >= 0 ? `Row ${w.rowIndex + 2}: ` : ""}
                        {w.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {parseResult.weeks.length > 0 && (
                <div className="border rounded max-h-64 overflow-auto text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50 border-b">
                      <tr className="text-left text-gray-600">
                        <th className="px-2 py-1.5">Week</th>
                        <th className="px-2 py-1.5">Dates</th>
                        <th className="px-2 py-1.5">Pages</th>
                        <th className="px-2 py-1.5">Vocab</th>
                        <th className="px-2 py-1.5">Spelling</th>
                        <th className="px-2 py-1.5">Grammar</th>
                        <th className="px-2 py-1.5">Homework</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.weeks.map((w: ParsedWeek) => (
                        <tr key={w.weekNumber} className="border-b last:border-0">
                          <td className="px-2 py-1.5 font-medium">
                            {w.weekNumber}
                            {w.title && (
                              <div className="text-[10px] text-gray-500">{w.title}</div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                            {w.startDate} → {w.endDate}
                          </td>
                          <td className="px-2 py-1.5 text-gray-700">
                            {w.assignments.length === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              w.assignments
                                .map((a) => a.pages)
                                .join(", ")
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">{w.vocabulary || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600">{w.spellingTestInfo || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600">{w.grammarTestInfo || "—"}</td>
                          <td className="px-2 py-1.5 text-gray-600">{w.homework || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800 flex items-center gap-2">
              <Check className="w-4 h-4" />
              {success}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {success ? "Close" : "Cancel"}
          </Button>
          <Button
            onClick={submit}
            disabled={
              importing ||
              !parseResult ||
              parseResult.weeks.length === 0 ||
              !!success
            }
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Replace syllabus
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
