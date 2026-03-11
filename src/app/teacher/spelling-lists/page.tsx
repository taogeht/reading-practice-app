"use client";

import { useState, useEffect } from "react";
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
import { 
  Plus, 
  Download,
  BookOpen,
  Edit,
  Trash2,
  Lock,
  Globe
} from "lucide-react";
import { format } from "date-fns";
import { ManageSpellingListDialog, SpellingWordInput } from "@/components/spelling/manage-spelling-list-dialog";
import { ImportSpellingListDialog } from "@/components/spelling/import-spelling-list-dialog";

type ClassOption = {
  id: string;
  name: string;
  gradeLevel?: number | null;
};

type SpellingWord = {
  word: string;
  syllables: string[] | null;
  audioUrl: string | null;
};

type SpellingList = {
  id: string;
  classId: string;
  className: string;
  title: string;
  weekNumber: number | null;
  gradeLevel: number | null;
  isPublic: boolean;
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
      setClasses(classesData);

      // Fetch all spelling lists for this teacher
      const listsRes = await fetch('/api/teacher/spelling-lists');
      if (!listsRes.ok) throw new Error('Failed to fetch spelling lists');
      const listsData = await listsRes.json();
      setLists(listsData);

    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (listId: string) => {
    if (!confirm("Are you sure you want to delete this spelling list? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/teacher/spelling-lists/${listId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete list");
      }

      // Optimistic update
      setLists(lists.filter(l => l.id !== listId));
    } catch (err) {
      console.error("Error deleting list:", err);
      alert("Failed to delete the spelling list. Please try again.");
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
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Spelling Lists</h1>
              <p className="text-gray-600 mt-1">Manage spelling lists across all your classes</p>
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
              <Card key={list.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg line-clamp-1">{list.title}</CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2">
                         <span>Class: {list.className}</span>
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
                  
                  <div className="flex flex-wrap gap-1.5 flex-1 content-start mb-6">
                    {list.words.slice(0, 10).map((w, idx) => (
                      <span key={idx} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-md border border-blue-100">
                        {w.word}
                      </span>
                    ))}
                    {list.words.length > 10 && (
                      <span className="inline-block bg-gray-50 text-gray-500 text-xs px-2 py-1 rounded-md border border-gray-200">
                        +{list.words.length - 10} more
                      </span>
                    )}
                  </div>

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
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9 shrink-0"
                      onClick={() => handleDelete(list.id)}
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
          title: editingList.title,
          gradeLevel: editingList.gradeLevel,
          isPublic: editingList.isPublic,
          words: editingList.words.map(w => ({ word: w.word }))
        } : null}
      />

      <ImportSpellingListDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={fetchData}
        classes={classes}
      />
    </div>
  );
}
