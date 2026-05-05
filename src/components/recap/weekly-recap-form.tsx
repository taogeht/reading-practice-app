"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Upload, Sparkles, ListChecks, MessageSquare } from "lucide-react";
import {
  BEHAVIORS,
  BEHAVIOR_RATINGS,
  BEHAVIOR_RATING_LABEL,
  BEHAVIOR_RATING_COLOR,
  type BehaviorFormat,
  type BehaviorKey,
  type BehaviorRating,
  type BehaviorRatingsMap,
} from "@/lib/recap/behaviors";

interface RosterStudent {
  studentId: string;
  firstName: string;
  lastName: string;
}

interface RecapShape {
  id?: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  pagesCovered: string | null;
  vocabulary: string | null;
  spellingTestInfo: string | null;
  grammarTestInfo: string | null;
  homework: string | null;
  behaviorFormat: BehaviorFormat;
  status: 'draft' | 'published';
  submittedAt?: string | null;
}

interface EntryShape {
  studentId: string;
  behaviorRatings: BehaviorRatingsMap | null;
  teacherComment: string | null;
  parentConfirmedAt: string | null;
}

interface Props {
  classId: string;
}

export function WeeklyRecapForm({ classId }: Props) {
  const [recap, setRecap] = useState<RecapShape | null>(null);
  const [entries, setEntries] = useState<Map<string, EntryShape>>(new Map());
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Load whatever recap exists for "current week" plus the prefill skeleton.
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/weekly-recap`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load');

      const r: RecapShape = data.recap ?? {
        ...data.skeleton,
        startDate: new Date(data.skeleton.startDate).toISOString(),
        endDate: new Date(data.skeleton.endDate).toISOString(),
      };
      setRecap(r);
      setRoster(data.roster ?? []);
      const map = new Map<string, EntryShape>();
      for (const e of (data.entries ?? []) as EntryShape[]) {
        map.set(e.studentId, e);
      }
      setEntries(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const updateRecap = (patch: Partial<RecapShape>) => {
    setRecap((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const setRating = (studentId: string, key: BehaviorKey, rating: BehaviorRating) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentId) ?? {
        studentId,
        behaviorRatings: {},
        teacherComment: null,
        parentConfirmedAt: null,
      };
      next.set(studentId, {
        ...existing,
        behaviorRatings: { ...(existing.behaviorRatings ?? {}), [key]: rating },
      });
      return next;
    });
  };

  const setComment = (studentId: string, comment: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(studentId) ?? {
        studentId,
        behaviorRatings: {},
        teacherComment: null,
        parentConfirmedAt: null,
      };
      next.set(studentId, { ...existing, teacherComment: comment });
      return next;
    });
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!recap) return false;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      // First save the class-level row.
      const classRes = await fetch(`/api/teacher/classes/${classId}/weekly-recap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekNumber: recap.weekNumber,
          startDate: recap.startDate,
          endDate: recap.endDate,
          pagesCovered: recap.pagesCovered,
          vocabulary: recap.vocabulary,
          spellingTestInfo: recap.spellingTestInfo,
          grammarTestInfo: recap.grammarTestInfo,
          homework: recap.homework,
          behaviorFormat: recap.behaviorFormat,
        }),
      });
      const classData = await classRes.json();
      if (!classRes.ok) throw new Error(classData?.error || 'Save failed');

      // Then the per-student rows.
      const entryArr = Array.from(entries.values()).map((e) => ({
        studentId: e.studentId,
        behaviorRatings: e.behaviorRatings ?? {},
        teacherComment: e.teacherComment ?? null,
      }));
      if (entryArr.length > 0) {
        const studRes = await fetch(
          `/api/teacher/classes/${classId}/weekly-recap/students?week=${recap.weekNumber}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: entryArr }),
          },
        );
        const studData = await studRes.json();
        if (!studRes.ok) throw new Error(studData?.error || 'Per-student save failed');
      }
      setInfo('Draft saved');
      // Reload so we capture any roster updates and the recap.id.
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!recap) return;
    setPublishing(true);
    try {
      const ok = await saveDraft();
      if (!ok) return;
      const res = await fetch(
        `/api/teacher/classes/${classId}/weekly-recap?action=publish&week=${recap.weekNumber}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Publish failed');
      setInfo('Published — students can now see it');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!recap) return;
    if (!confirm('Hide this recap from students until you re-publish?')) return;
    try {
      const res = await fetch(
        `/api/teacher/classes/${classId}/weekly-recap?action=unpublish&week=${recap.weekNumber}`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Unpublish failed');
      setInfo('Recap moved back to draft');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unpublish failed');
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (!recap) {
    return <div className="py-12 text-center text-red-600">{error || 'Failed to load recap'}</div>;
  }

  const isPublished = recap.status === 'published';

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      {info && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">{info}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            Week {recap.weekNumber}
            <Badge
              variant="outline"
              className={
                isPublished
                  ? 'bg-green-50 text-green-700 border-green-300'
                  : 'bg-gray-100 text-gray-700 border-gray-300'
              }
            >
              {isPublished ? 'Published' : 'Draft'}
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={() => saveDraft()} disabled={saving || publishing} variant="outline">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save draft
            </Button>
            {isPublished ? (
              <Button onClick={unpublish} variant="outline">
                Unpublish
              </Button>
            ) : (
              <Button onClick={publish} disabled={saving || publishing}>
                {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Publish
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Pages covered</Label>
            <Textarea
              rows={3}
              placeholder="e.g., Mon: 12-15, Tue: 16-18..."
              value={recap.pagesCovered ?? ''}
              onChange={(e) => updateRecap({ pagesCovered: e.target.value })}
            />
          </div>
          <div>
            <Label>Homework</Label>
            <Textarea
              rows={3}
              placeholder="What students should finish this week..."
              value={recap.homework ?? ''}
              onChange={(e) => updateRecap({ homework: e.target.value })}
            />
          </div>
          <div>
            <Label>Vocabulary</Label>
            <Textarea
              rows={3}
              placeholder="New words taught this week..."
              value={recap.vocabulary ?? ''}
              onChange={(e) => updateRecap({ vocabulary: e.target.value })}
            />
          </div>
          <div>
            <Label>Spelling test</Label>
            <Input
              placeholder="e.g., Friday — Unit 12 word list"
              value={recap.spellingTestInfo ?? ''}
              onChange={(e) => updateRecap({ spellingTestInfo: e.target.value })}
            />
            <Label className="mt-3 block">Grammar test</Label>
            <Input
              placeholder="e.g., Thursday — present continuous"
              value={recap.grammarTestInfo ?? ''}
              onChange={(e) => updateRecap({ grammarTestInfo: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Behavior feedback for parents
          </CardTitle>
          <Tabs
            value={recap.behaviorFormat}
            onValueChange={(v) => updateRecap({ behaviorFormat: v as BehaviorFormat })}
          >
            <TabsList>
              <TabsTrigger value="checklist" className="gap-2">
                <ListChecks className="w-4 h-4" />
                Checklist
              </TabsTrigger>
              <TabsTrigger value="comment" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Comment
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">
              No students enrolled in this class yet.
            </div>
          ) : recap.behaviorFormat === 'checklist' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-600 uppercase tracking-wide">
                    <th className="pb-2 pr-3">Student</th>
                    {BEHAVIORS.map((b) => (
                      <th key={b.key} className="pb-2 pr-2">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => {
                    const e = entries.get(s.studentId);
                    return (
                      <tr key={s.studentId} className="border-t">
                        <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">
                          {s.firstName} {s.lastName}
                        </td>
                        {BEHAVIORS.map((b) => {
                          const value = (e?.behaviorRatings ?? {})[b.key];
                          return (
                            <td key={b.key} className="py-2 pr-2">
                              <select
                                value={value ?? ''}
                                onChange={(ev) =>
                                  setRating(s.studentId, b.key, ev.target.value as BehaviorRating)
                                }
                                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              >
                                <option value="">—</option>
                                {BEHAVIOR_RATINGS.map((r) => (
                                  <option key={r} value={r}>{BEHAVIOR_RATING_LABEL[r]}</option>
                                ))}
                              </select>
                              {value && (
                                <span className={`ml-1 text-[10px] px-1 rounded border ${BEHAVIOR_RATING_COLOR[value]}`}>
                                  {BEHAVIOR_RATING_LABEL[value][0]}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              {roster.map((s) => {
                const e = entries.get(s.studentId);
                return (
                  <div key={s.studentId} className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-start">
                    <div className="font-medium text-gray-900 pt-2">{s.firstName} {s.lastName}</div>
                    <Textarea
                      rows={2}
                      placeholder="A short note for this student's parent..."
                      value={e?.teacherComment ?? ''}
                      onChange={(ev) => setComment(s.studentId, ev.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
