'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface School {
  id: string;
  name: string;
}

interface Term {
  id: string;
  schoolId: string;
  schoolName: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  createdAt: string;
}

const emptyForm = { name: '', startDate: '', endDate: '', isCurrent: false };

export default function TermManagementPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<string>('');
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Term | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTerms = useCallback(async (sid: string) => {
    const url = sid ? `/api/admin/terms?schoolId=${sid}` : '/api/admin/terms';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch terms');
    const data = await res.json();
    setTerms(data.terms);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [schoolsRes] = await Promise.all([fetch('/api/admin/schools')]);
        if (!schoolsRes.ok) throw new Error('Failed to fetch schools');
        const schoolsData = await schoolsRes.json();
        setSchools(schoolsData.schools);
        const firstId = schoolsData.schools[0]?.id || '';
        setSchoolId(firstId);
        await fetchTerms(firstId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchTerms]);

  const onSchoolChange = async (sid: string) => {
    setSchoolId(sid);
    try {
      await fetchTerms(sid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (term: Term) => {
    setEditing(term);
    setForm({
      name: term.name,
      startDate: term.startDate || '',
      endDate: term.endDate || '',
      isCurrent: term.isCurrent,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('Term name is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/admin/terms/${editing.id}` : '/api/admin/terms';
      const method = editing ? 'PUT' : 'POST';
      const body = editing
        ? { name: form.name, startDate: form.startDate || null, endDate: form.endDate || null, isCurrent: form.isCurrent }
        : { schoolId, name: form.name, startDate: form.startDate || null, endDate: form.endDate || null, isCurrent: form.isCurrent };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save term');
      }
      setDialogOpen(false);
      await fetchTerms(schoolId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save term');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (term: Term) => {
    if (!confirm(`Delete "${term.name}"? Classes in this term will become ungrouped.`)) return;
    try {
      const res = await fetch(`/api/admin/terms/${term.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete term');
      }
      await fetchTerms(schoolId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete term');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading terms…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Academic Terms</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Group classes into terms for progress tracking and roster promotion. One term per school can be marked current.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!schoolId}>Add Term</Button>
      </div>

      <div className="mb-4 max-w-xs">
        <Label className="mb-1.5 block">School</Label>
        <Select value={schoolId} onValueChange={onSchoolChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a school" />
          </SelectTrigger>
          <SelectContent>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((term) => (
              <TableRow key={term.id}>
                <TableCell className="font-medium">{term.name}</TableCell>
                <TableCell>{term.startDate || '—'}</TableCell>
                <TableCell>{term.endDate || '—'}</TableCell>
                <TableCell>{term.isCurrent ? <Badge>Current</Badge> : ''}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(term)}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(term)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {terms.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No terms yet for this school.</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Term' : 'Add Term'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="termName">Name *</Label>
              <Input
                id="termName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., 2026-2027 Fall"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isCurrent}
                onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
              />
              Mark as the current term (clears any other current term for this school)
            </label>
            {formError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
