"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { WeeklyRecapForm } from "@/components/recap/weekly-recap-form";

export default function WeeklyRecapPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push(`/teacher/classes/${classId}`)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
            Weekly Recap
          </h1>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <WeeklyRecapForm classId={classId} />
      </div>
    </div>
  );
}
