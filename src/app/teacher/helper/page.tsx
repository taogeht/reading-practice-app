'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import HomeworkHelper from '@/components/homework-helper/homework-helper';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { UNITS } from '@/lib/practice/units';

export default function TeacherHelperPreviewPage() {
  const router = useRouter();
  const [unit, setUnit] = useState(1);
  // Remount the helper on unit change so it fetches the new context
  const [key, setKey] = useState(0);

  const pickUnit = (u: number) => {
    setUnit(u);
    setKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push('/teacher/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sunny Helper Preview</h1>
            <p className="text-sm text-gray-600">
              Teacher-only sandbox to see what students would experience.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pretend I'm a student studying...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {UNITS.map((u) => (
                <button
                  key={u.unit}
                  onClick={() => pickUnit(u.unit)}
                  className={`text-left rounded-lg p-3 border-2 transition ${
                    unit === u.unit
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 bg-white hover:border-amber-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    Unit {u.unit}
                  </div>
                  <div className="text-sm font-bold text-gray-900">{u.topic}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <HomeworkHelper key={key} teacherUnit={unit} />
      </div>
    </div>
  );
}
