"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit2, Upload, ExternalLink, Save, X, Calendar, BookOpen, FileText, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SyllabusExcelParser, ParsedWeek } from "./syllabus-excel-parser";

interface AssignedBook {
    id: string;
    bookId: string;
    title: string;
    publisher: string | null;
    totalPages: number | null;
    subject: string | null;
    isCurrent: boolean;
}

interface SyllabusAssignment {
    bookId: string;
    pages: string;
}

interface SyllabusWeek {
    id: string;
    weekNumber: number;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    assignments: SyllabusAssignment[];
}

export function SyllabusManager({
    classId,
    assignedBooks,
    onSyllabusUpdated
}: {
    classId: string,
    assignedBooks: AssignedBook[],
    onSyllabusUpdated?: () => void
}) {
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [syllabusUrl, setSyllabusUrl] = useState<string | null>(null);
    const [weeks, setWeeks] = useState<SyllabusWeek[]>([]);
    const [isImportingExcel, setIsImportingExcel] = useState(false);

    // Edit state
    const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<SyllabusWeek>>({});

    useEffect(() => {
        fetchSyllabus();
    }, [classId]);

    const fetchSyllabus = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/classes/${classId}/syllabus`);
            if (res.ok) {
                const data = await res.json();
                setSyllabusUrl(data.syllabusUrl);
                setWeeks(data.weeks || []);
            }
        } catch (error) {
            console.error("Error fetching syllabus:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setIsUploading(true);

        try {
            // Get presigned url
            const uploadRes = await fetch(`/api/upload/syllabus`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type,
                    classId
                }),
            });

            if (!uploadRes.ok) {
                const errorData = await uploadRes.json();
                throw new Error(errorData.error || "Failed to get upload URL");
            }

            const { presignedUrl, publicUrl } = await uploadRes.json();

            // Upload to S3
            const s3Res = await fetch(presignedUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!s3Res.ok) {
                throw new Error("Failed to upload file to storage");
            }

            // Save URL to class
            await fetch(`/api/classes/${classId}/syllabus`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "updateSyllabusUrl",
                    syllabusUrl: publicUrl
                })
            });

            setSyllabusUrl(publicUrl);
            if (onSyllabusUpdated) onSyllabusUpdated();

        } catch (error: any) {
            alert(error.message);
            console.error(error);
        } finally {
            setIsUploading(false);
        }
    };

    const startAddWeek = () => {
        const nextWeekNum = weeks.length > 0 ? Math.max(...weeks.map(w => w.weekNumber)) + 1 : 1;
        setEditingWeekId("new");
        setEditForm({
            weekNumber: nextWeekNum,
            title: `Week ${nextWeekNum}`,
            startDate: null,
            endDate: null,
            assignments: assignedBooks.map(b => ({ bookId: b.bookId, pages: "" }))
        });
    };

    const startEditWeek = (week: SyllabusWeek) => {
        setEditingWeekId(week.id);

        // Merge existing assignments with any newly assigned books that lack assignments
        const assignments = assignedBooks.map(b => {
            const existing = week.assignments.find(a => a.bookId === b.bookId);
            return existing || { bookId: b.bookId, pages: "" };
        });

        setEditForm({ ...week, assignments });
    };

    const saveWeek = async () => {
        try {
            const isNew = editingWeekId === "new";

            // Filter assignments that are empty to avoid clutter
            const cleanedAssignments = (editForm.assignments || []).filter(a => a.pages && a.pages.trim() !== "");

            const payload = {
                ...editForm,
                action: "createWeek",
                assignments: cleanedAssignments
            };

            const url = isNew
                ? `/api/classes/${classId}/syllabus`
                : `/api/classes/${classId}/syllabus/weeks/${editingWeekId}`;

            const method = isNew ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                await fetchSyllabus();
                setEditingWeekId(null);
                setEditForm({});
                if (onSyllabusUpdated) onSyllabusUpdated();
            } else {
                alert("Failed to save week");
            }

        } catch (error) {
            console.error("Error saving week:", error);
            alert("Error saving week");
        }
    };

    const deleteWeek = async (weekId: string) => {
        if (!confirm("Delete this week mapping?")) return;

        try {
            const res = await fetch(`/api/classes/${classId}/syllabus/weeks/${weekId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                await fetchSyllabus();
                if (onSyllabusUpdated) onSyllabusUpdated();
            } else {
                alert("Failed to delete week");
            }
        } catch (error) {
            console.error("Error deleting week:", error);
        }
    };

    const handleExcelImport = async (parsedWeeks: ParsedWeek[]) => {
        try {
            const res = await fetch(`/api/classes/${classId}/syllabus/bulk-import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weeks: parsedWeeks })
            });

            if (res.ok) {
                await fetchSyllabus();
                setIsImportingExcel(false);
                if (onSyllabusUpdated) onSyllabusUpdated();
            } else {
                const data = await res.json();
                alert(`Failed to import weeks: ${data.details || data.error}`);
            }
        } catch (error) {
            console.error("Error importing weeks:", error);
            alert("Error importing weeks");
        }
    };

    if (loading) {
        return <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
    }

    return (
        <div className="space-y-6">
            {/* Syllabus Upload Section */}
            <Card>
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <h4 className="font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Class Syllabus Document
                        </h4>
                        <p className="text-sm text-gray-500 mt-1">Upload a PDF/Image of your syllabus reference</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {syllabusUrl && (
                            <a href={syllabusUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-medium">
                                <ExternalLink className="w-4 h-4" />
                                View Current
                            </a>
                        )}
                        <Label htmlFor="syllabus-upload" className="cursor-pointer">
                            <div className={`inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 ${isUploading ? 'opacity-50' : ''}`}>
                                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                {syllabusUrl ? "Replace File" : "Upload Syllabus"}
                            </div>
                        </Label>
                        <input
                            id="syllabus-upload"
                            type="file"
                            className="hidden"
                            accept=".pdf,image/*,.doc,.docx"
                            onChange={handleFileUpload}
                            disabled={isUploading}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Weeks Management */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-lg">Weekly Schedule & Assignments</h3>
                    {!editingWeekId && !isImportingExcel && (
                        <div className="flex gap-2">
                            <Button onClick={() => setIsImportingExcel(true)} size="sm" variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                <FileSpreadsheet className="w-4 h-4 mr-2" />
                                Import from Excel
                            </Button>
                            <Button onClick={startAddWeek} size="sm">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Week
                            </Button>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    {isImportingExcel && (
                        <div className="mb-6">
                            <SyllabusExcelParser
                                books={assignedBooks.map(b => ({ id: b.bookId, name: b.title }))}
                                onImport={handleExcelImport}
                                onCancel={() => setIsImportingExcel(false)}
                            />
                        </div>
                    )}

                    {weeks.length === 0 && !editingWeekId && !isImportingExcel && (
                        <div className="text-center p-8 bg-gray-50 rounded-lg text-gray-500">
                            <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p>No weeks defined yet.</p>
                            <p className="text-sm mt-1">Add your weekly schedule to easily track class progress.</p>
                        </div>
                    )}

                    {weeks.map(week => {
                        if (editingWeekId === week.id) {
                            return <WeekEditor key={week.id} form={editForm} setForm={setEditForm} onSave={saveWeek} onCancel={() => setEditingWeekId(null)} assignedBooks={assignedBooks} />;
                        }

                        return (
                            <Card key={week.id} className="border border-gray-200">
                                <div className="p-4 flex items-start justify-between bg-gray-50 rounded-t-lg border-b">
                                    <div>
                                        <h4 className="font-medium text-lg flex items-center gap-2">
                                            {week.title || `Week ${week.weekNumber}`}
                                        </h4>
                                        {(week.startDate || week.endDate) && (
                                            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                                <Calendar className="w-3 h-3" />
                                                {week.startDate ? new Date(week.startDate).toLocaleDateString() : '?'} -
                                                {week.endDate ? new Date(week.endDate).toLocaleDateString() : '?'}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => startEditWeek(week)}>
                                            <Edit2 className="w-4 h-4 text-gray-500" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => deleteWeek(week.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                                <CardContent className="p-4">
                                    {week.assignments && week.assignments.length > 0 ? (
                                        <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                                            {week.assignments.map(a => {
                                                const book = assignedBooks.find(b => b.bookId === a.bookId);
                                                if (!book) return null;
                                                return (
                                                    <div key={a.bookId} className="flex items-center gap-2 bg-blue-50/50 p-2 rounded-md border border-blue-100">
                                                        <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                                                        <span className="text-sm font-medium text-gray-800 truncate" title={book.title}>{book.title}</span>
                                                        <span className="text-sm bg-white px-2 py-0.5 rounded border shadow-sm ml-auto whitespace-nowrap">Pg: {a.pages}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500 italic">No book pages assigned for this week.</p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    {editingWeekId === "new" && (
                        <WeekEditor form={editForm} setForm={setEditForm} onSave={saveWeek} onCancel={() => setEditingWeekId(null)} assignedBooks={assignedBooks} />
                    )}
                </div>
            </div>
        </div>
    );
}

function WeekEditor({
    form,
    setForm,
    onSave,
    onCancel,
    assignedBooks
}: {
    form: Partial<SyllabusWeek>,
    setForm: (v: any) => void,
    onSave: () => void,
    onCancel: () => void,
    assignedBooks: AssignedBook[]
}) {
    const handleAssignmentChange = (bookId: string, value: string) => {
        const assignments = [...(form.assignments || [])];
        const idx = assignments.findIndex(a => a.bookId === bookId);
        if (idx !== -1) {
            assignments[idx].pages = value;
        } else {
            assignments.push({ bookId, pages: value });
        }
        setForm({ ...form, assignments });
    };

    return (
        <Card className="border-2 border-blue-200 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b">
                    <h4 className="font-semibold text-blue-900">
                        {form.id ? 'Edit Week Details' : 'New Week Details'}
                    </h4>
                    <Button variant="ghost" size="sm" onClick={onCancel}><X className="w-4 h-4" /></Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label>Week Number</Label>
                        <Input
                            type="number"
                            min="1"
                            value={form.weekNumber || ''}
                            onChange={e => setForm({ ...form, weekNumber: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>Title / Label</Label>
                        <Input
                            placeholder="e.g. Week 1 or Unit 1"
                            value={form.title || ''}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>Start Date (Optional)</Label>
                        <Input
                            type="date"
                            value={form.startDate ? new Date(form.startDate).toISOString().split('T')[0] : ''}
                            onChange={e => setForm({ ...form, startDate: e.target.value || null })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>End Date (Optional)</Label>
                        <Input
                            type="date"
                            value={form.endDate ? new Date(form.endDate).toISOString().split('T')[0] : ''}
                            onChange={e => setForm({ ...form, endDate: e.target.value || null })}
                        />
                    </div>
                </div>

                <div className="pt-4 space-y-3">
                    <Label className="text-gray-600 block mb-2">Assign Book Pages</Label>
                    {assignedBooks.map(book => {
                        const existing = form.assignments?.find(a => a.bookId === book.bookId);
                        const pages = existing ? existing.pages : "";

                        return (
                            <div key={book.bookId} className="flex items-center gap-3 bg-gray-50 p-2 rounded border">
                                <BookOpen className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="text-sm font-medium flex-1 truncate">{book.title}</span>
                                <Input
                                    className="w-32 h-8 bg-white"
                                    placeholder="Pages (e.g. 4-7)"
                                    value={pages}
                                    onChange={(e) => handleAssignmentChange(book.bookId, e.target.value)}
                                />
                            </div>
                        )
                    })}
                </div>

                <div className="flex gap-2 pt-2">
                    <Button onClick={onSave} className="flex-1">
                        <Save className="w-4 h-4 mr-2" /> Save Week
                    </Button>
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
