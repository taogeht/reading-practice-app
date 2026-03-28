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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2 } from "lucide-react";

export type SpellingWordInput = {
  word: string;
  mandarinTranslation: string;
  // Preserved from existing data on edit so we don't wipe them
  syllables?: string[] | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
};

type ClassOption = {
  id: string;
  name: string;
};

type ManageSpellingListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialData?: {
    id: string;
    title: string;
    classId: string;
    classIds?: string[];
    gradeLevel?: number | null;
    isPublic?: boolean;
    words: SpellingWordInput[];
  } | null;
  classes: ClassOption[];
};

export function ManageSpellingListDialog({
  open,
  onOpenChange,
  onSuccess,
  initialData,
  classes,
}: ManageSpellingListDialogProps) {
  const [title, setTitle] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [gradeLevel, setGradeLevel] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [words, setWords] = useState<SpellingWordInput[]>([{ word: "", mandarinTranslation: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleClass = (classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title);
        setSelectedClassIds(initialData.classIds?.length ? initialData.classIds : [initialData.classId]);
        setGradeLevel(initialData.gradeLevel ? initialData.gradeLevel.toString() : "");
        setIsPublic(initialData.isPublic || false);
        setWords(initialData.words?.length > 0 ? initialData.words.map(w => ({ word: w.word, mandarinTranslation: w.mandarinTranslation || "", syllables: w.syllables, audioUrl: w.audioUrl, imageUrl: w.imageUrl })) : [{ word: "", mandarinTranslation: "" }]);
      } else {
        setTitle("");
        setSelectedClassIds(classes.length === 1 ? [classes[0].id] : []);
        setGradeLevel("");
        setIsPublic(false);
        setWords([{ word: "", mandarinTranslation: "" }, { word: "", mandarinTranslation: "" }, { word: "", mandarinTranslation: "" }]);
        setError(null);
      }
    }
  }, [open, initialData, classes]);

  const handleWordChange = (index: number, field: 'word' | 'mandarinTranslation', value: string) => {
    const newWords = [...words];
    newWords[index][field] = value;
    setWords(newWords);
  };

  const addWord = () => {
    setWords([...words, { word: "", mandarinTranslation: "" }]);
  };

  const removeWord = (index: number) => {
    if (words.length > 1) {
      const newWords = [...words];
      newWords.splice(index, 1);
      setWords(newWords);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Filter out empty words and ensure uniqueness (case-insensitive)
    const validWords = words
      .filter(w => w.word.trim().length > 0);

    const uniqueWords = [...new Set(validWords.map(w => w.word.trim().toLowerCase()))];

    if (!title.trim()) {
      setError("Please enter a list title");
      return;
    }

    if (selectedClassIds.length === 0) {
      setError("Please select at least one class");
      return;
    }

    if (uniqueWords.length < 3) {
      setError("Please enter at least 3 unique words");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const payload = {
        title: title.trim(),
        classIds: selectedClassIds,
        gradeLevel: gradeLevel ? parseInt(gradeLevel, 10) : null,
        isPublic,
        words: validWords.map(w => ({
          word: w.word.trim(),
          mandarinTranslation: w.mandarinTranslation.trim() || null,
          syllables: w.syllables || null,
          audioUrl: w.audioUrl || null,
          imageUrl: w.imageUrl || null,
        })),
      };

      let response;
      if (initialData?.id) {
        // Edit existing list — update the primary list
        response = await fetch(`/api/teacher/spelling-lists/${initialData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, classId: selectedClassIds[0] }),
        });
      } else {
        // Create new list (API handles creating for multiple classes)
        response = await fetch("/api/spelling-lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${initialData ? 'update' : 'create'} spelling list`);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Spelling List' : 'Create Spelling List'}</DialogTitle>
          <DialogDescription>
            {initialData ? 'Update the details and words for this spelling list.' : 'Add a new list of spelling words for your students to practice.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Assign to Classes</Label>
            {classes.length === 0 ? (
              <div className="text-sm text-red-500">You must create a class before creating a spelling list.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classes.map((cls) => (
                  <label
                    key={cls.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer transition-colors text-sm ${
                      selectedClassIds.includes(cls.id)
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={() => toggleClass(cls.id)}
                    />
                    {cls.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="title">List Title</Label>
              <Input
                id="title"
                placeholder="e.g., Week 1 - Short A Sounds"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">Grade Level (Optional)</Label>
              <Input
                id="gradeLevel"
                type="number"
                min="0"
                max="12"
                placeholder="e.g., 2"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
              />
            </div>

            <div className="space-y-2 flex flex-col justify-end">
               <label className="flex items-center space-x-2 py-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                    Make Public
                  </span>
                </label>
                <p className="text-[10px] text-gray-500 ml-6 -mt-1 leading-tight">
                  Allow other teachers in your school to import this list.
                </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label>Spelling Words</Label>
              <span className="text-xs text-gray-500">{words.length} words</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 pl-8">
              <span className="flex-1">English</span>
              <span className="flex-1">中文 (Optional)</span>
              <span className="w-9" />
            </div>
            <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
              {words.map((word, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 text-center text-sm text-gray-500 font-medium">
                    {index + 1}.
                  </span>
                  <Input
                    placeholder={`Word ${index + 1}`}
                    value={word.word}
                    onChange={(e) => handleWordChange(index, 'word', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="中文翻譯"
                    value={word.mandarinTranslation}
                    onChange={(e) => handleWordChange(index, 'mandarinTranslation', e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeWord(index)}
                    disabled={words.length <= 1}
                    className="h-9 w-9 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addWord}
              className="w-full mt-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Word
            </Button>
          </div>

          {error && <div className="text-sm justify-center text-red-500 font-medium">{error}</div>}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedClassIds.length === 0}>
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {initialData ? 'Save Changes' : 'Create List'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
