"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
    BookOpen,
    Plus,
    Edit3,
    Trash2,
    Search,
    Loader2,
    ArrowLeft,
    Save,
    X,
    Building,
    Hash,
    FileText,
} from "lucide-react";

interface Book {
    id: string;
    title: string;
    publisher: string | null;
    isbn: string | null;
    totalPages: number | null;
    gradeLevels: number[] | null;
    subject: string | null;
    coverImageUrl: string | null;
    active: boolean;
    createdAt: string;
}

const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6];
const SUBJECT_OPTIONS = ["Reading", "Phonics", "Writing", "Math", "Science", "Social Studies", "Other"];

export default function AdminBooksPage() {
    const router = useRouter();
    const [books, setBooks] = useState<Book[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingBook, setEditingBook] = useState<Book | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        publisher: "",
        isbn: "",
        totalPages: "",
        gradeLevels: [] as number[],
        subject: "",
        coverImageUrl: "",
    });

    useEffect(() => {
        fetchBooks();
    }, []);

    const fetchBooks = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/books?activeOnly=false");
            if (response.ok) {
                const data = await response.json();
                setBooks(data.books);
            }
        } catch (error) {
            console.error("Error fetching books:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            alert("Title is required");
            return;
        }

        setSaving(true);
        try {
            const url = editingBook ? `/api/books/${editingBook.id}` : "/api/books";
            const method = editingBook ? "PUT" : "POST";

            const response = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    gradeLevels: formData.gradeLevels.length > 0 ? formData.gradeLevels : null,
                }),
            });

            if (response.ok) {
                await fetchBooks();
                handleCloseDialog();
            } else {
                alert("Failed to save book");
            }
        } catch (error) {
            console.error("Error saving book:", error);
            alert("Failed to save book");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (bookId: string) => {
        if (!confirm("Are you sure you want to delete this book?")) return;

        try {
            const response = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
            if (response.ok) {
                await fetchBooks();
            } else {
                alert("Failed to delete book");
            }
        } catch (error) {
            console.error("Error deleting book:", error);
        }
    };

    const handleEdit = (book: Book) => {
        setEditingBook(book);
        setFormData({
            title: book.title,
            publisher: book.publisher || "",
            isbn: book.isbn || "",
            totalPages: book.totalPages?.toString() || "",
            gradeLevels: book.gradeLevels || [],
            subject: book.subject || "",
            coverImageUrl: book.coverImageUrl || "",
        });
        setShowAddDialog(true);
    };

    const handleCloseDialog = () => {
        setShowAddDialog(false);
        setEditingBook(null);
        setFormData({
            title: "",
            publisher: "",
            isbn: "",
            totalPages: "",
            gradeLevels: [],
            subject: "",
            coverImageUrl: "",
        });
    };

    const toggleGradeLevel = (grade: number) => {
        setFormData(prev => ({
            ...prev,
            gradeLevels: prev.gradeLevels.includes(grade)
                ? prev.gradeLevels.filter(g => g !== grade)
                : [...prev.gradeLevels, grade].sort((a, b) => a - b),
        }));
    };

    const filteredBooks = books.filter(book =>
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.publisher?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" onClick={() => router.back()}>
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <BookOpen className="w-6 h-6" />
                                    Books Management
                                </h1>
                                <p className="text-gray-600">Add and manage textbooks for all classes</p>
                            </div>
                        </div>
                        <Button onClick={() => setShowAddDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Book
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Search */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search books..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                {/* Books Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : filteredBooks.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No books found</h3>
                            <p className="text-gray-600 mb-6">
                                {searchQuery ? "Try a different search term" : "Add your first book to get started"}
                            </p>
                            {!searchQuery && (
                                <Button onClick={() => setShowAddDialog(true)}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add First Book
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredBooks.map((book) => (
                            <Card key={book.id} className={!book.active ? "opacity-60" : ""}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg">{book.title}</CardTitle>
                                            {book.publisher && (
                                                <CardDescription className="flex items-center gap-1 mt-1">
                                                    <Building className="w-3 h-3" />
                                                    {book.publisher}
                                                </CardDescription>
                                            )}
                                        </div>
                                        {!book.active && (
                                            <Badge variant="outline" className="text-gray-500">Inactive</Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {/* Subject & Pages */}
                                        <div className="flex items-center gap-4 text-sm text-gray-600">
                                            {book.subject && (
                                                <span className="flex items-center gap-1">
                                                    <FileText className="w-3 h-3" />
                                                    {book.subject}
                                                </span>
                                            )}
                                            {book.totalPages && (
                                                <span className="flex items-center gap-1">
                                                    <Hash className="w-3 h-3" />
                                                    {book.totalPages} pages
                                                </span>
                                            )}
                                        </div>

                                        {/* Grade Levels */}
                                        {book.gradeLevels && book.gradeLevels.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {book.gradeLevels.map((grade) => (
                                                    <Badge key={grade} variant="outline" className="text-xs">
                                                        Grade {grade}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1"
                                                onClick={() => handleEdit(book)}
                                            >
                                                <Edit3 className="w-3 h-3 mr-1" />
                                                Edit
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => handleDelete(book.id)}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={showAddDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editingBook ? "Edit Book" : "Add New Book"}
                        </DialogTitle>
                        <DialogDescription>
                            {editingBook ? "Update book details" : "Add a new textbook to the system"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="title">Title *</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="e.g., Reading Adventures Level 3"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="publisher">Publisher</Label>
                                <Input
                                    id="publisher"
                                    value={formData.publisher}
                                    onChange={(e) => setFormData(prev => ({ ...prev, publisher: e.target.value }))}
                                    placeholder="e.g., Pearson"
                                />
                            </div>
                            <div>
                                <Label htmlFor="isbn">ISBN</Label>
                                <Input
                                    id="isbn"
                                    value={formData.isbn}
                                    onChange={(e) => setFormData(prev => ({ ...prev, isbn: e.target.value }))}
                                    placeholder="e.g., 978-0-123456-78-9"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="subject">Subject</Label>
                                <select
                                    id="subject"
                                    value={formData.subject}
                                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                                    className="w-full h-10 rounded-md border border-gray-300 px-3"
                                >
                                    <option value="">Select subject</option>
                                    {SUBJECT_OPTIONS.map((subject) => (
                                        <option key={subject} value={subject}>{subject}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="totalPages">Total Pages</Label>
                                <Input
                                    id="totalPages"
                                    type="number"
                                    value={formData.totalPages}
                                    onChange={(e) => setFormData(prev => ({ ...prev, totalPages: e.target.value }))}
                                    placeholder="e.g., 200"
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Grade Levels</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {GRADE_OPTIONS.map((grade) => (
                                    <Button
                                        key={grade}
                                        type="button"
                                        variant={formData.gradeLevels.includes(grade) ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleGradeLevel(grade)}
                                    >
                                        Grade {grade}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="coverImageUrl">Cover Image URL (optional)</Label>
                            <Input
                                id="coverImageUrl"
                                value={formData.coverImageUrl}
                                onChange={(e) => setFormData(prev => ({ ...prev, coverImageUrl: e.target.value }))}
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleCloseDialog}>
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    {editingBook ? "Update" : "Add"} Book
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
