"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Download,
  BookOpen,
  Edit,
  Trash2,
  Lock,
  Globe,
  Volume2,
  Loader2,
  Play,
  Square,
  Check,
  X,
  Scissors,
  ImageIcon,
  Gamepad2,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { ManageSpellingListDialog, SpellingWordInput } from "@/components/spelling/manage-spelling-list-dialog";
import { ImportSpellingListDialog } from "@/components/spelling/import-spelling-list-dialog";
import { SyllableEditorDialog } from "@/components/spelling/syllable-editor-dialog";

type ClassOption = {
  id: string;
  name: string;
  gradeLevel?: number | null;
};

type SpellingWord = {
  id: string;
  word: string;
  syllables: string[] | null;
  audioUrl: string | null;
  imageUrl: string | null;
  mandarinTranslation: string | null;
};

type SpellingList = {
  id: string;
  classId: string;
  className: string;
  classIds?: string[];
  classNames?: string[];
  allListIds?: string[];
  title: string;
  weekNumber: number | null;
  gradeLevel: number | null;
  isPublic: boolean;
  isCurrent: boolean;
  active: boolean;
  words: SpellingWord[];
  createdAt: string;
  updatedAt: string;
};

export default function ManageSpellingListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<SpellingList[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog States
  const [showManageDialog, setShowManageDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingList, setEditingList] = useState<SpellingList | null>(null);
  const [generatingAudioFor, setGeneratingAudioFor] = useState<string | null>(null);
  const [generatingImagesFor, setGeneratingImagesFor] = useState<string | null>(null);
  const [settingCurrentFor, setSettingCurrentFor] = useState<string | null>(null);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [editingSyllablesWord, setEditingSyllablesWord] = useState<SpellingWord | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayAudio = useCallback((word: SpellingWord) => {
    if (!word.audioUrl) return;

    // Stop currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingWordId === word.id) {
      setPlayingWordId(null);
      return;
    }

    const audio = new Audio(word.audioUrl);
    audioRef.current = audio;
    setPlayingWordId(word.id);

    audio.onended = () => {
      setPlayingWordId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingWordId(null);
      audioRef.current = null;
    };
    audio.play();
  }, [playingWordId]);

  const handleSyllablesSaved = (wordId: string, syllables: string[]) => {
    setLists(lists.map(list => ({
      ...list,
      words: list.words.map(w =>
        w.id === wordId ? { ...w, syllables } : w
      ),
    })));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch classes for dropdowns
      const classesRes = await fetch('/api/teacher/classes');
      if (!classesRes.ok) throw new Error('Failed to fetch classes');
      const classesData = await classesRes.json();
      // The API returns { classes: [...] } so unwrap it; fall back to direct array for safety
      const classesArray = Array.isArray(classesData) ? classesData : (classesData.classes ?? []);
      setClasses(classesArray);

      // Fetch all spelling lists for this teacher
      const listsRes = await fetch('/api/teacher/spelling-lists');
      if (!listsRes.ok) throw new Error('Failed to fetch spelling lists');
      const listsData = await listsRes.json();
      setLists(Array.isArray(listsData) ? listsData : []);

    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (list: SpellingList) => {
    const classCount = list.allListIds?.length || 1;
    const message = classCount > 1
      ? `This spelling list is shared across ${classCount} classes (${list.className}). Delete from all classes? This action cannot be undone.`
      : "Are you sure you want to delete this spelling list? This action cannot be undone.";

    if (!confirm(message)) {
      return;
    }

    try {
      // Delete all copies of this list across classes
      const idsToDelete = list.allListIds || [list.id];
      await Promise.all(
        idsToDelete.map(id =>
          fetch(`/api/teacher/spelling-lists/${id}`, { method: "DELETE" })
        )
      );

      // Optimistic update
      const deletedSet = new Set(idsToDelete);
      setLists(lists.filter(l => !deletedSet.has(l.id)));
    } catch (err) {
      console.error("Error deleting list:", err);
      alert("Failed to delete the spelling list. Please try again.");
    }
  };

  const handleGenerateAudio = async (list: SpellingList, force = false) => {
    if (force && !confirm("Regenerate all audio? This will overwrite existing audio files.")) {
      return;
    }
    setGeneratingAudioFor(list.id);
    try {
      const forceParam = force ? "?force=true" : "";
      // Generate audio for the primary list
      const response = await fetch(`/api/spelling-lists/${list.id}/generate-audio${forceParam}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate audio");
      }

      const result = await response.json();

      // If there are duplicate lists across classes, generate for those too
      const otherIds = (list.allListIds || []).filter(id => id !== list.id);
      if (otherIds.length > 0) {
        await Promise.all(
          otherIds.map(id =>
            fetch(`/api/spelling-lists/${id}/generate-audio${forceParam}`, { method: "POST" })
          )
        );
      }

      alert(`Audio generated: ${result.successCount} words completed, ${result.errorCount} errors`);
      fetchData();
    } catch (err: any) {
      console.error("Error generating audio:", err);
      alert(err.message || "Failed to generate audio. Please try again.");
    } finally {
      setGeneratingAudioFor(null);
    }
  };

  const handleGenerateImages = async (list: SpellingList, force = false) => {
    if (force && !confirm("Regenerate all images? This will overwrite existing images.")) {
      return;
    }
    setGeneratingImagesFor(list.id);
    try {
      const forceParam = force ? "?force=true" : "";
      const response = await fetch(`/api/spelling-lists/${list.id}/generate-images${forceParam}`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate images");
      }

      const result = await response.json();

      // If there are duplicate lists across classes, generate for those too
      const otherIds = (list.allListIds || []).filter(id => id !== list.id);
      if (otherIds.length > 0) {
        await Promise.all(
          otherIds.map(id =>
            fetch(`/api/spelling-lists/${id}/generate-images${forceParam}`, { method: "POST" })
          )
        );
      }

      alert(`Images generated: ${result.successCount} words completed, ${result.errorCount} errors`);
      fetchData();
    } catch (err: any) {
      console.error("Error generating images:", err);
      alert(err.message || "Failed to generate images. Please try again.");
    } finally {
      setGeneratingImagesFor(null);
    }
  };

  const handleToggleCurrent = async (list: SpellingList) => {
    setSettingCurrentFor(list.id);
    try {
      const applyToListIds = list.allListIds || [list.id];
      const isMakingCurrent = !list.isCurrent;

      if (isMakingCurrent) {
        const response = await fetch(`/api/teacher/spelling-lists/${list.id}/set-current`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applyToListIds }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to set current week");
        }
      } else {
        const params = new URLSearchParams({ applyToListIds: applyToListIds.join(",") });
        const response = await fetch(`/api/teacher/spelling-lists/${list.id}/set-current?${params}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to clear current week");
        }
      }

      // Optimistic local update: only one list can be current per class group, so clear others
      setLists((prev) =>
        prev.map((l) => {
          if (l.id === list.id) return { ...l, isCurrent: isMakingCurrent };
          if (isMakingCurrent) return { ...l, isCurrent: false };
          return l;
        })
      );
    } catch (err: any) {
      console.error("Error toggling current week:", err);
      alert(err.message || "Failed to update current week.");
    } finally {
      setSettingCurrentFor(null);
    }
  };

  const handleEditClick = (list: SpellingList) => {
    setEditingList(list);
    setShowManageDialog(true);
  };

  const handleCreateClick = () => {
    setEditingList(null);
    setShowManageDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading spelling lists...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => router.push("/teacher/dashboard")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Spelling Lists</h1>
                <p className="text-gray-600 mt-1">Manage spelling lists across all your classes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Download className="w-4 h-4 mr-2" />
                Import Public List
              </Button>
              <Button onClick={handleCreateClick}>
                <Plus className="w-4 h-4 mr-2" />
                Create List
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-100">
            {error}
          </div>
        )}

        {lists.length === 0 ? (
          <Card className="border-dashed shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="bg-blue-50 p-4 rounded-full mb-4">
                <BookOpen className="w-10 h-10 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Spelling Lists Yet</h3>
              <p className="text-gray-500 max-w-md mb-6">
                Create your first spelling list to assign words to your students, or import a public list from another teacher.
              </p>
              <div className="flex gap-4">
                <Button onClick={handleCreateClick}>Create First List</Button>
                <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                  Browse Public Lists
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lists.map((list) => (
              <Card
                key={list.id}
                className={`hover:shadow-md transition-shadow flex flex-col ${
                  list.isCurrent ? "border-amber-300 ring-2 ring-amber-200/60 shadow-amber-100" : ""
                }`}
              >
                <CardHeader className={`pb-3 border-b ${list.isCurrent ? "bg-amber-50/50" : ""}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg line-clamp-1">{list.title}</CardTitle>
                        {list.isCurrent && (
                          <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-0.5 flex items-center gap-1">
                            <Star className="w-3 h-3 fill-current" />
                            Current Week
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                         <span>
                           {(list.classNames?.length || 0) > 1
                             ? `Classes: ${list.className}`
                             : `Class: ${list.className}`}
                         </span>
                         {list.gradeLevel !== null && (
                            <Badge variant="outline" className="text-xs font-normal px-1.5 py-0">
                                Grade {list.gradeLevel}
                            </Badge>
                         )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                    <span className="font-medium">{list.words.length} words</span>
                    <div className="flex items-center gap-1.5 opacity-80">
                       {list.isPublic ? (
                          <span className="flex items-center text-green-600 px-2 py-0.5 bg-green-50 rounded text-xs font-medium border border-green-100">
                             <Globe className="w-3 h-3 mr-1" /> Public
                          </span>
                       ) : (
                          <span className="flex items-center text-gray-500 px-2 py-0.5 bg-gray-100 rounded text-xs font-medium border">
                             <Lock className="w-3 h-3 mr-1" /> Private
                          </span>
                       )}
                    </div>
                  </div>
                  
                  {expandedListId === list.id ? (
                    <div className="flex-1 mb-4">
                      <div className="max-h-[300px] overflow-y-auto space-y-1">
                        {list.words.map((w) => (
                          <div
                            key={w.id}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group"
                          >
                            <button
                              onClick={() => handlePlayAudio(w)}
                              disabled={!w.audioUrl}
                              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                                w.audioUrl
                                  ? playingWordId === w.id
                                    ? "bg-blue-500 text-white"
                                    : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
                              }`}
                              title={w.audioUrl ? "Play audio" : "No audio generated"}
                            >
                              {playingWordId === w.id ? (
                                <Square className="w-3 h-3" />
                              ) : (
                                <Play className="w-3 h-3 ml-0.5" />
                              )}
                            </button>

                            {w.imageUrl && (
                              <img
                                src={w.imageUrl}
                                alt={`Illustration of ${w.word}`}
                                className="w-7 h-7 rounded object-cover shrink-0"
                              />
                            )}

                            <span className="font-medium text-sm text-gray-900 min-w-[80px]">
                              {w.word}
                              {w.mandarinTranslation && (
                                <span className="text-gray-400 font-normal ml-1.5">{w.mandarinTranslation}</span>
                              )}
                            </span>

                            <button
                              onClick={() => setEditingSyllablesWord(w)}
                              className="text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors flex-1 text-left flex items-center gap-1"
                              title="Click to edit syllables"
                            >
                              <Scissors className="w-3 h-3 shrink-0" />
                              {w.syllables && w.syllables.length > 0
                                ? w.syllables.join(" · ")
                                : "add syllables..."}
                            </button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-xs text-gray-500"
                        onClick={() => setExpandedListId(null)}
                      >
                        Show less
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex flex-wrap gap-1.5 flex-1 content-start mb-6 cursor-pointer"
                      onClick={() => setExpandedListId(list.id)}
                      title="Click to expand words"
                    >
                      {list.words.slice(0, 10).map((w) => (
                        <span
                          key={w.id}
                          className={`inline-block text-xs px-2 py-1 rounded-md border ${
                            w.audioUrl
                              ? "bg-blue-50 text-blue-700 border-blue-100"
                              : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}
                        >
                          {w.word}
                        </span>
                      ))}
                      {list.words.length > 10 && (
                        <span className="inline-block bg-gray-50 text-gray-500 text-xs px-2 py-1 rounded-md border border-gray-200">
                          +{list.words.length - 10} more
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-4 mt-auto border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEditClick(list)}
                    >
                      <Edit className="w-3.5 h-3.5 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-9 w-9 shrink-0 ${
                        list.isCurrent
                          ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                          : "text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                      }`}
                      onClick={() => handleToggleCurrent(list)}
                      disabled={settingCurrentFor === list.id}
                      title={list.isCurrent ? "Unmark as current week" : "Set as current week"}
                    >
                      {settingCurrentFor === list.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Star className={`w-4 h-4 ${list.isCurrent ? "fill-current" : ""}`} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 h-9 w-9 shrink-0"
                      onClick={() => router.push(`/teacher/spelling-lists/${list.id}/preview`)}
                      disabled={list.words.length === 0}
                      title="Play spelling games with this list"
                    >
                      <Gamepad2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 h-9 w-9 shrink-0"
                      onClick={() => {
                        const allHaveAudio = list.words.length > 0 && list.words.every(w => w.audioUrl);
                        handleGenerateAudio(list, allHaveAudio);
                      }}
                      disabled={generatingAudioFor === list.id || list.words.length === 0}
                      title={list.words.every(w => w.audioUrl) ? "Regenerate all audio" : "Generate audio for words"}
                    >
                      {generatingAudioFor === list.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-purple-500 hover:text-purple-600 hover:bg-purple-50 h-9 w-9 shrink-0"
                      onClick={() => {
                        const allHaveImages = list.words.length > 0 && list.words.every(w => w.imageUrl);
                        handleGenerateImages(list, allHaveImages);
                      }}
                      disabled={generatingImagesFor === list.id || list.words.length === 0}
                      title={list.words.every(w => w.imageUrl) ? "Regenerate all images" : "Generate images for words"}
                    >
                      {generatingImagesFor === list.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 shrink-0"
                      onClick={() => handleDelete(list)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ManageSpellingListDialog
        open={showManageDialog}
        onOpenChange={setShowManageDialog}
        onSuccess={fetchData}
        classes={classes}
        initialData={editingList ? {
          id: editingList.id,
          classId: editingList.classId,
          classIds: editingList.classIds,
          title: editingList.title,
          gradeLevel: editingList.gradeLevel,
          isPublic: editingList.isPublic,
          words: editingList.words.map(w => ({ word: w.word, mandarinTranslation: w.mandarinTranslation || "", syllables: w.syllables, audioUrl: w.audioUrl, imageUrl: w.imageUrl }))
        } : null}
      />

      <ImportSpellingListDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={fetchData}
        classes={classes}
      />

      {editingSyllablesWord && (
        <SyllableEditorDialog
          wordId={editingSyllablesWord.id}
          word={editingSyllablesWord.word}
          currentSyllables={editingSyllablesWord.syllables}
          onSave={(syllables) => handleSyllablesSaved(editingSyllablesWord.id, syllables)}
          onClose={() => setEditingSyllablesWord(null)}
          open={true}
        />
      )}

    </div>
  );
}
