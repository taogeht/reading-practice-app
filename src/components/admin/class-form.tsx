'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface SchoolOption {
  id: string;
  name: string;
}

export interface AdminClassFormValues {
  name: string;
  description: string;
  schoolId: string;
  teacherId: string;
  gradeLevel: string;
  academicYear: string;
  showPracticeStories: boolean;
  active: boolean;
}

interface AdminClassSummary {
  id: string;
  name: string;
  description?: string | null;
  gradeLevel?: number | null;
  academicYear?: string | null;
  showPracticeStories: boolean;
  active: boolean;
  school?: { id: string; name: string } | null;
  teacher?: { id: string; firstName: string; lastName: string; email?: string | null } | null;
}

interface ClassFormProps {
  classItem?: AdminClassSummary;
  teachers: TeacherOption[];
  schools: SchoolOption[];
  onSave: (values: AdminClassFormValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function ClassForm({
  classItem,
  teachers,
  schools,
  onSave,
  onCancel,
  loading = false,
}: ClassFormProps) {
  const teacherOptions = useMemo(() => {
    if (classItem?.teacher && !teachers.some((teacher) => teacher.id === classItem.teacher!.id)) {
      return [
        ...teachers,
        {
          id: classItem.teacher.id,
          firstName: classItem.teacher.firstName,
          lastName: classItem.teacher.lastName,
          email: classItem.teacher.email,
        },
      ];
    }
    return teachers;
  }, [teachers, classItem?.teacher]);

  const schoolOptions = useMemo(() => {
    if (classItem?.school && !schools.some((school) => school.id === classItem.school!.id)) {
      return [
        ...schools,
        {
          id: classItem.school.id,
          name: classItem.school.name,
        },
      ];
    }
    return schools;
  }, [schools, classItem?.school]);

  const [formData, setFormData] = useState<AdminClassFormValues>({
    name: classItem?.name ?? '',
    description: classItem?.description ?? '',
    schoolId: classItem?.school?.id ?? schoolOptions[0]?.id ?? '',
    teacherId: classItem?.teacher?.id ?? teacherOptions[0]?.id ?? '',
    gradeLevel:
      classItem?.gradeLevel !== undefined && classItem?.gradeLevel !== null
        ? String(classItem.gradeLevel)
        : '',
    academicYear: classItem?.academicYear ?? '',
    showPracticeStories: classItem?.showPracticeStories ?? false,
    active: classItem?.active ?? true,
  });

  useEffect(() => {
    setFormData({
      name: classItem?.name ?? '',
      description: classItem?.description ?? '',
      schoolId: classItem?.school?.id ?? schoolOptions[0]?.id ?? '',
      teacherId: classItem?.teacher?.id ?? teacherOptions[0]?.id ?? '',
      gradeLevel:
        classItem?.gradeLevel !== undefined && classItem?.gradeLevel !== null
          ? String(classItem.gradeLevel)
          : '',
      academicYear: classItem?.academicYear ?? '',
      showPracticeStories: classItem?.showPracticeStories ?? false,
      active: classItem?.active ?? true,
    });
  }, [classItem, teacherOptions, schoolOptions]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = <K extends keyof AdminClassFormValues>(key: K, value: AdminClassFormValues[K]) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
    if (errors[key]) {
      setErrors((prev) => ({
        ...prev,
        [key]: '',
      }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      validationErrors.name = 'Class name is required';
    }

    if (!formData.schoolId) {
      validationErrors.schoolId = 'Select a school';
    }

    if (!formData.teacherId) {
      validationErrors.teacherId = 'Select a teacher';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    await onSave({
      ...formData,
      name: formData.name.trim(),
      description: formData.description.trim(),
      gradeLevel: formData.gradeLevel.trim(),
      academicYear: formData.academicYear.trim(),
    });
  };

  const disableSave = loading || teacherOptions.length === 0 || schoolOptions.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="class-name">Class Name</Label>
        <Input
          id="class-name"
          value={formData.name}
          onChange={(event) => handleChange('name', event.target.value)}
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div>
        <Label htmlFor="class-description">Description</Label>
        <textarea
          id="class-description"
          value={formData.description}
          onChange={(event) => handleChange('description', event.target.value)}
          className="w-full min-h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe the class focus or notes"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>School</Label>
          <Select
            value={formData.schoolId}
            onValueChange={(value) => handleChange('schoolId', value)}
            disabled={schoolOptions.length === 0}
          >
            <SelectTrigger className={errors.schoolId ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select a school" />
            </SelectTrigger>
            <SelectContent>
              {schoolOptions.map((school) => (
                <SelectItem key={school.id} value={school.id}>
                  {school.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schoolOptions.length === 0 && (
            <p className="text-xs text-yellow-600 mt-1">
              Create a school before adding classes.
            </p>
          )}
          {errors.schoolId && (
            <p className="text-sm text-red-500 mt-1">{errors.schoolId}</p>
          )}
        </div>

        <div>
          <Label>Teacher</Label>
          <Select
            value={formData.teacherId}
            onValueChange={(value) => handleChange('teacherId', value)}
            disabled={teacherOptions.length === 0}
          >
            <SelectTrigger className={errors.teacherId ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select a teacher" />
            </SelectTrigger>
            <SelectContent>
              {teacherOptions.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.firstName} {teacher.lastName}
                  {teacher.email ? ` (${teacher.email})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {teacherOptions.length === 0 && (
            <p className="text-xs text-yellow-600 mt-1">
              Create an active teacher account first.
            </p>
          )}
          {errors.teacherId && (
            <p className="text-sm text-red-500 mt-1">{errors.teacherId}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="grade-level">Grade Level</Label>
          <Input
            id="grade-level"
            type="number"
            min={0}
            value={formData.gradeLevel}
            onChange={(event) => handleChange('gradeLevel', event.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="academic-year">Academic Year</Label>
          <Input
            id="academic-year"
            value={formData.academicYear}
            onChange={(event) => handleChange('academicYear', event.target.value)}
            placeholder="e.g., 2024-2025"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="show-practice-stories"
            checked={formData.showPracticeStories}
            onCheckedChange={(checked) => handleChange('showPracticeStories', checked)}
          />
          <Label htmlFor="show-practice-stories">Allow practice stories</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="class-active"
            checked={formData.active}
            onCheckedChange={(checked) => handleChange('active', checked)}
          />
          <Label htmlFor="class-active">Active</Label>
        </div>
      </div>

      <div className="flex flex-col space-y-2">
        <div className="flex gap-2">
          <Button type="submit" disabled={disableSave}>
            {loading ? 'Saving…' : classItem ? 'Update Class' : 'Create Class'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {disableSave && (teacherOptions.length === 0 || schoolOptions.length === 0) && (
          <p className="text-xs text-muted-foreground">
            Add at least one school and teacher before creating classes.
          </p>
        )}
      </div>
    </form>
  );
}
