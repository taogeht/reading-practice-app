"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VisualPasswordCreator } from "./visual-password-creator";

interface Class {
  id: string;
  name: string;
}

interface CreateStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedClassId?: string;
}

export function CreateStudentDialog({
  open,
  onOpenChange,
  onSuccess,
  preselectedClassId
}: CreateStudentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    gradeLevel: "",
    readingLevel: "",
    parentEmail: "",
    classId: preselectedClassId || "",
    gender: "girl" as "girl" | "boy",
  });
  const [visualPassword, setVisualPassword] = useState<{type: string; data: any} | null>(null);

  useEffect(() => {
    if (open) {
      fetchClasses();
    }
  }, [open]);

  useEffect(() => {
    if (preselectedClassId) {
      setFormData(prev => ({ ...prev, classId: preselectedClassId }));
    }
  }, [preselectedClassId]);

  const fetchClasses = async () => {
    try {
      const response = await fetch('/api/teacher/classes');
      if (response.ok) {
        const data = await response.json();
        setClasses(data.classes || []);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!visualPassword?.type || !visualPassword?.data) {
      alert('Please create a visual password for the student');
      return;
    }

    if (visualPassword.type === 'animal' && !visualPassword.data.animal) {
      alert('Please select an animal for the visual password');
      return;
    }

    if (visualPassword.type === 'object' && !visualPassword.data.object) {
      alert('Please select an object for the visual password');
      return;
    }

    if (!formData.classId) {
      alert('Please select a class for the student');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/teacher/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          gradeLevel: formData.gradeLevel ? parseInt(formData.gradeLevel) : null,
          readingLevel: formData.readingLevel || null,
          parentEmail: formData.parentEmail || null,
          visualPasswordType: visualPassword.type,
          visualPasswordData: visualPassword.data,
          classId: formData.classId,
          gender: formData.gender,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create student');
      }

      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        gradeLevel: "",
        readingLevel: "",
        parentEmail: "",
        classId: preselectedClassId || "",
        gender: "girl",
      });
      setVisualPassword(null);

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating student:', error);
      alert(error instanceof Error ? error.message : 'Failed to create student');
    } finally {
      setLoading(false);
    }
  };

  const handleVisualPasswordChange = (type: string, data: any) => {
    setVisualPassword({ type, data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Student</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Student's first name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Student's last name"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gradeLevel">Grade Level</Label>
              <Select
                value={formData.gradeLevel}
                onValueChange={(value) => setFormData({ ...formData, gradeLevel: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Kindergarten</SelectItem>
                  <SelectItem value="1">1st Grade</SelectItem>
                  <SelectItem value="2">2nd Grade</SelectItem>
                  <SelectItem value="3">3rd Grade</SelectItem>
                  <SelectItem value="4">4th Grade</SelectItem>
                  <SelectItem value="5">5th Grade</SelectItem>
                  <SelectItem value="6">6th Grade</SelectItem>
                  <SelectItem value="7">7th Grade</SelectItem>
                  <SelectItem value="8">8th Grade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="readingLevel">Reading Level</Label>
              <Input
                id="readingLevel"
                value={formData.readingLevel}
                onChange={(e) => setFormData({ ...formData, readingLevel: e.target.value })}
                placeholder="e.g., 2.5, Beginning, Advanced"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Student Avatar</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={formData.gender === "girl" ? "default" : "outline"}
                onClick={() => setFormData((prev) => ({ ...prev, gender: "girl" }))}
              >
                👧🏼 Girl
              </Button>
              <Button
                type="button"
                variant={formData.gender === "boy" ? "default" : "outline"}
                onClick={() => setFormData((prev) => ({ ...prev, gender: "boy" }))}
              >
                👦🏼 Boy
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parentEmail">Parent Email</Label>
            <Input
              id="parentEmail"
              type="email"
              value={formData.parentEmail}
              onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
              placeholder="parent@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="classId">Assign to Class *</Label>
            <Select
              value={formData.classId}
              onValueChange={(value) => setFormData({ ...formData, classId: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4">
            <VisualPasswordCreator
              onPasswordChange={handleVisualPasswordChange}
              value={visualPassword}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Student"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
