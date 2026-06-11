"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  FileVideo,
  FileImage,
  FileAudio,
  Users,
} from "lucide-react";
import { ALL_ALLOWED_TYPES, validateMediaFile, detectMediaType } from "@/lib/storage/media-validation";

interface RosterStudent { id: string; firstName: string; lastName: string }

function fileIcon(type: string) {
  const t = detectMediaType(type);
  if (t === "video") return FileVideo;
  if (t === "photo") return FileImage;
  return FileAudio;
}

// PUT a file straight to R2 via a presigned URL, reporting progress.
function putToR2(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export function ClassMediaUploadSection({ classId, defaultExpanded = false }: { classId: string; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRoster = useCallback(async () => {
    try {
      setLoadingRoster(true);
      const res = await fetch(`/api/teacher/classes/${classId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStudents((data.class?.students || []).map((s: RosterStudent) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })));
    } catch {
      toast.error("Couldn't load the class roster");
    } finally {
      setLoadingRoster(false);
    }
  }, [classId]);

  useEffect(() => {
    if (isExpanded) fetchRoster();
  }, [isExpanded, fetchRoster]);

  const addFiles = (incoming: FileList | File[]) => {
    const accepted: File[] = [];
    for (const f of Array.from(incoming)) {
      const v = validateMediaFile(f);
      if (!v.valid) {
        toast.error(`${f.name}: ${v.error}`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const toggleStudent = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected = students.length > 0 && selected.size === students.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));

  const reset = () => {
    setFiles([]);
    setSelected(new Set());
    setDescription("");
    setStatus("");
  };

  const send = async () => {
    if (selected.size === 0) { toast.error("Pick at least one student"); return; }
    if (files.length === 0) { toast.error("Add at least one file"); return; }
    const studentIds = Array.from(selected);
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`Uploading ${file.name} (${i + 1}/${files.length})…`);
        // 1. init → presigned URL + staging key
        const initRes = await fetch(`/api/teacher/classes/${classId}/media-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentIds, fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        const initData = await initRes.json();
        if (!initRes.ok) throw new Error(initData.error || "Upload failed to start");
        // 2. one upload to R2
        await putToR2(initData.presignedUrl, file, (pct) => setStatus(`Uploading ${file.name} (${i + 1}/${files.length}) — ${pct}%`));
        // 3. commit → fan out to every selected student
        const title = file.name.replace(/\.[^.]+$/, "");
        const commitRes = await fetch(`/api/teacher/classes/${classId}/media-batch`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadKey: initData.uploadKey, studentIds, title, description, fileName: file.name, fileSize: file.size, mimeType: file.type }),
        });
        const commitData = await commitRes.json();
        if (!commitRes.ok) throw new Error(commitData.error || "Failed to save");
      }
      toast.success(`Sent ${files.length} file${files.length === 1 ? "" : "s"} to ${studentIds.length} student${studentIds.length === 1 ? "" : "s"}`);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <Card>
      <button type="button" onClick={() => setIsExpanded((v) => !v)} className="flex w-full items-center justify-between p-4 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Upload className="h-4 w-4 text-gray-400" />
          Send media to students
        </span>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {isExpanded && (
        <CardContent className="border-t pt-4 space-y-4">
          {/* Students */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Send to</Label>
              {students.length > 0 && (
                <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              )}
            </div>
            {loadingRoster ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-500">No students enrolled.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => {
                  const on = selected.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleStudent(s.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                    >
                      {s.firstName} {s.lastName}
                    </button>
                  );
                })}
              </div>
            )}
            {selected.size > 0 && <p className="mt-1 text-xs text-gray-400">{selected.size} selected</p>}
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
          >
            <Upload className="mx-auto h-6 w-6 text-gray-400" />
            <p className="mt-1 text-sm text-gray-600">Drag files here, or click to choose</p>
            <p className="text-xs text-gray-400">Video, photo, or audio</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALL_ALLOWED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => {
                const Icon = fileIcon(f.type);
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{f.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{(f.size / (1024 * 1024)).toFixed(1)} MB</Badge>
                    </span>
                    {!busy && (
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Optional shared note */}
          <div>
            <Label htmlFor="mediaDesc" className="text-xs">Note (optional, added to every file)</Label>
            <Input id="mediaDesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Great reading today!" className="h-8" />
          </div>

          {status && <p className="text-sm text-blue-600">{status}</p>}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={send} disabled={busy || selected.size === 0 || files.length === 0}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Send to {selected.size || ""} student{selected.size === 1 ? "" : "s"}
            </Button>
            {!busy && (files.length > 0 || selected.size > 0) && (
              <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
