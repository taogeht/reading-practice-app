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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import UserForm from '@/components/admin/user-form';
import { ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'teacher' | 'admin';
  active: boolean;
  createdAt: string;
  updatedAt: string;
  primarySchoolId?: string | null;
  primarySchoolName?: string | null;
}

interface School {
  id: string;
  name: string;
}

interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  parentEmail?: string | null;
  active: boolean;
}

interface ClassStudentGroup {
  id: string;
  name: string;
  active: boolean;
  gradeLevel: number | null;
  teacherName: string | null;
  teacherEmail: string | null;
  studentCount: number;
  students: StudentSummary[];
}

const UNASSIGNED_VALUE = '__unassigned__';

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [classGroups, setClassGroups] = useState<ClassStudentGroup[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<StudentSummary[]>([]);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [managedStudent, setManagedStudent] = useState<(StudentSummary & { currentClassId: string | null }) | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>(UNASSIGNED_VALUE);
  const [classUpdateLoading, setClassUpdateLoading] = useState(false);
  const [classUpdateError, setClassUpdateError] = useState<string | null>(null);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<null | {
    summary: {
      processed: number;
      created: number;
      updated: number;
      skipped: Array<{ email?: string; reason: string }>;
      generatedPasswords: Array<{ email: string; password: string }>;
    };
    generatedPasswords: Array<{ email: string; password: string }>;
    skipped: Array<{ email?: string; reason: string }>;
  }>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [usersRes, schoolsRes, studentsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/schools'),
        fetch('/api/admin/students'),
      ]);

      if (!usersRes.ok) {
        throw new Error('Failed to load users');
      }

      if (!schoolsRes.ok) {
        throw new Error('Failed to load schools');
      }

      if (!studentsRes.ok) {
        throw new Error('Failed to load student assignments');
      }

      const usersData = await usersRes.json();
      const schoolsData = await schoolsRes.json();
      const studentsData = await studentsRes.json();

      setUsers(usersData.users);
      setSchools(
        (schoolsData.schools as School[]).map((school) => ({
          id: school.id,
          name: school.name,
        }))
      );
      const nextClassGroups: ClassStudentGroup[] = (studentsData.classes ?? []).map((cls: any) => {
        const studentsForClass: StudentSummary[] = (cls.students ?? []).map((student: any) => ({
          id: student.id,
          firstName: student.firstName ?? 'Unknown',
          lastName: student.lastName ?? '',
          gradeLevel: student.gradeLevel ?? null,
          readingLevel: student.readingLevel ?? null,
          parentEmail: student.parentEmail ?? null,
          active: Boolean(student.active),
        }));

        return {
          id: cls.id,
          name: cls.name,
          active: Boolean(cls.active),
          gradeLevel: cls.gradeLevel ?? null,
          teacherName: cls.teacherName ?? null,
          teacherEmail: cls.teacherEmail ?? null,
          studentCount: studentsForClass.length,
          students: studentsForClass,
        };
      });

      setClassGroups(nextClassGroups);
      setUnassignedStudents(
        (studentsData.unassignedStudents ?? []).map((student: any) => ({
          id: student.id,
          firstName: student.firstName ?? 'Unknown',
          lastName: student.lastName ?? '',
          gradeLevel: student.gradeLevel ?? null,
          readingLevel: student.readingLevel ?? null,
          parentEmail: student.parentEmail ?? null,
          active: Boolean(student.active),
        })),
      );

      setExpandedClasses((prev) => {
        const validIds = new Set(nextClassGroups.map((cls) => cls.id));
        const next = new Set<string>();
        prev.forEach((id) => {
          if (validIds.has(id)) {
            next.add(id);
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddUser = () => {
    setEditingUser(undefined);
    setIsDialogOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete ${user.firstName} ${user.lastName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete user');
      }

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleSaveUser = async (userData: any) => {
    try {
      setFormLoading(true);

      const payload = { ...userData };
      if (payload.role !== 'teacher') {
        delete payload.schoolId;
      } else {
        payload.schoolId = payload.schoolId || null;
      }

      const url = editingUser ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const method = editingUser ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save user');
      }

      setIsDialogOpen(false);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setFormLoading(false);
    }
  };

  const toggleClassExpansion = (classId: string) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  const openStudentClassDialog = (student: StudentSummary, classId: string | null) => {
    setManagedStudent({ ...student, currentClassId: classId });
    setSelectedClassId(classId ?? UNASSIGNED_VALUE);
    setClassUpdateError(null);
    setStudentDialogOpen(true);
  };

  const closeStudentClassDialog = () => {
    setStudentDialogOpen(false);
    setManagedStudent(null);
    setClassUpdateError(null);
    setSelectedClassId(UNASSIGNED_VALUE);
  };

  const handleStudentClassSave = async () => {
    if (!managedStudent) {
      return;
    }

    try {
      setClassUpdateLoading(true);
      setClassUpdateError(null);

      const targetClassId = selectedClassId === UNASSIGNED_VALUE ? null : selectedClassId;

      const response = await fetch(`/api/admin/students/${managedStudent.id}/class`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ classId: targetClassId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update class assignment');
      }

      await loadData();
      closeStudentClassDialog();
    } catch (error) {
      setClassUpdateError(error instanceof Error ? error.message : 'Failed to update class assignment');
    } finally {
      setClassUpdateLoading(false);
    }
  };

  const groupedUsers = useMemo(() => {
    return {
      admin: users.filter((user) => user.role === 'admin'),
      teacher: users.filter((user) => user.role === 'teacher'),
      student: users.filter((user) => user.role === 'student'),
    } as Record<'admin' | 'teacher' | 'student', User[]>;
  }, [users]);

  const classSelectOptions = useMemo(
    () => classGroups.map((cls) => ({ id: cls.id, name: cls.name })),
    [classGroups],
  );

  const totalStudents = useMemo(
    () => classGroups.reduce((count, cls) => count + cls.students.length, 0) + unassignedStudents.length,
    [classGroups, unassignedStudents],
  );

  const handleExportUsers = async () => {
    try {
      const response = await fetch('/api/admin/users/export');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export users');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export users');
    }
  };

  const handleDownloadTemplate = () => {
    const template = 'email,firstName,lastName,role,active,schoolName,password\n';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'user-import-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleImportUsers = async (file: File) => {
    try {
      setImporting(true);
      setImportResult(null);
      setImportError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/users/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to import users');
      }

      const data = await response.json();
      setImportResult(data);
      await loadData();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import users');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading users...</div>
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

  const renderTable = (role: 'admin' | 'teacher' | 'student', data: User[]) => {
    const showSchool = role === 'teacher';

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              {showSchool && <TableHead>School</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                {showSchool && (
                  <TableCell>{user.primarySchoolName ?? '—'}</TableCell>
                )}
                <TableCell>
                  <Badge variant={user.active ? 'default' : 'secondary'}>
                    {user.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteUser(user)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">No users found.</div>
        )}
      </div>
    );
  };

  const sections: Array<{ role: 'admin' | 'teacher' | 'student'; title: string; description: string }> = [
    {
      role: 'admin',
      title: 'Administrators',
      description: 'Manage system-wide access and configuration.',
    },
    {
      role: 'teacher',
      title: 'Teachers',
      description: 'Assign teachers to schools and oversee classrooms.',
    },
    {
      role: 'student',
      title: 'Students',
      description: 'Monitor student accounts and activity levels.',
    },
  ];

  const nonStudentSections = sections.filter((section) => section.role !== 'student');
  const studentSection = sections.find((section) => section.role === 'student');

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage administrators, teachers, and students across the platform.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportUsers}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={handleAddUser}>Add User</Button>
        </div>
      </div>

      {nonStudentSections.map(({ role, title, description }) => (
        <section key={role} className="mt-8 first:mt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Badge variant="outline">
              {groupedUsers[role].length} {groupedUsers[role].length === 1 ? 'user' : 'users'}
            </Badge>
          </div>
          {renderTable(role, groupedUsers[role])}
        </section>
      ))}

      {studentSection && (
        <section key={studentSection.role} className="mt-8 first:mt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h2 className="text-xl font-semibold">{studentSection.title}</h2>
              <p className="text-sm text-muted-foreground">
                {studentSection.description}
              </p>
            </div>
            <Badge variant="outline">
              {totalStudents} {totalStudents === 1 ? 'student' : 'students'}
            </Badge>
          </div>

          <div className="space-y-4">
            {classGroups.map((classGroup) => {
              const isExpanded = expandedClasses.has(classGroup.id);
              return (
                <Card key={classGroup.id} className="border">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        {classGroup.name}
                        {!classGroup.active && (
                          <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">
                            Inactive
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-sm text-muted-foreground">
                        {classGroup.teacherName ? `Teacher: ${classGroup.teacherName}` : 'No teacher assigned'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {classGroup.studentCount} {classGroup.studentCount === 1 ? 'student' : 'students'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleClassExpansion(classGroup.id)}
                        aria-label={isExpanded ? 'Collapse class students' : 'Expand class students'}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </Button>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent>
                      {classGroup.students.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No students enrolled in this class.</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Grade</TableHead>
                                <TableHead>Reading Level</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {classGroup.students.map((student) => (
                                <TableRow key={student.id}>
                                  <TableCell className="font-medium">
                                    {student.firstName} {student.lastName}
                                  </TableCell>
                                  <TableCell>{student.gradeLevel ?? '—'}</TableCell>
                                  <TableCell>{student.readingLevel ?? '—'}</TableCell>
                                  <TableCell>
                                    <Badge variant={student.active ? 'default' : 'secondary'}>
                                      {student.active ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openStudentClassDialog(student, classGroup.id)}
                                    >
                                      Manage
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="mt-6">
            <Card className="border">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Unassigned Students</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    Students not currently enrolled in a class.
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {unassignedStudents.length}{' '}
                  {unassignedStudents.length === 1 ? 'student' : 'students'}
                </Badge>
              </CardHeader>
              <CardContent>
                {unassignedStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No unassigned students.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Reading Level</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unassignedStudents.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">
                              {student.firstName} {student.lastName}
                            </TableCell>
                            <TableCell>{student.gradeLevel ?? '—'}</TableCell>
                            <TableCell>{student.readingLevel ?? '—'}</TableCell>
                            <TableCell>
                              <Badge variant={student.active ? 'default' : 'secondary'}>
                                {student.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openStudentClassDialog(student, null)}
                              >
                                Assign to Class
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>
          <UserForm
            user={editingUser}
            schools={schools}
            onSave={handleSaveUser}
            onCancel={() => setIsDialogOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={studentDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeStudentClassDialog();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Class Assignment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {managedStudent
                  ? `Manage enrollment for ${managedStudent.firstName} ${managedStudent.lastName}`
                  : 'Select a student to manage their class assignment.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-select">Assign to class</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={classUpdateLoading || !managedStudent}
              >
                <SelectTrigger id="class-select">
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                  {classSelectOptions.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {classUpdateError && (
              <p className="text-sm text-red-500">{classUpdateError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={closeStudentClassDialog}
                disabled={classUpdateLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStudentClassSave}
                disabled={classUpdateLoading || !managedStudent}
              >
                {classUpdateLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isImportDialogOpen}
        onOpenChange={(open) => {
          setIsImportDialogOpen(open);
          if (!open) {
            setImportResult(null);
            setImportError(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import Users from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns <strong>email</strong>, <strong>firstName</strong>,
              <strong> lastName</strong>, role, active, schoolName, password. Password is optional for updates; a
              temporary password will be generated for new users when omitted.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                Download template
              </Button>
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleImportUsers(file);
                        event.target.value = '';
                      }
                    }}
                  />
                  Choose file…
                </label>
              </Button>
            </div>
            {importing && <p className="text-sm">Importing… please wait.</p>}
            {importError && <p className="text-sm text-red-600">{importError}</p>}
            {importResult && (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Import summary</p>
                  <ul className="text-sm text-muted-foreground list-disc pl-4 mt-2 space-y-1">
                    <li>Processed rows: {importResult.summary.processed}</li>
                    <li>Created: {importResult.summary.created}</li>
                    <li>Updated: {importResult.summary.updated}</li>
                    <li>Skipped: {importResult.summary.skipped.length}</li>
                  </ul>
                </div>
                {importResult.generatedPasswords.length > 0 && (
                  <div className="rounded-md border p-3 bg-muted">
                    <p className="text-sm font-medium mb-2">Generated passwords</p>
                    <ul className="text-sm space-y-1">
                      {importResult.generatedPasswords.map((entry) => (
                        <li key={entry.email} className="font-mono">
                          {entry.email}: {entry.password}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      Share these temporary passwords securely with the affected users.
                    </p>
                  </div>
                )}
                {importResult.summary.skipped.length > 0 && (
                  <div className="rounded-md border p-3">
                    <p className="text-sm font-medium">Skipped rows</p>
                    <ul className="text-sm text-muted-foreground list-disc pl-4 mt-2 space-y-1">
                      {importResult.summary.skipped.map((entry, index) => (
                        <li key={`${entry.email ?? 'row'}-${index}`}>
                          {entry.email ? `${entry.email}: ` : ''}{entry.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
