"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type ClassOption = {
  id: string;
  name: string;
  gradeLevel?: number | null;
};

type ImportSourceClass = {
  id: string;
  name: string;
  gradeLevel: number | null;
};

type SpellingWord = {
  word: string;
  syllables: string[] | null;
  audioUrl: string | null;
};

type SpellingList = {
  id: string;
  title: string;
  weekNumber: number | null;
  gradeLevel: number | null;
  isPublic: boolean;
  words: SpellingWord[];
  createdAt: string;
};

type ImportSource = {
  class: ImportSourceClass;
  spellingLists: SpellingList[];
};

type ImportSpellingListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  classes: ClassOption[];
};

export function ImportSpellingListDialog({
  open,
  onOpenChange,
  onSuccess,
  classes,
}: ImportSpellingListDialogProps) {
  const [targetClassId, setTargetClassId] = useState("");
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTargetClassId(classes.length === 1 ? classes[0].id : "");
      setSources([]);
      setError(null);
    }
  }, [open, classes]);

  useEffect(() => {
    if (open && targetClassId) {
      fetchImportSources(targetClassId);
    }
  }, [open, targetClassId]);

  const fetchImportSources = async (classId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/spelling-lists/import-sources?classId=${classId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch import sources");
      }
      const data = await response.json();
      setSources(data);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (list: SpellingList) => {
    if (!targetClassId) {
      setError("Please select a target class first");
      return;
    }

    try {
      setImportingId(list.id);
      setError(null);

      // We'll create a copy of the list for the target class
      const payload = {
        title: `${list.title} (Imported)`,
        classId: targetClassId,
        weekNumber: list.weekNumber,
        gradeLevel: list.gradeLevel,
        isPublic: false, // Default imported lists to private
        words: list.words,
      };

      const response = await fetch("/api/spelling-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to import list");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during import");
    } finally {
      setImportingId(null);
    }
  };

  // Flatten lists for easier display
  const allAvailableLists = sources.flatMap((source) => 
    source.spellingLists.map((list) => ({
      ...list,
      sourceClassName: source.class.name,
      sourceGradeLevel: source.class.gradeLevel,
    }))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Public Spelling List</DialogTitle>
          <DialogDescription>
            Find public spelling lists from other classes in your school at the same grade level.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col py-4 gap-4">
          <div className="space-y-2 shrink-0">
            <label className="text-sm font-medium">Select Target Class</label>
            {classes.length === 0 ? (
              <div className="text-sm text-red-500">You must create a class before importing a list.</div>
            ) : (
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class to import into" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name} {cls.gradeLevel ? `(Grade ${cls.gradeLevel})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!targetClassId && classes.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Select a class to see compatible public lists.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-gray-50/50">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Searching for public lists...</p>
              </div>
            ) : !targetClassId ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
                <Search className="w-12 h-12 mb-2 opacity-20" />
                <p>Select a target class to browse available lists.</p>
              </div>
            ) : allAvailableLists.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
                <Search className="w-12 h-12 mb-2 opacity-20" />
                <p>No public lists found for this grade level in your school.</p>
                <p className="text-sm mt-2 opacity-80">Lists must be marked 'Public' by their creator to appear here.</p>
              </div>
            ) : (
              <div className="space-y-3 pr-2">
                {allAvailableLists.map((list) => (
                  <div key={list.id} className="bg-white p-4 rounded-lg border shadow-sm hover:shadow transition-shadow">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h4 className="font-semibold text-gray-900">{list.title}</h4>
                        <div className="flex items-center gap-2 mt-1 mb-3">
                          <span className="text-xs text-gray-500">From: {list.sourceClassName}</span>
                          {list.sourceGradeLevel !== null && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              Grade {list.sourceGradeLevel}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500">• {list.words.length} words</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {list.words.map((w, idx) => (
                            <span key={idx} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md border border-blue-100">
                              {w.word}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="default"
                        onClick={() => handleImport(list)}
                        disabled={importingId !== null}
                        className="shrink-0"
                      >
                        {importingId === list.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Import
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {error && <div className="text-sm text-red-500 font-medium shrink-0">{error}</div>}
        </div>

        <DialogFooter className="shrink-0">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
