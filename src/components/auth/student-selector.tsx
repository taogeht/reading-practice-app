"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AVATARS } from "./visual-password-options";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  visualPasswordType: 'animal' | 'object' | 'color_shape';
  visualPasswordData: any;
}

interface StudentSelectorProps {
  onStudentSelect: (student: Student) => void;
  classId?: string; // Optional class ID to filter students
}

export function StudentSelector({ onStudentSelect, classId }: StudentSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        // Use class-specific endpoint if classId is provided
        const endpoint = classId ? `/api/classes/${classId}/students` : '/api/students';
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          setStudents(data.students);
        } else {
          console.error('Failed to fetch students');
        }
      } catch (error) {
        console.error('Error fetching students:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [classId]);

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="p-8">
          <div className="text-center">Loading students...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-primary">
          Choose Your Name
        </CardTitle>
        <p className="text-muted-foreground text-lg">
          Click on your name to continue
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {students.map((student, index) => (
            <Button
              key={student.id}
              variant="outline"
              className="p-6 h-auto hover:bg-primary/5 hover:border-primary transition-colors"
              onClick={() => onStudentSelect(student)}
            >
              <div className="flex items-center space-x-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="text-2xl">
                    {student.avatarUrl || AVATARS[index % AVATARS.length].emoji}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <div className="font-semibold text-lg">
                    {student.firstName}
                  </div>
                  <div className="text-muted-foreground">
                    {student.lastName}
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
