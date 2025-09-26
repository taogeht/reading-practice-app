'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ClassForm, {
  AdminClassFormValues,
  AdminClassSummary,
} from '@/components/admin/class-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  active: boolean;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface ClassesResponse {
  classes: Array<AdminClassSummary & { studentCount: number }>;
}

interface UsersResponse {
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    role: 'student' | 'teacher' | 'admin';
    active: boolean;
  }>;
}

const ACADEMIC_YEAR_REGEX = /^(\d{4})[-/](\d{4})$/;

function parseAcademicYearStart(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const match = value.match(ACADEMIC_YEAR_REGEX);
  if (!match) return Number.NEGATIVE_INFINITY;
  return Number.parseInt(match[1]!, 10);
}

function getNextAcademicYear(value: string): string | null {
  const match = value.match(ACADEMIC_YEAR_REGEX);
  if (!match) return null;
  const start = Number.parseInt(match[1]!, 10);
  return `${start + 1}-${start + 2}`;
}

function formatGradeLabel(gradeLevel: number | null | undefined): string {
  if (gradeLevel === null || gradeLevel === undefined) {
    return '—';
  }
  if (gradeLevel === 0) {
    return 'Kindergarten';
  }
  const suffix = gradeLevel === 1 ? 'st' : gradeLevel === 2 ? 'nd' : gradeLevel === 3 ? 'rd' : 'th';
  return `${gradeLevel}${suffix} Grade`;
}

interface SchoolsResponse {
  schools: Array<{
    id: string;
    name: string;
  }>;
}

export default function ClassManagementPage() {
  const [classes, setClasses] = useState<Array<AdminClassSummary & { studentCount: number }>>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<AdminClassSummary & { studentCount: number } | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [rolloverDialogOpen, setRolloverDialogOpen] = useState(false);
  const [rolloverForm, setRolloverForm] = useState({
    fromAcademicYear: '',
    toAcademicYear: '',
    includeInactive: false,
    deactivateSource: true,
  });
  const [rolloverLoading, setRolloverLoading] = useState(false);
  const [rolloverError, setRolloverError] = useState<string | null>(null);
  const [rolloverSummary, setRolloverSummary] = useState<{ created: number; skipped: number; message?: string } | null>(null);
  const [rolloverDetails, setRolloverDetails] = useState<{
    created: Array<{ id: string; name: string; academicYear: string }>;
    skipped: Array<{ id: string; name: string; reason: string }>;
    targetAcademicYear?: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [classesRes, teachersRes, schoolsRes] = await Promise.all([
        fetch('/api/admin/classes'),
        fetch('/api/admin/users?role=teacher&active=true'),
        fetch('/api/admin/schools'),
      ]);

      if (!classesRes.ok) {
        throw new Error('Failed to load classes');
      }
      if (!teachersRes.ok) {
        throw new Error('Failed to load teachers');
      }
      if (!schoolsRes.ok) {
        throw new Error('Failed to load schools');
      }

      const classesData = (await classesRes.json()) as ClassesResponse;
      const teachersData = (await teachersRes.json()) as UsersResponse;
      const schoolsData = (await schoolsRes.json()) as SchoolsResponse;

      setClasses(classesData.classes);
      setTeachers(
        teachersData.users
          .filter((user) => user.role === 'teacher')
          .map((teacher) => ({
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email,
            active: teacher.active,
          }))
      );
      setSchools(
        schoolsData.schools.map((school) => ({
          id: school.id,
          name: school.name,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddClass = () => {
    setEditingClass(undefined);
    setIsDialogOpen(true);
  };

  const handleEditClass = (classItem: AdminClassSummary & { studentCount: number }) => {
    setEditingClass(classItem);
    setIsDialogOpen(true);
  };

  const handleDeleteClass = async (classItem: AdminClassSummary) => {
    if (!confirm(`Delete class "${classItem.name}"? This removes enrollments.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/classes/${classItem.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete class');
      }

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete class');
    }
  };

  const handleSaveClass = async (values: AdminClassFormValues) => {
    try {
      setFormLoading(true);

      const payload = {
        name: values.name,
        description: values.description,
        schoolId: values.schoolId,
        teacherId: values.teacherId,
        gradeLevel:
          values.gradeLevel.trim() !== '' ? Number(values.gradeLevel) : null,
        academicYear: values.academicYear,
        showPracticeStories: values.showPracticeStories,
        active: values.active,
      };

      if (payload.gradeLevel !== null && Number.isNaN(payload.gradeLevel)) {
        throw new Error('Grade level must be a number');
      }

      const requestInit: RequestInit = {
        method: editingClass ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      };

      const endpoint = editingClass
        ? `/api/admin/classes/${editingClass.id}`
        : '/api/admin/classes';

      const response = await fetch(endpoint, requestInit);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save class');
      }

      setIsDialogOpen(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setFormLoading(false);
    }
  };

  const handleExecuteRollover = async () => {
    if (!rolloverForm.fromAcademicYear) {
      setRolloverError('Select the academic year to rollover from.');
      return;
    }

    if (
      rolloverForm.toAcademicYear &&
      !ACADEMIC_YEAR_REGEX.test(rolloverForm.toAcademicYear.trim())
    ) {
      setRolloverError('To academic year must be in format YYYY-YYYY.');
      return;
    }

    setRolloverLoading(true);
    setRolloverError(null);
    setRolloverSummary(null);
    setRolloverDetails(null);

    try {
      const response = await fetch('/api/admin/classes/rollover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromAcademicYear: rolloverForm.fromAcademicYear,
          toAcademicYear: rolloverForm.toAcademicYear
            ? rolloverForm.toAcademicYear.trim()
            : undefined,
          includeInactive: rolloverForm.includeInactive,
          deactivateSource: rolloverForm.deactivateSource,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Rollover failed');
      }

      setRolloverSummary({
        created: data.created?.length ?? 0,
        skipped: data.skipped?.length ?? 0,
        message: data.message,
      });
      setRolloverDetails({
        created: data.created ?? [],
        skipped: data.skipped ?? [],
        targetAcademicYear: data.targetAcademicYear,
      });

      if (data.targetAcademicYear) {
        setSelectedYear(data.targetAcademicYear);
        setRolloverForm((prev) => ({
          ...prev,
          toAcademicYear: data.targetAcademicYear,
        }));
      }

      await loadData();
    } catch (err) {
      setRolloverError(err instanceof Error ? err.message : 'Failed to rollover classes');
    } finally {
      setRolloverLoading(false);
    }
  };

  const academicYears = useMemo(() => {
    const years = Array.from(
      new Set(
        classes
          .map((cls) => cls.academicYear)
          .filter((year): year is string => Boolean(year)),
      ),
    );
    years.sort((a, b) => parseAcademicYearStart(b) - parseAcademicYearStart(a));
    return years;
  }, [classes]);

  useEffect(() => {
    if (academicYears.length === 0) {
      setSelectedYear('all');
      setRolloverForm((prev) => ({
        ...prev,
        fromAcademicYear: '',
        toAcademicYear: '',
      }));
      return;
    }

    setSelectedYear((prev) => {
      if (prev === 'all') {
        return prev;
      }
      if (academicYears.includes(prev)) {
        return prev;
      }
      return academicYears[0]!;
    });
  }, [academicYears]);

  useEffect(() => {
    if (selectedYear === 'all') {
      if (academicYears.length === 0) {
        setRolloverForm((prev) => ({
          ...prev,
          fromAcademicYear: '',
          toAcademicYear: '',
        }));
      } else {
        const defaultYear = academicYears[0]!;
        setRolloverForm((prev) => ({
          ...prev,
          fromAcademicYear: defaultYear,
          toAcademicYear: getNextAcademicYear(defaultYear) ?? prev.toAcademicYear,
        }));
      }
      return;
    }

    setRolloverForm((prev) => ({
      ...prev,
      fromAcademicYear: selectedYear,
      toAcademicYear: getNextAcademicYear(selectedYear) ?? prev.toAcademicYear,
    }));
  }, [selectedYear, academicYears]);

  const filteredClasses = useMemo(() => {
    if (selectedYear === 'all') {
      return classes;
    }
    return classes.filter((cls) => cls.academicYear === selectedYear);
  }, [classes, selectedYear]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading classes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        Error: {error}
        <Button className="ml-4" onClick={loadData}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Class Management</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, and archive classes across schools.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Select
            value={selectedYear}
            onValueChange={(value) => setSelectedYear(value)}
            disabled={academicYears.length === 0}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by academic year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All academic years</SelectItem>
              {academicYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              if (academicYears.length > 0) {
                const baseYear = selectedYear !== 'all'
                  ? selectedYear
                  : rolloverForm.fromAcademicYear || academicYears[0]!;
                setRolloverForm((prev) => ({
                  ...prev,
                  fromAcademicYear: baseYear,
                  toAcademicYear: prev.toAcademicYear || getNextAcademicYear(baseYear) || '',
                }));
              }
              setRolloverError(null);
              setRolloverSummary(null);
              setRolloverDetails(null);
              setRolloverDialogOpen(true);
            }}
            disabled={academicYears.length === 0}
          >
            Rollover Classes
          </Button>
          <Button onClick={handleAddClass}>Add Class</Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Rollover From</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Practice Stories</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClasses.map((classItem) => {
              const teacher = classItem.teacher;
              const gradeLabel = formatGradeLabel(classItem.gradeLevel ?? null);
              const rolloverFromLabel = classItem.rolloverFrom
                ? `${classItem.rolloverFrom.name}${classItem.rolloverFrom.academicYear ? ` (${classItem.rolloverFrom.academicYear})` : ''}`
                : '—';
              return (
                <TableRow key={classItem.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{classItem.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {teacher ? (
                      <div className="flex flex-col">
                        <span>
                          {teacher.firstName} {teacher.lastName}
                        </span>
                        {teacher.email && (
                          <span className="text-xs text-muted-foreground">
                            {teacher.email}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>{classItem.school?.name ?? '—'}</TableCell>
                  <TableCell>{gradeLabel}</TableCell>
                  <TableCell>{classItem.academicYear ?? '—'}</TableCell>
                  <TableCell>{rolloverFromLabel}</TableCell>
                  <TableCell>{classItem.studentCount}</TableCell>
                  <TableCell>
                    <Badge variant={classItem.showPracticeStories ? 'default' : 'secondary'}>
                      {classItem.showPracticeStories ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={classItem.active ? 'default' : 'secondary'}>
                      {classItem.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClass(classItem)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteClass(classItem)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredClasses.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {selectedYear === 'all'
              ? 'No classes found.'
              : `No classes found for ${selectedYear}.`}
          </p>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Edit Class' : 'Add Class'}</DialogTitle>
          </DialogHeader>
          <ClassForm
            classItem={editingClass}
            teachers={teachers.map(({ id, firstName, lastName, email }) => ({
              id,
              firstName,
              lastName,
              email,
            }))}
            schools={schools}
            onSave={handleSaveClass}
            onCancel={() => setIsDialogOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={rolloverDialogOpen}
        onOpenChange={(open) => {
          setRolloverDialogOpen(open);
          if (!open) {
            setRolloverError(null);
            setRolloverSummary(null);
            setRolloverDetails(null);
            setRolloverLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rollover Classes</DialogTitle>
            <DialogDescription>
              Create new classes for the next academic year and promote existing students.
            </DialogDescription>
          </DialogHeader>
          {academicYears.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No academic years found. Add classes before running a rollover.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Academic Year</Label>
                  <Select
                    value={rolloverForm.fromAcademicYear}
                    onValueChange={(value) => {
                      setRolloverForm((prev) => ({
                        ...prev,
                        fromAcademicYear: value,
                        toAcademicYear: getNextAcademicYear(value) ?? prev.toAcademicYear,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
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
                  <Label>To Academic Year</Label>
                  <Input
                    value={rolloverForm.toAcademicYear}
                    onChange={(event) => setRolloverForm((prev) => ({
                      ...prev,
                      toAcademicYear: event.target.value,
                    }))}
                    placeholder="e.g., 2026-2027"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="include-inactive-classes"
                    checked={rolloverForm.includeInactive}
                    onCheckedChange={(checked) =>
                      setRolloverForm((prev) => ({ ...prev, includeInactive: checked }))
                    }
                  />
                  <Label htmlFor="include-inactive-classes" className="text-sm">
                    Include inactive classes
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="deactivate-source-classes"
                    checked={rolloverForm.deactivateSource}
                    onCheckedChange={(checked) =>
                      setRolloverForm((prev) => ({ ...prev, deactivateSource: checked }))
                    }
                  />
                  <Label htmlFor="deactivate-source-classes" className="text-sm">
                    Deactivate source classes after rollover
                  </Label>
                </div>
              </div>

              {rolloverError && (
                <p className="text-sm text-red-600">{rolloverError}</p>
              )}

              {rolloverSummary && (
                <div className="space-y-2 rounded-md border border-muted p-3 text-sm">
                  <p className="font-medium text-muted-foreground">
                    {rolloverSummary.message ?? 'Rollover completed'}
                  </p>
                  <p>
                    <span className="font-semibold">{rolloverSummary.created}</span> classes created,
                    <span className="font-semibold"> {rolloverSummary.skipped}</span> skipped.
                  </p>
                  {rolloverDetails && rolloverDetails.targetAcademicYear && (
                    <p>Target academic year: {rolloverDetails.targetAcademicYear}</p>
                  )}
                  {rolloverDetails && rolloverDetails.created.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold">Created:</p>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        {rolloverDetails.created.map((item) => (
                          <li key={item.id}>
                            {item.name} ({item.academicYear})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rolloverDetails && rolloverDetails.skipped.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold">Skipped:</p>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        {rolloverDetails.skipped.map((item) => (
                          <li key={item.id}>
                            {item.name} – {item.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRolloverDialogOpen(false);
                  }}
                  disabled={rolloverLoading}
                >
                  Close
                </Button>
                <Button
                  onClick={handleExecuteRollover}
                  disabled={rolloverLoading || !rolloverForm.fromAcademicYear}
                >
                  {rolloverLoading ? 'Running…' : 'Run Rollover'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
