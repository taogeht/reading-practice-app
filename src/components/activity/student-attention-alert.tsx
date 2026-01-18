"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, Loader2, Users } from "lucide-react";

interface ClassWithInactiveStudents {
    classId: string;
    className: string;
    inactiveCount: number;
}

interface StudentAttentionAlertProps {
    classes: { id: string; name: string }[];
}

export function StudentAttentionAlert({ classes }: StudentAttentionAlertProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [classesWithIssues, setClassesWithIssues] = useState<ClassWithInactiveStudents[]>([]);

    useEffect(() => {
        if (classes.length > 0) {
            fetchInactiveStudents();
        } else {
            setLoading(false);
        }
    }, [classes]);

    const fetchInactiveStudents = async () => {
        try {
            setLoading(true);
            const results: ClassWithInactiveStudents[] = [];

            // Fetch login activity for each class
            await Promise.all(
                classes.map(async (cls) => {
                    try {
                        const response = await fetch(`/api/classes/${cls.id}/login-activity?days=7`);
                        if (response.ok) {
                            const data = await response.json();
                            const neverLoggedIn = (data.activity || []).filter(
                                (s: { lastLoginAt: string | null }) => !s.lastLoginAt
                            ).length;

                            if (neverLoggedIn > 0) {
                                results.push({
                                    classId: cls.id,
                                    className: cls.name,
                                    inactiveCount: neverLoggedIn,
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching activity for class ${cls.id}:`, error);
                    }
                })
            );

            setClassesWithIssues(results);
        } catch (error) {
            console.error("Error fetching inactive students:", error);
        } finally {
            setLoading(false);
        }
    };

    // Don't render if no issues
    if (loading) {
        return null; // Don't show loading state to avoid flickering
    }

    if (classesWithIssues.length === 0) {
        return null;
    }

    const totalInactive = classesWithIssues.reduce((sum, c) => sum + c.inactiveCount, 0);

    return (
        <Card className="border-amber-200 bg-amber-50 mb-6">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-amber-100">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-amber-800 mb-1">
                            Students Need Attention
                        </h3>
                        <p className="text-sm text-amber-700 mb-3">
                            {totalInactive} student{totalInactive !== 1 ? "s" : ""} never logged in this week
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {classesWithIssues.map((cls) => (
                                <Button
                                    key={cls.classId}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => router.push(`/teacher/classes/${cls.classId}`)}
                                    className="bg-white hover:bg-amber-100 border-amber-300"
                                >
                                    <Users className="w-3 h-3 mr-1" />
                                    {cls.className}
                                    <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800">
                                        {cls.inactiveCount}
                                    </Badge>
                                    <ChevronRight className="w-3 h-3 ml-1" />
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
