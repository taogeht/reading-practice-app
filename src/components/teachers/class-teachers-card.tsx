"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UserPlus,
  Users,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";

interface TeacherEntry {
  teacherId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'primary' | 'co';
  addedAt: string | null;
}

interface ApiResponse {
  teachers: TeacherEntry[];
  viewerIsPrimary: boolean;
}

interface Props {
  classId: string;
}

function fullName(t: TeacherEntry): string {
  return [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email;
}

export function ClassTeachersCard({ classId }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [showAdd, setShowAdd] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/teachers`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load');
      setData(body as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const submitAdd = async () => {
    setAdding(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add');
      if (body.added === false) {
        setAddError('That teacher is already a co-teacher of this class.');
      } else {
        setAddSuccess(
          `Added ${body.teacher.firstName ?? ''} ${body.teacher.lastName ?? ''}`.trim() ||
            'Co-teacher added',
        );
        setEmailInput('');
        await load();
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const closeDialog = () => {
    setShowAdd(false);
    setEmailInput('');
    setAddError(null);
    setAddSuccess(null);
  };

  const remove = async (teacherId: string, name: string) => {
    if (!confirm(`Remove ${name} as a co-teacher?`)) return;
    setRemovingId(teacherId);
    try {
      const res = await fetch(
        `/api/teacher/classes/${classId}/teachers/${teacherId}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to remove');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-3 text-center text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-3 text-xs text-red-600 px-4">
          {error || 'Failed to load teachers'}
        </CardContent>
      </Card>
    );
  }

  const cos = data.teachers.filter((t) => t.role === 'co');
  const primary = data.teachers.find((t) => t.role === 'primary');
  const canManage = data.viewerIsPrimary;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          Teachers ({data.teachers.length})
        </CardTitle>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAdd(true)}
            className="h-7 px-2 text-xs"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {primary && (
          <div className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">
                {fullName(primary)}
              </div>
              <div className="text-xs text-gray-500 truncate">{primary.email}</div>
            </div>
            <Badge
              variant="outline"
              className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]"
            >
              Primary
            </Badge>
          </div>
        )}
        {cos.map((t) => (
          <div key={t.teacherId} className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">{fullName(t)}</div>
              <div className="text-xs text-gray-500 truncate">{t.email}</div>
            </div>
            <div className="flex items-center gap-1">
              <Badge
                variant="outline"
                className="bg-gray-100 text-gray-700 border-gray-300 text-[10px]"
              >
                Co-teacher
              </Badge>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(t.teacherId, fullName(t))}
                  disabled={removingId === t.teacherId}
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                  title="Remove co-teacher"
                >
                  {removingId === t.teacherId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
        {cos.length === 0 && (
          <p className="text-xs text-gray-500">
            No co-teachers yet.
            {canManage && ' Click Add to invite another teacher to share this class.'}
          </p>
        )}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(open) => (open ? setShowAdd(true) : closeDialog())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Add a co-teacher
              </span>
            </DialogTitle>
            <DialogDescription>
              The teacher you add will get full access to this class — assignments,
              recordings, feedback, the weekly recap, everything except the ability
              to delete the class or manage co-teachers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="co-teacher-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Teacher's email
              </label>
              <Input
                id="co-teacher-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="someone@school.edu"
                disabled={adding}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitAdd();
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                The account must already exist with the teacher role.
              </p>
            </div>
            {addError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {addError}
              </div>
            )}
            {addSuccess && (
              <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2">
                <Check className="w-4 h-4" />
                {addSuccess}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={adding}>
              Close
            </Button>
            <Button onClick={submitAdd} disabled={adding || !emailInput.trim()}>
              {adding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add co-teacher
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
