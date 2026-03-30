"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, BookOpen, GraduationCap, Mail, Building, ExternalLink, Save } from "lucide-react";
import { TeacherMediaSection } from "@/components/student-media/teacher-media-section";

interface StudentClass {
  id: string;
  name: string;
  description: string | null;
  showPracticeStories: boolean;
  active: boolean;
  enrolledAt: string;
}

interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: number | null;
  readingLevel: string | null;
  parentEmail: string | null;
  visualPasswordType: string | null;
  visualPasswordData: any;
  avatarUrl?: string | null;
  oupEmail?: string | null;
  oupPassword?: string | null;
  classes: StudentClass[];
}

export default function TeacherStudentProfilePage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params?.studentId as string | undefined;

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oupEmail, setOupEmail] = useState("");
  const [oupPassword, setOupPassword] = useState("");
  const [oupSaving, setOupSaving] = useState(false);
  const [oupSaved, setOupSaved] = useState(false);

  useEffect(() => {
    if (!studentId) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/teacher/students/${studentId}`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load student profile");
        }
        const data = await response.json();
        setProfile(data.student);
        setOupEmail(data.student.oupEmail || "");
        setOupPassword(data.student.oupPassword || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load student profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading student profile...
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <p className="text-red-600 mb-4">{error || "Student profile not found"}</p>
        <Button onClick={() => router.push('/teacher/classes')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Classes
        </Button>
      </div>
    );
  }

  const visualPasswordDescription = (() => {
    const data = profile.visualPasswordData;
    switch (profile.visualPasswordType) {
      case "animal":
        return data?.animal ? `Animal password: ${data.animal}` : "Animal password";
      case "object":
        return data?.object ? `Picture password: ${data.object}` : "Picture password";
      default:
        return "Visual password not set";
    }
  })();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {profile.firstName} {profile.lastName}
              </h1>
              <p className="text-sm text-gray-600">Student Profile</p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 flex flex-col sm:flex-row gap-6">
            <Avatar className="w-24 h-24">
              <AvatarFallback className="text-4xl">
                {profile.avatarUrl || '👧🏼'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-2">
                {profile.gradeLevel !== null && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <GraduationCap className="w-3 h-3" /> Grade {profile.gradeLevel}
                  </Badge>
                )}
                {profile.readingLevel && (
                  <Badge variant="outline">Reading Level: {profile.readingLevel}</Badge>
                )}
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>{visualPasswordDescription}</span>
                </div>
                {profile.parentEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <span>{profile.parentEmail}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OUP Online Practice Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-blue-600" />
              Online Practice Login
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Set the student's credentials for Oxford Online Practice. They'll see a "Login to Online Practice" button on their dashboard.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="oupEmail">Email</Label>
                <Input
                  id="oupEmail"
                  type="text"
                  placeholder="student@school.com.tw"
                  value={oupEmail}
                  onChange={(e) => { setOupEmail(e.target.value); setOupSaved(false); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oupPassword">Password</Label>
                <Input
                  id="oupPassword"
                  type="text"
                  placeholder="1060614"
                  value={oupPassword}
                  onChange={(e) => { setOupPassword(e.target.value); setOupSaved(false); }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={async () => {
                  setOupSaving(true);
                  try {
                    const res = await fetch(`/api/teacher/students/${studentId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ oupEmail, oupPassword }),
                    });
                    if (res.ok) {
                      setOupSaved(true);
                      setTimeout(() => setOupSaved(false), 3000);
                    }
                  } catch (err) {
                    console.error("Failed to save OUP credentials:", err);
                  } finally {
                    setOupSaving(false);
                  }
                }}
                disabled={oupSaving}
                size="sm"
              >
                {oupSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
              {oupSaved && (
                <span className="text-sm text-green-600 font-medium">Saved!</span>
              )}
            </div>
          </CardContent>
        </Card>

        {studentId && <TeacherMediaSection studentId={studentId} />}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              Class Enrollments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.classes.length === 0 ? (
              <p className="text-sm text-gray-600">This student is not enrolled in any classes.</p>
            ) : (
              <div className="grid gap-3">
                {profile.classes.map((cls) => (
                  <div key={cls.id} className="border rounded-lg p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{cls.name}</h3>
                      <p className="text-sm text-gray-600">
                        Enrolled {new Date(cls.enrolledAt).toLocaleDateString()}{" "}
                        {cls.description && `• ${cls.description}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cls.active ? 'default' : 'secondary'}>
                        {cls.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {cls.showPracticeStories && <Badge variant="outline">Practice Stories</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
