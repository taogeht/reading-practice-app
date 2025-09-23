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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import UserForm from '@/components/admin/user-form';

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

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [usersRes, schoolsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/schools'),
      ]);

      if (!usersRes.ok) {
        throw new Error('Failed to load users');
      }

      if (!schoolsRes.ok) {
        throw new Error('Failed to load schools');
      }

      const usersData = await usersRes.json();
      const schoolsData = await schoolsRes.json();

      setUsers(usersData.users);
      setSchools(
        (schoolsData.schools as School[]).map((school) => ({
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

  const groupedUsers = useMemo(() => {
    return {
      admin: users.filter((user) => user.role === 'admin'),
      teacher: users.filter((user) => user.role === 'teacher'),
      student: users.filter((user) => user.role === 'student'),
    } as Record<'admin' | 'teacher' | 'student', User[]>;
  }, [users]);

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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage administrators, teachers, and students across the platform.
          </p>
        </div>
        <Button onClick={handleAddUser}>Add User</Button>
      </div>

      {sections.map(({ role, title, description }) => (
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
    </div>
  );
}
