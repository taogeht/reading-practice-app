'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface User {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'teacher' | 'admin';
  active?: boolean;
  primarySchoolId?: string | null;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface UserFormProps {
  user?: User;
  schools: SchoolOption[];
  onSave: (userData: any) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const DEFAULT_ROLE: User['role'] = 'student';

export default function UserForm({
  user,
  schools,
  onSave,
  onCancel,
  loading = false,
}: UserFormProps) {
  const isEditing = Boolean(user?.id);

  const [formData, setFormData] = useState({
    email: user?.email ?? '',
    password: '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    role: (user?.role ?? DEFAULT_ROLE) as User['role'],
    active: user?.active ?? true,
    schoolId: user?.primarySchoolId ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormData({
      email: user?.email ?? '',
      password: '',
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      role: (user?.role ?? DEFAULT_ROLE) as User['role'],
      active: user?.active ?? true,
      schoolId: user?.primarySchoolId ?? '',
    });
    setErrors({});
  }, [user]);

  useEffect(() => {
    if (formData.role !== 'teacher' && formData.schoolId) {
      setFormData((prev) => ({ ...prev, schoolId: '' }));
    }
  }, [formData.role, formData.schoolId]);

  useEffect(() => {
    if (formData.role === 'teacher' && !formData.schoolId && schools.length > 0) {
      setFormData((prev) => ({ ...prev, schoolId: schools[0].id }));
    }
  }, [formData.role, formData.schoolId, schools]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';

    if (!isEditing && !formData.password) newErrors.password = 'Password is required';
    if (!isEditing && formData.password && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';

    if (formData.role === 'teacher') {
      if (!formData.schoolId) {
        newErrors.schoolId = 'Select a school for this teacher';
      } else if (!schools.some((school) => school.id === formData.schoolId)) {
        newErrors.schoolId = 'Selected school is no longer available';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload = { ...formData };
    if (isEditing && !payload.password) {
      delete payload.password;
    }

    await onSave(payload);
  };

  const disableTeacherSubmission =
    formData.role === 'teacher' && (schools.length === 0 || !formData.schoolId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(event) => handleChange('email', event.target.value)}
          className={errors.email ? 'border-red-500' : ''}
        />
        {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
      </div>

      <div>
        <Label htmlFor="password">
          {isEditing ? 'New Password (leave blank to keep current)' : 'Password'}
        </Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(event) => handleChange('password', event.target.value)}
          className={errors.password ? 'border-red-500' : ''}
        />
        {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
      </div>

      <div>
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={formData.firstName}
          onChange={(event) => handleChange('firstName', event.target.value)}
          className={errors.firstName ? 'border-red-500' : ''}
        />
        {errors.firstName && <p className="text-sm text-red-500 mt-1">{errors.firstName}</p>}
      </div>

      <div>
        <Label htmlFor="lastName">Last Name</Label>
        <Input
          id="lastName"
          value={formData.lastName}
          onChange={(event) => handleChange('lastName', event.target.value)}
          className={errors.lastName ? 'border-red-500' : ''}
        />
        {errors.lastName && <p className="text-sm text-red-500 mt-1">{errors.lastName}</p>}
      </div>

      <div>
        <Label htmlFor="role">Role</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => handleChange('role', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.role === 'teacher' && (
        <div>
          <Label htmlFor="schoolId">School</Label>
          <Select
            value={formData.schoolId}
            onValueChange={(value) => handleChange('schoolId', value)}
            disabled={schools.length === 0}
          >
            <SelectTrigger className={errors.schoolId ? 'border-red-500' : ''}>
              <SelectValue placeholder={schools.length === 0 ? 'No schools available' : 'Select school'} />
            </SelectTrigger>
            <SelectContent>
              {schools.map((school) => (
                <SelectItem key={school.id} value={school.id}>
                  {school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schools.length === 0 && (
            <p className="text-xs text-yellow-600 mt-1">
              Create a school before adding teachers.
            </p>
          )}
          {errors.schoolId && <p className="text-sm text-red-500 mt-1">{errors.schoolId}</p>}
        </div>
      )}

      {isEditing && (
        <div className="flex items-center space-x-2">
          <Switch
            id="active"
            checked={formData.active}
            onCheckedChange={(checked) => handleChange('active', checked)}
          />
          <Label htmlFor="active">Active</Label>
        </div>
      )}

      <div className="flex space-x-2 pt-4">
        <Button type="submit" disabled={loading || disableTeacherSubmission}>
          {loading ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
