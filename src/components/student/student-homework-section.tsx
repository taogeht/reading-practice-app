"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    BookOpen,
    ClipboardList,
    Calendar,
    Loader2,
    FileText,
} from "lucide-react";

interface HomeworkEntry {
    id: string;
    date: string;
    bookTitle: string;
    bookPublisher: string | null;
    pagesCompleted: string | null;
    homeworkAssigned: string;
}

export function StudentHomeworkSection() {
    const [homework, setHomework] = useState<HomeworkEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHomework();
    }, []);

    const fetchHomework = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/student/homework");
            if (response.ok) {
                const data = await response.json();
                setHomework(data.homework || []);
            }
        } catch (error) {
            console.error("Error fetching homework:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) {
            return "Today";
        } else if (d.toDateString() === yesterday.toDateString()) {
            return "Yesterday";
        } else {
            return d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
            });
        }
    };

    if (loading) {
        return (
            <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-orange-700">
                        <ClipboardList className="w-6 h-6" />
                        📝 My Homework
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (homework.length === 0) {
        return null; // Don't show section if no homework
    }

    return (
        <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-orange-700">
                    <ClipboardList className="w-6 h-6" />
                    📝 My Homework
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {homework.map((entry) => (
                    <div
                        key={entry.id}
                        className="bg-white rounded-xl p-4 border-2 border-orange-100 shadow-sm"
                    >
                        {/* Book Header */}
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-orange-600" />
                                <span className="font-bold text-lg text-gray-900">
                                    {entry.bookTitle}
                                </span>
                            </div>
                            <Badge
                                variant="outline"
                                className="bg-orange-100 text-orange-700 border-orange-300"
                            >
                                <Calendar className="w-3 h-3 mr-1" />
                                {formatDate(entry.date)}
                            </Badge>
                        </div>

                        {/* Pages Covered */}
                        {entry.pagesCompleted && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                                <FileText className="w-4 h-4" />
                                <span>Class covered: Pages {entry.pagesCompleted}</span>
                            </div>
                        )}

                        {/* Homework Assignment */}
                        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                            <p className="text-orange-900 font-medium">
                                {entry.homeworkAssigned}
                            </p>
                        </div>
                    </div>
                ))}

                {homework.length > 0 && (
                    <p className="text-xs text-center text-gray-500 pt-2">
                        Showing assignments from the past week
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
