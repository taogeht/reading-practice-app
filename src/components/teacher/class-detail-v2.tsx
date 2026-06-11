"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SpellingWordsSection } from "@/components/spelling/spelling-words-section";
import { AttendanceSection } from "@/components/attendance/attendance-section";
import { MakeupWorkSection } from "@/components/attendance/makeup-work-section";
import { GradebookSection } from "@/components/teacher/gradebook-section";
import { ClassMediaUploadSection } from "@/components/teacher/class-media-upload-section";
import { ClassEngagementSection } from "@/components/gamification/class-engagement-section";
import { ClassPracticeUnitsSection } from "@/components/practice/class-practice-units-section";
import { ClassPracticeSection } from "@/components/practice/class-practice-section";
import { ClassShopSection } from "@/components/gamification/class-shop-section";
import { LoginActivitySection } from "@/components/activity/login-activity-section";
import { ClassTeachersCard } from "@/components/teachers/class-teachers-card";
import { RecapConfirmationSummary } from "@/components/recap/recap-confirmation-summary";
import {
  Users,
  MoreHorizontal,
  FileText,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  QrCode,
  CreditCard,
  Edit3,
  Trash2,
  Wrench,
  ChevronDown,
  GraduationCap,
} from "lucide-react";

/**
 * Simplified class page (behind TEACHER_NAV_V2). Renders into the existing class
 * page, reusing all its inline dialogs/state via the callbacks below. The header
 * shrinks to Students + a "More" menu; the body shows the daily-core cards with
 * everything else tucked into a collapsible "Tools" drawer.
 */

export function ClassMoreMenu({
  classId,
  studentCount,
  isPrimary,
  onStudents,
  onQR,
  onEdit,
  onDelete,
  onSyllabus,
  onPromote,
}: {
  classId: string;
  studentCount: number;
  isPrimary: boolean;
  onStudents: () => void;
  onQR: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSyllabus: () => void;
  onPromote: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const Item = ({
    icon: Icon,
    label,
    onClick,
    danger,
    disabled,
  }: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => run(onClick)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      <Button onClick={onStudents} variant="outline" size="sm">
        <Users className="mr-1.5 h-4 w-4" />
        Students ({studentCount})
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="mr-1.5 h-4 w-4" />
            More
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <Item
            icon={FileText}
            label="Assignments"
            onClick={() => router.push(`/teacher/assignments?classId=${classId}`)}
          />
          {isPrimary && (
            <>
              <Item
                icon={BookOpen}
                label="Class Progress"
                onClick={() => router.push(`/teacher/classes/${classId}/progress`)}
              />
              <Item
                icon={CalendarDays}
                label="Weekly Recap"
                onClick={() => router.push(`/teacher/classes/${classId}/weekly-recap`)}
              />
              <Item icon={FileSpreadsheet} label="Import Syllabus" onClick={onSyllabus} />
            </>
          )}
          <Item icon={QrCode} label="Class QR" onClick={onQR} />
          <Item
            icon={CreditCard}
            label="Login Cards"
            onClick={() => router.push(`/teacher/classes/${classId}/login-cards`)}
          />
          {isPrimary && (
            <>
              <div className="my-1 border-t" />
              <Item icon={GraduationCap} label="Promote to Term" onClick={onPromote} />
              <Item icon={Edit3} label="Edit Class" onClick={onEdit} />
              <Item
                icon={Trash2}
                label="Delete Class"
                onClick={onDelete}
                danger
                disabled={studentCount > 0}
              />
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ClassBodyV2({
  classId,
  className,
  hasSpelling,
  isPrimary,
}: {
  classId: string;
  className: string;
  hasSpelling: boolean;
  isPrimary: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Daily-core */}
      {hasSpelling && <SpellingWordsSection classId={classId} defaultExpanded={false} />}
      <AttendanceSection classId={classId} className={className} />
      <MakeupWorkSection classId={classId} />
      <GradebookSection classId={classId} defaultExpanded={false} />

      {/* Everything occasional / advanced, one click away */}
      <details className="group rounded-xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <Wrench className="h-4 w-4 text-gray-400" />
            Tools
          </span>
          <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t p-4">
          {isPrimary && <RecapConfirmationSummary classId={classId} />}
          <ClassMediaUploadSection classId={classId} defaultExpanded={false} />
          <ClassEngagementSection classId={classId} defaultExpanded={false} />
          <ClassPracticeUnitsSection classId={classId} defaultExpanded={false} />
          <ClassPracticeSection classId={classId} defaultExpanded={false} />
          <ClassShopSection classId={classId} defaultExpanded={false} />
          <LoginActivitySection classId={classId} defaultExpanded={false} />
          <ClassTeachersCard classId={classId} />
        </div>
      </details>
    </div>
  );
}
