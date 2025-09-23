'use client';

import { useEffect, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ClassForm, {
  AdminClassFormValues,
  AdminClassSummary,
} from '@/components/admin/class-form';

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Class Management</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit, and archive classes across schools.
          </p>
        </div>
        <Button onClick={handleAddClass}>Add Class</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Students</TableHead>
              <TableHead>Practice Stories</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {classes.map((classItem) => {
              const teacher = classItem.teacher;

              return (
                <TableRow key={classItem.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{classItem.name}</span>
                      {classItem.academicYear && (
                        <span className="text-xs text-muted-foreground">
                          {classItem.academicYear}
                        </span>
                      )}
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
                  <TableCell>
                    {classItem.gradeLevel !== null && classItem.gradeLevel !== undefined
                      ? `Grade ${classItem.gradeLevel}`
                      : '—'}
                  </TableCell>
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

      {classes.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No classes found.</p>
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
    </div>
  );
}
