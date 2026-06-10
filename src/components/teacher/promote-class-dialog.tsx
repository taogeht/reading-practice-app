"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";

interface TermOption {
  id: string;
  name: string;
  isCurrent: boolean;
}

/**
 * Promote a class into a new term: spins up a fresh class in the chosen term
 * and copies the current roster across. Curriculum progress starts over; old
 * assignments/attendance/recaps are not carried. Primary-teacher only (gated by
 * the caller).
 */
export function PromoteClassDialog({
  classId,
  className,
  open,
  onOpenChange,
}: {
  classId: string;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [targetTermId, setTargetTermId] = useState("");
  const [newName, setNewName] = useState(className);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewName(className);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/teacher/terms");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list: TermOption[] = data.terms || [];
        setTerms(list);
        const current = list.find((t) => t.isCurrent);
        if (current) setTargetTermId((prev) => prev || current.id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, className]);

  const handlePromote = async () => {
    if (!targetTermId) {
      setError("Pick a term to promote into.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTermId, newName: newName.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote class");
      }
      toast.success(data.message || "Class promoted.");
      onOpenChange(false);
      if (data.class?.id) router.push(`/teacher/classes/${data.class.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to promote class");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Promote to a new term</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Creates a new class in the term you choose and copies this class's current
            roster into it. Curriculum progress starts fresh — assignments, attendance,
            and recaps are not carried over.
          </p>

          {terms.length === 0 ? (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              No terms exist yet. Ask your admin to create an academic term first.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="targetTerm">New term</Label>
                <Select value={targetTermId} onValueChange={setTargetTermId}>
                  <SelectTrigger id="targetTerm">
                    <SelectValue placeholder="Select a term" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.isCurrent ? " (current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newClassName">New class name</Label>
                <Input
                  id="newClassName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={className}
                />
              </div>
            </>
          )}

          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handlePromote} disabled={loading || terms.length === 0}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Promote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
