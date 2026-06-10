"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  Plus,
  Loader2,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  CalendarDays,
} from "lucide-react";

interface RosterStudent { id: string; firstName: string; lastName: string }
interface TestScore { studentId: string; score: number | null }
interface GradebookTest {
  id: string;
  name: string;
  testType: string;
  testDate: string | null;
  scores: TestScore[];
}

const TEST_TYPES = ["quiz", "test", "spelling", "oral", "other"];

export function GradebookSection({ classId, defaultExpanded = false }: { classId: string; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [tests, setTests] = useState<GradebookTest[]>([]);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", testType: "quiz", testDate: new Date().toISOString().split("T")[0] });
  const [creating, setCreating] = useState(false);

  const [openTestId, setOpenTestId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingScores, setSavingScores] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/teacher/classes/${classId}/gradebook`);
      if (!res.ok) throw new Error("Failed to load gradebook");
      const data = await res.json();
      setStudents(data.students || []);
      setTests(data.tests || []);
    } catch {
      toast.error("Couldn't load the gradebook");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (isExpanded) fetchData();
  }, [isExpanded, fetchData]);

  const openEditor = (test: GradebookTest) => {
    if (openTestId === test.id) {
      setOpenTestId(null);
      return;
    }
    const map: Record<string, string> = {};
    for (const s of test.scores) {
      if (s.score != null) map[s.studentId] = String(s.score);
    }
    setDraft(map);
    setOpenTestId(test.id);
  };

  const createTest = async () => {
    if (!newForm.name.trim()) {
      toast.error("Give the test a name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/gradebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create test");
      setShowNewForm(false);
      setNewForm({ name: "", testType: "quiz", testDate: new Date().toISOString().split("T")[0] });
      await fetchData();
      openEditor({ ...data.test, scores: [] });
      toast.success("Test added — enter scores");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create test");
    } finally {
      setCreating(false);
    }
  };

  const saveScores = async (testId: string) => {
    setSavingScores(true);
    try {
      const scores = students.map((s) => ({
        studentId: s.id,
        score: draft[s.id] === undefined || draft[s.id] === "" ? null : Number(draft[s.id]),
      }));
      const res = await fetch(`/api/teacher/classes/${classId}/gradebook/${testId}/scores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save scores");
      await fetchData();
      toast.success("Scores saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scores");
    } finally {
      setSavingScores(false);
    }
  };

  const deleteTest = async (testId: string, name: string) => {
    if (!confirm(`Delete "${name}" and its scores?`)) return;
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/gradebook/${testId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      if (openTestId === testId) setOpenTestId(null);
      await fetchData();
      toast.success("Test deleted");
    } catch {
      toast.error("Couldn't delete the test");
    }
  };

  const scoredCount = (t: GradebookTest) => t.scores.filter((s) => s.score != null).length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ClipboardList className="h-4 w-4 text-gray-400" />
          Gradebook
          {tests.length > 0 && <Badge variant="secondary">{tests.length}</Badge>}
        </span>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {isExpanded && (
        <CardContent className="border-t pt-4 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* New test */}
              {showNewForm ? (
                <div className="rounded-lg border p-3 space-y-3 bg-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <Label htmlFor="gbName" className="text-xs">Name</Label>
                      <Input id="gbName" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="Unit 3 Quiz" className="h-8" />
                    </div>
                    <div>
                      <Label htmlFor="gbType" className="text-xs">Type</Label>
                      <select
                        id="gbType"
                        value={newForm.testType}
                        onChange={(e) => setNewForm({ ...newForm, testType: e.target.value })}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        {TEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="gbDate" className="text-xs">Date</Label>
                      <Input id="gbDate" type="date" value={newForm.testDate} onChange={(e) => setNewForm({ ...newForm, testDate: e.target.value })} className="h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={createTest} disabled={creating}>
                      {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Add test
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)} disabled={creating}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
                  <Plus className="w-4 h-4 mr-1" /> New test
                </Button>
              )}

              {students.length === 0 && (
                <p className="text-sm text-gray-500">Enroll students in this class to record scores.</p>
              )}

              {/* Test list */}
              {tests.length === 0 ? (
                <p className="text-sm text-gray-500">No tests yet.</p>
              ) : (
                <div className="space-y-2">
                  {tests.map((t) => (
                    <div key={t.id} className="rounded-lg border">
                      <div className="flex items-center justify-between p-3">
                        <button type="button" onClick={() => openEditor(t)} className="flex-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{t.name}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">{t.testType}</Badge>
                            {t.testDate && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <CalendarDays className="w-3 h-3" />{t.testDate}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">· {scoredCount(t)}/{students.length} scored</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditor(t)}>
                            {openTestId === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => deleteTest(t.id, t.name)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {openTestId === t.id && (
                        <div className="border-t p-3 space-y-2">
                          {students.length === 0 ? (
                            <p className="text-sm text-gray-500">No students enrolled.</p>
                          ) : (
                            <>
                              <div className="space-y-1.5">
                                {students.map((s) => (
                                  <div key={s.id} className="flex items-center justify-between gap-2">
                                    <span className="text-sm text-gray-700 truncate">{s.firstName} {s.lastName}</span>
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        inputMode="numeric"
                                        value={draft[s.id] ?? ""}
                                        onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                                        placeholder="—"
                                        className="h-8 w-20 text-right"
                                      />
                                      <span className="text-xs text-gray-400 w-3">%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="pt-1">
                                <Button size="sm" onClick={() => saveScores(t.id)} disabled={savingScores}>
                                  {savingScores ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                                  Save scores
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
