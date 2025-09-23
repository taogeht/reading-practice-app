"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StudentLoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-center min-h-full">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              📚 Reading Practice
            </h1>
            <p className="text-lg text-gray-600">
              Student Login
            </p>
          </div>

          <Card className="border-blue-200">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl font-bold text-primary">
                Ask Your Teacher for Your Class Link
              </CardTitle>
              <p className="text-muted-foreground">
                Students join from a special class page so only classmates appear together.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 text-left">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">How to log in:</h3>
                  <ul className="list-disc list-inside text-blue-700 space-y-1 text-sm sm:text-base">
                    <li>Scan the QR code your teacher shares in class</li>
                    <li>Or click the class link from your teacher</li>
                    <li>Then choose your name and pick your picture password</li>
                  </ul>
                </div>

                <div className="bg-white border border-blue-100 rounded-lg p-4 space-y-3">
                  <p className="font-medium text-gray-700">
                    Have a class code or link?
                  </p>
                  <ClassLinkForm />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <p className="text-sm text-gray-500">
              Are you a teacher? {" "}
              <a href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                Sign in here
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassLinkForm() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const extractClassId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Support pasting full URLs or raw IDs
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split('/').filter(Boolean);
      const idFromUrl = segments.pop();
      if (idFromUrl) {
        return idFromUrl;
      }
    } catch (error) {
      // Not a URL, treat as raw code
    }

    return trimmed;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const classId = extractClassId(inputValue);

    if (!classId) {
      setError('Enter the class link or code from your teacher.');
      return;
    }

    router.push(`/student-login/${classId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <Input
        value={inputValue}
        onChange={(event) => {
          setInputValue(event.target.value);
          if (error) {
            setError("");
          }
        }}
        placeholder="Paste class link or enter code"
        aria-label="Class link or code"
      />
      <Button type="submit" className="sm:w-auto">
        Go to Class Login
      </Button>
      {error && (
        <p className="text-red-600 text-sm sm:mt-0 sm:ml-4">{error}</p>
      )}
    </form>
  );
}
