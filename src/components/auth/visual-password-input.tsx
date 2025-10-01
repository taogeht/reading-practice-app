"use client";

import { useEffect, useState } from "react";
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
  visualPasswordType: 'animal' | 'object';
}

interface VisualPasswordInputProps {
  student: Student;
  onBack?: () => void;
  onAttempt: (visualPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export function VisualPasswordInput({ student, onBack, onAttempt }: VisualPasswordInputProps) {
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [error, setError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 30_000;

  const options = getVisualPasswordOptions(student.visualPasswordType);

  const isLocked = lockedUntil !== null && lockedUntil > Date.now();

  useEffect(() => {
    if (!lockedUntil) {
      setLockCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = lockedUntil - Date.now();
      if (remainingMs <= 0) {
        setLockedUntil(null);
        setLockCountdown(0);
        setFailedAttempts(0);
        setError("");
      } else {
        setLockCountdown(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [lockedUntil]);

  const handleOptionSelect = async (optionId: string) => {
    if (isLocked || isSubmitting || isSuccess) {
      return;
    }

    setSelectedOption(optionId);
    setError("");
    setIsSubmitting(true);

    try {
      const result = await onAttempt(optionId);

      if (result.success) {
        setIsSuccess(true);
        return;
      }

      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setSelectedOption("");

      if (nextAttempts >= MAX_ATTEMPTS) {
        const lockUntil = Date.now() + LOCK_DURATION_MS;
        setLockedUntil(lockUntil);
        setLockCountdown(Math.ceil(LOCK_DURATION_MS / 1000));
        setError('Let’s take a short break and try again in a moment.');
      } else {
        setError(
          result.error ||
            `That's not right. Try again! (${MAX_ATTEMPTS - nextAttempts} attempts left)`
        );
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setSelectedOption("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPromptText = () => {
    switch (student.visualPasswordType) {
      case 'animal':
        return "Which animal is your password?";
      case 'object':
        return "Which object is your password?";
      default:
        return "Select your password:";
    }
  };

  if (isLocked) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-red-600">
            Let's Try Again Soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Please wait {lockCountdown} second{lockCountdown === 1 ? '' : 's'} before trying again.
          </p>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Choose Different Student
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isSuccess) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold text-primary">
            Nice work {student.firstName}!
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Hang tight while we log you in…
          </p>
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
              disabled={isLocked || isSubmitting}
            >
              <div className="text-center">
                <div className="text-4xl mb-2">
                  {option.emoji}
                </div>
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
          {onBack && (
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
