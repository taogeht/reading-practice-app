"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft } from "lucide-react";
import { getVisualPasswordOptions, AVATARS } from "./visual-password-options";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  visualPasswordType: 'animal' | 'object' | 'color_shape';
  visualPasswordData: any;
}

interface VisualPasswordInputProps {
  student: Student;
  onBack: () => void;
  onSuccess: (visualPassword: string) => void;
}

export function VisualPasswordInput({ student, onBack, onSuccess }: VisualPasswordInputProps) {
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  const options = getVisualPasswordOptions(student.visualPasswordType);
  const correctAnswer = getCorrectAnswer(student.visualPasswordData, student.visualPasswordType);

  function getCorrectAnswer(passwordData: any, type: string): string {
    switch (type) {
      case 'animal':
        return passwordData.animal;
      case 'object':
        return passwordData.object;
      case 'color_shape':
        return `${passwordData.color}-${passwordData.shape}`;
      default:
        return '';
    }
  }

  const handleOptionSelect = (optionId: string) => {
    if (attempts >= maxAttempts) {
      return;
    }

    setSelectedOption(optionId);
    setError("");

    if (optionId === correctAnswer) {
      onSuccess(optionId);
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setSelectedOption("");

    if (nextAttempts >= maxAttempts) {
      setError(`Too many incorrect attempts. Please ask your teacher for help.`);
    } else {
      setError(`That's not right. Try again! (${maxAttempts - nextAttempts} attempts left)`);
    }
  };

  const getPromptText = () => {
    switch (student.visualPasswordType) {
      case 'animal':
        return "Which animal is your password?";
      case 'object':
        return "Which object is your password?";
      case 'color_shape':
        return "Which color and shape is your password?";
      default:
        return "Select your password:";
    }
  };

  if (attempts >= maxAttempts) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-red-600">
            Too Many Attempts
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Please ask your teacher to help you log in.
          </p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Choose Different Student
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center mb-4">
          <Avatar className="w-20 h-20">
            <AvatarFallback className="text-3xl">
              {student.avatarUrl || AVATARS[0].emoji}
            </AvatarFallback>
          </Avatar>
        </div>
        <CardTitle className="text-xl font-bold text-primary">
          Hi {student.firstName}!
        </CardTitle>
        <p className="text-muted-foreground text-lg">
          {getPromptText()}
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4 mb-6">
          {options.map((option) => (
            <Button
              key={option.id}
              variant={selectedOption === option.id ? "default" : "outline"}
              className="p-4 h-auto aspect-square hover:scale-105 transition-transform"
              onClick={() => handleOptionSelect(option.id)}
              disabled={attempts >= maxAttempts}
            >
              <div className="text-center">
                <div className="text-4xl mb-2">{option.emoji}</div>
                <div className="text-xs font-medium">{option.name}</div>
              </div>
            </Button>
          ))}
        </div>

        {error && (
          <div className="text-center text-red-600 bg-red-50 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-between">
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
