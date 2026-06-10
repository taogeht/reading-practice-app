"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateAssignmentDialog } from "@/components/assignments/create-assignment-dialog";
import { CreateClassDialog } from "@/components/classes/create-class-dialog";
import { TeacherLoginActivityCard } from "@/components/activity/teacher-login-activity-card";
import {
  Plus,
  Users,
  ChevronRight,
  CheckCircle2,
  Circle,
  Inbox,
  Loader2,
  X,
} from "lucide-react";

type ClassInfo = {
  id: string;
  name: string;
  studentCount: number;
  pendingSubmissions: number;
  recentActivity: number;
};

type Submission = {
  id: string;
  studentName: string;
  assignmentTitle: string;
  status: "pending" | "submitted" | "reviewed" | "flagged";
  submittedAt: string;
};

type DashboardData = {
  teacher: { firstName: string; classes: ClassInfo[] };
  isCoTeacherOnly: boolean;
  canManageAssignments: boolean;
  stats: { totalStudents: number; activeAssignments: number; pendingReviews: number };
  recentSubmissions: Submission[];
};

const CHECKLIST_KEY = "teacher-home-v2.getting-started.dismissed";

/**
 * Decluttered teacher Home (behind TEACHER_NAV_V2). The sidebar now owns nav +
 * logout + feature shortcuts, so Home focuses on: get-started guidance, your
 * classes, and what needs attention. Story Library + Archived moved to
 * /teacher/stories; the redundant Assignment-Progress card is dropped.
 */
export function TeacherHomeV2() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/teacher/dashboard");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    setDismissed(typeof window !== "undefined" && localStorage.getItem(CHECKLIST_KEY) === "1");
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Couldn&apos;t load your dashboard.</div>;
  }

  const { teacher, isCoTeacherOnly, canManageAssignments, stats, recentSubmissions } = data;
  const classes = teacher.classes ?? [];

  const steps = [
    { label: "Create a class", done: classes.length > 0 },
    { label: "Add students", done: stats.totalStudents > 0 },
    { label: "Create an assignment", done: stats.activeAssignments > 0 },
  ];
  const allDone = steps.every((s) => s.done);
  const showChecklist = !dismissed && !allDone;

  const dismissChecklist = () => {
    setDismissed(true);
    try {
      localStorage.setItem(CHECKLIST_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const statusBadge = (status: Submission["status"]) => {
    const map: Record<Submission["status"], string> = {
      pending: "bg-amber-100 text-amber-700 border-amber-200",
      submitted: "bg-blue-100 text-blue-700 border-blue-200",
      reviewed: "bg-green-100 text-green-700 border-green-200",
      flagged: "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <Badge variant="outline" className={`text-[10px] ${map[status]}`}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {teacher.firstName}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening in your classes.</p>
        </div>
        <div className="flex items-center gap-2">
          {!isCoTeacherOnly && (
            <Button variant="outline" onClick={() => setShowCreateClass(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Class
            </Button>
          )}
          {canManageAssignments && (
            <Button onClick={() => setShowCreateAssignment(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Assignment
            </Button>
          )}
        </div>
      </div>

      {/* Getting started */}
      {showChecklist && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Getting started</h2>
              <button
                onClick={dismissChecklist}
                className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-gray-600"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-2">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-gray-300" />
                  )}
                  <span className={s.done ? "text-gray-400 line-through" : "text-gray-700"}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Your classes */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Your Classes</h2>
        {classes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-gray-500">
              No classes yet.{" "}
              {!isCoTeacherOnly && (
                <button onClick={() => setShowCreateClass(true)} className="font-medium text-blue-600 hover:underline">
                  Create your first class
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/teacher/classes/${c.id}`)}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-gray-900 group-hover:text-blue-700">{c.name}</span>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400" />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {c.studentCount}
                  </span>
                  {c.pendingSubmissions > 0 && (
                    <span className="text-amber-600">{c.pendingSubmissions} to review</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Needs review */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900">
              <Inbox className="h-4 w-4 text-blue-600" /> Needs review
              {stats.pendingReviews > 0 && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                  {stats.pendingReviews}
                </Badge>
              )}
            </h2>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push("/teacher/submissions")}>
              View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          {recentSubmissions.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Nothing waiting — you&apos;re all caught up.</p>
          ) : (
            <div className="space-y-1.5">
              {recentSubmissions.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push("/teacher/submissions")}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 p-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-gray-900">{s.studentName}</span>{" "}
                    <span className="text-gray-500">· {s.assignmentTitle}</span>
                  </span>
                  {statusBadge(s.status)}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Engagement (reused) */}
      <TeacherLoginActivityCard />

      {/* Dialogs */}
      <CreateAssignmentDialog
        open={showCreateAssignment}
        onOpenChange={setShowCreateAssignment}
        onSuccess={() => {
          setShowCreateAssignment(false);
          fetchData();
        }}
      />
      <CreateClassDialog
        open={showCreateClass}
        onOpenChange={setShowCreateClass}
        onSuccess={() => {
          setShowCreateClass(false);
          fetchData();
        }}
      />
    </div>
  );
}
