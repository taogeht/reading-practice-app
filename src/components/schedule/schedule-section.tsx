"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Loader2,
    Save,
    Check,
    Clock,
} from "lucide-react";

interface ScheduleEntry {
    dayOfWeek: number;
    startTime: string | null;
    endTime: string | null;
}

interface ScheduleSectionProps {
    classId: string;
    isAdmin?: boolean;
    compact?: boolean;
    onScheduleChange?: (days: number[]) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Generate time options from 1:30 PM to 9:00 PM in 10-minute increments
function generateTimeOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];

    // Start at 13:30 (1:30 PM), end at 21:00 (9:00 PM)
    for (let hour = 13; hour <= 21; hour++) {
        for (let minute = 0; minute < 60; minute += 10) {
            // Start at 13:30
            if (hour === 13 && minute < 30) continue;
            // End at 21:00
            if (hour === 21 && minute > 0) break;

            const value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const displayHour = hour > 12 ? hour - 12 : hour;
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const label = `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;

            options.push({ value, label });
        }
    }

    return options;
}

const TIME_OPTIONS = generateTimeOptions();

// Format time for display (convert 24h to 12h)
function formatTime(time: string | null): string {
    if (!time) return "";
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr, 10);
    const displayHour = hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${minuteStr} ${ampm}`;
}

export function ScheduleSection({
    classId,
    isAdmin = false,
    compact = false,
    onScheduleChange,
}: ScheduleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(!compact);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
    const [editSchedule, setEditSchedule] = useState<ScheduleEntry[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const scheduleDays = useMemo(() => schedule.map(s => s.dayOfWeek), [schedule]);

    useEffect(() => {
        fetchSchedule();
    }, [classId]);

    const fetchSchedule = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/classes/${classId}/schedule`);
            if (response.ok) {
                const data = await response.json();
                const scheduleData = data.schedule || [];
                setSchedule(scheduleData);
                setEditSchedule(scheduleData);
            }
        } catch (error) {
            console.error("Error fetching schedule:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDayToggle = (day: number) => {
        setEditSchedule(prev => {
            const exists = prev.find(s => s.dayOfWeek === day);
            let newSchedule: ScheduleEntry[];

            if (exists) {
                newSchedule = prev.filter(s => s.dayOfWeek !== day);
            } else {
                newSchedule = [...prev, { dayOfWeek: day, startTime: null, endTime: null }]
                    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
            }

            setHasChanges(JSON.stringify(newSchedule) !== JSON.stringify(schedule));
            return newSchedule;
        });
    };

    const handleTimeChange = (day: number, field: 'startTime' | 'endTime', value: string) => {
        setEditSchedule(prev => {
            const newSchedule = prev.map(s =>
                s.dayOfWeek === day
                    ? { ...s, [field]: value || null }
                    : s
            );
            setHasChanges(JSON.stringify(newSchedule) !== JSON.stringify(schedule));
            return newSchedule;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/classes/${classId}/schedule`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ schedule: editSchedule }),
            });

            if (response.ok) {
                setSchedule(editSchedule);
                setHasChanges(false);
                setIsEditing(false);
                onScheduleChange?.(editSchedule.map(s => s.dayOfWeek));
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
        setEditSchedule(schedule);
        setHasChanges(false);
        setIsEditing(false);
    };

    // Format schedule for display
    const formatScheduleDisplay = () => {
        if (schedule.length === 0) return "No schedule set";
        if (schedule.length === 7) return "Every day";
        if (schedule.length === 5 && !scheduleDays.includes(0) && !scheduleDays.includes(6)) {
            return "Weekdays";
        }
        return scheduleDays.map(d => DAY_NAMES[d]).join(" • ");
    };

    // Compact badge display for headers
    if (compact) {
        if (loading) {
            return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
        }

        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                {schedule.length === 0 ? (
                    <Badge variant="outline" className="text-gray-400 text-xs">
                        No schedule
                    </Badge>
                ) : (
                    schedule.map(entry => (
                        <Badge
                            key={entry.dayOfWeek}
                            variant="secondary"
                            className="text-xs px-1.5 py-0"
                        >
                            {DAY_NAMES[entry.dayOfWeek]}
                            {entry.startTime && entry.endTime && (
                                <span className="ml-1 text-[10px] opacity-75">
                                    {formatTime(entry.startTime).replace(' PM', '').replace(' AM', '')}-{formatTime(entry.endTime).replace(' PM', '').replace(' AM', '')}
                                </span>
                            )}
                        </Badge>
                    ))
                )}
            </div>
        );
    }

    const currentSchedule = isEditing ? editSchedule : schedule;

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
                            {loading ? "Loading..." : formatScheduleDisplay()}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!loading && scheduleDays.length > 0 && !isExpanded && (
                        <div className="hidden sm:flex items-center gap-1">
                            {schedule.slice(0, 3).map(entry => (
                                <Badge
                                    key={entry.dayOfWeek}
                                    variant="outline"
                                    className="text-xs px-1.5 py-0"
                                >
                                    {DAY_NAMES[entry.dayOfWeek]}
                                </Badge>
                            ))}
                            {schedule.length > 3 && (
                                <span className="text-xs text-gray-400">
                                    +{schedule.length - 3}
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
                                    ? "Select which days this class meets and set the times:"
                                    : "This class meets on the following days:"}
                            </p>

                            {/* Day Picker Grid */}
                            <div className="grid grid-cols-7 gap-2 mb-4">
                                {DAY_NAMES_FULL.map((dayName, index) => {
                                    const entry = currentSchedule.find(s => s.dayOfWeek === index);
                                    const isSelected = !!entry;

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

                            {/* Time Pickers for Selected Days */}
                            {currentSchedule.length > 0 && (
                                <div className="space-y-3 bg-gray-50 rounded-lg p-4 mb-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                        <Clock className="w-4 h-4" />
                                        Class Times
                                    </div>
                                    {currentSchedule.map(entry => (
                                        <div
                                            key={entry.dayOfWeek}
                                            className="flex items-center gap-3 flex-wrap"
                                        >
                                            <span className="w-20 font-medium text-sm">
                                                {DAY_NAMES_FULL[entry.dayOfWeek]}
                                            </span>

                                            <Select
                                                value={entry.startTime || ""}
                                                onValueChange={(value) => {
                                                    if (!isEditing) setIsEditing(true);
                                                    handleTimeChange(entry.dayOfWeek, 'startTime', value);
                                                }}
                                                disabled={!isAdmin}
                                            >
                                                <SelectTrigger className="w-28 h-8 text-xs">
                                                    <SelectValue placeholder="Start" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TIME_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <span className="text-gray-400 text-sm">to</span>

                                            <Select
                                                value={entry.endTime || ""}
                                                onValueChange={(value) => {
                                                    if (!isEditing) setIsEditing(true);
                                                    handleTimeChange(entry.dayOfWeek, 'endTime', value);
                                                }}
                                                disabled={!isAdmin}
                                            >
                                                <SelectTrigger className="w-28 h-8 text-xs">
                                                    <SelectValue placeholder="End" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TIME_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ))}
                                </div>
                            )}

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
                            {!isAdmin && schedule.length === 0 && (
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
