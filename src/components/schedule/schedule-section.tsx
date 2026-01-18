"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Loader2,
    Save,
    Check,
} from "lucide-react";

interface ScheduleSectionProps {
    classId: string;
    isAdmin?: boolean;
    compact?: boolean;
    onScheduleChange?: (days: number[]) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduleSection({
    classId,
    isAdmin = false,
    compact = false,
    onScheduleChange,
}: ScheduleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(!compact);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [scheduleDays, setScheduleDays] = useState<number[]>([]);
    const [editDays, setEditDays] = useState<number[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        fetchSchedule();
    }, [classId]);

    const fetchSchedule = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/classes/${classId}/schedule`);
            if (response.ok) {
                const data = await response.json();
                setScheduleDays(data.days || []);
                setEditDays(data.days || []);
            }
        } catch (error) {
            console.error("Error fetching schedule:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDayToggle = (day: number) => {
        setEditDays(prev => {
            const newDays = prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort((a, b) => a - b);
            setHasChanges(JSON.stringify(newDays) !== JSON.stringify(scheduleDays));
            return newDays;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/classes/${classId}/schedule`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: editDays }),
            });

            if (response.ok) {
                setScheduleDays(editDays);
                setHasChanges(false);
                setIsEditing(false);
                onScheduleChange?.(editDays);
            } else {
                const data = await response.json();
                alert(data.error || "Failed to save schedule");
            }
        } catch (error) {
            console.error("Error saving schedule:", error);
            alert("Failed to save schedule");
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setEditDays(scheduleDays);
        setHasChanges(false);
        setIsEditing(false);
    };

    // Format schedule for display
    const formatSchedule = (days: number[]) => {
        if (days.length === 0) return "No schedule set";
        if (days.length === 7) return "Every day";
        if (days.length === 5 && !days.includes(0) && !days.includes(6)) {
            return "Weekdays";
        }
        return days.map(d => DAY_NAMES[d]).join(" • ");
    };

    // Compact badge display for headers
    if (compact) {
        if (loading) {
            return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
        }

        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                {scheduleDays.length === 0 ? (
                    <Badge variant="outline" className="text-gray-400 text-xs">
                        No schedule
                    </Badge>
                ) : (
                    scheduleDays.map(day => (
                        <Badge
                            key={day}
                            variant="secondary"
                            className="text-xs px-1.5 py-0"
                        >
                            {DAY_NAMES[day]}
                        </Badge>
                    ))
                )}
            </div>
        );
    }

    return (
        <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => !saving && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-purple-500" />
                    <div>
                        <h3 className="font-medium">Class Schedule</h3>
                        <p className="text-sm text-gray-500">
                            {loading ? "Loading..." : formatSchedule(scheduleDays)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Quick view badges */}
                    {!loading && scheduleDays.length > 0 && !isExpanded && (
                        <div className="hidden sm:flex items-center gap-1">
                            {scheduleDays.slice(0, 5).map(day => (
                                <Badge
                                    key={day}
                                    variant="outline"
                                    className="text-xs px-1.5 py-0"
                                >
                                    {DAY_NAMES[day]}
                                </Badge>
                            ))}
                            {scheduleDays.length > 5 && (
                                <span className="text-xs text-gray-400">
                                    +{scheduleDays.length - 5}
                                </span>
                            )}
                        </div>
                    )}

                    {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <CardContent className="pt-0 border-t">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <div className="pt-4">
                            <p className="text-sm text-gray-600 mb-4">
                                {isAdmin
                                    ? "Select which days this class meets:"
                                    : "This class meets on the following days:"}
                            </p>

                            {/* Day Picker Grid */}
                            <div className="grid grid-cols-7 gap-2 mb-4">
                                {DAY_NAMES_FULL.map((dayName, index) => {
                                    const isSelected = isEditing
                                        ? editDays.includes(index)
                                        : scheduleDays.includes(index);
                                    const canEdit = isAdmin && (isEditing || scheduleDays.length === 0);

                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => {
                                                if (isAdmin) {
                                                    if (!isEditing) setIsEditing(true);
                                                    handleDayToggle(index);
                                                }
                                            }}
                                            disabled={!isAdmin}
                                            className={`
                                                relative p-3 rounded-lg border-2 text-center transition-all
                                                ${isSelected
                                                    ? "bg-purple-100 border-purple-400 text-purple-700"
                                                    : "bg-gray-50 border-gray-200 text-gray-500"
                                                }
                                                ${isAdmin
                                                    ? "cursor-pointer hover:border-purple-300"
                                                    : "cursor-default"
                                                }
                                            `}
                                        >
                                            <div className="text-xs font-medium">{DAY_NAMES[index]}</div>
                                            <div className="text-[10px] hidden sm:block">{dayName.slice(0, 3)}</div>
                                            {isSelected && (
                                                <Check className="w-3 h-3 absolute top-1 right-1 text-purple-600" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Action Buttons */}
                            {isAdmin && hasChanges && (
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCancel}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSave}
                                        disabled={saving}
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4 mr-2" />
                                                Save Schedule
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* Info for non-admins */}
                            {!isAdmin && scheduleDays.length === 0 && (
                                <p className="text-sm text-gray-500 italic">
                                    No schedule has been set for this class. Contact an admin to configure the schedule.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

// Export a function to get schedule days as a utility
export async function getClassScheduleDays(classId: string): Promise<number[]> {
    try {
        const response = await fetch(`/api/classes/${classId}/schedule`);
        if (response.ok) {
            const data = await response.json();
            return data.days || [];
        }
    } catch (error) {
        console.error("Error fetching schedule:", error);
    }
    return [];
}
