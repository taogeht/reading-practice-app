"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRADE_LEVELS_EXTENDED } from "@/lib/grade-levels";
import { Link as LinkIcon } from "lucide-react";

interface CreateClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Mirror of the server-side suggestSlug. Kept lightweight here so the input
// can update live as the teacher types name + year. The server is the source
// of truth on save (it'll re-suggest if the input is empty, and validate
// + dedupe regardless).
function suggestSlugClient(name: string, year: string): string {
  const raw = `${name}-${year}`;
  let slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/g, '');
  return slug;
}

export function CreateClassDialog({ open, onOpenChange, onSuccess }: CreateClassDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    gradeLevel: "",
    academicYear: "",
    slug: "",
  });
  // Tracks whether the teacher has manually typed in the slug field. Once
  // they have, auto-suggestion stops so we don't clobber their custom value.
  const [slugTouched, setSlugTouched] = useState(false);

  // Keep the slug field in sync with name + year while the teacher hasn't
  // touched it yet.
  useEffect(() => {
    if (slugTouched) return;
    const suggested = suggestSlugClient(formData.name, formData.academicYear);
    setFormData((prev) => (prev.slug === suggested ? prev : { ...prev, slug: suggested }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, formData.academicYear, slugTouched]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      gradeLevel: "",
      academicYear: "",
      slug: "",
    });
    setSlugTouched(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          gradeLevel: formData.gradeLevel ? parseInt(formData.gradeLevel) : null,
          academicYear: formData.academicYear || null,
          slug: formData.slug.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // 409 = slug collision. Server returns a `suggestion` we can drop into
        // the field for the teacher.
        if (response.status === 409 && errorData.suggestion) {
          setSlugTouched(true);
          setFormData((prev) => ({ ...prev, slug: errorData.suggestion }));
        }
        throw new Error(errorData.error || 'Failed to create class');
      }

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create class');
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const academicYears = [
    `${currentYear - 1}-${currentYear}`,
    `${currentYear}-${currentYear + 1}`,
    `${currentYear + 1}-${currentYear + 2}`,
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create New Class</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Class Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Ms. Johnson's 2nd Grade Reading"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description of the class"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeLevel">Grade Level</Label>
            <Select
              value={formData.gradeLevel}
              onValueChange={(value) => setFormData({ ...formData, gradeLevel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select grade level" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS_EXTENDED.map((grade) => (
                  <SelectItem key={grade.value} value={String(grade.value)}>
                    {grade.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academicYear">Academic Year</Label>
            <Select
              value={formData.academicYear}
              onValueChange={(value) => setFormData({ ...formData, academicYear: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select academic year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug" className="flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              Class URL
            </Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setFormData({ ...formData, slug: e.target.value });
              }}
              placeholder="auto-suggested from name + year"
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-xs text-gray-500">
              Students will type{' '}
              <span className="font-mono text-gray-700">
                /c/{formData.slug || '…'}
              </span>{' '}
              to log in. Lowercase letters, numbers, and hyphens.
            </p>
          </div>

          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Class"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
