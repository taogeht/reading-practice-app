'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Loader2, ListChecks, Check } from 'lucide-react';
import type { UnitInfo } from '@/lib/practice/units';

interface ClassPracticeUnitsSectionProps {
  classId: string;
  defaultExpanded?: boolean;
}

export function ClassPracticeUnitsSection({
  classId,
  defaultExpanded = false,
}: ClassPracticeUnitsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [available, setAvailable] = useState<UnitInfo[]>([]);
  const [enabled, setEnabled] = useState<Set<number>>(new Set());
  const [serverEnabled, setServerEnabled] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/teacher/classes/${classId}/practice-units`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load practice units');
        if (cancelled) return;
        setAvailable(data.availableUnits || []);
        setEnabled(new Set<number>(data.units || []));
        setServerEnabled(new Set<number>(data.units || []));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const toggle = (unit: number) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  };

  const dirty =
    enabled.size !== serverEnabled.size ||
    Array.from(enabled).some((u) => !serverEnabled.has(u));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/classes/${classId}/practice-units`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: Array.from(enabled) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');
      setServerEnabled(new Set<number>(data.units || []));
      setEnabled(new Set<number>(data.units || []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`transition-all ${isExpanded ? '' : 'hover:bg-gray-50'}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <ListChecks className="w-5 h-5 text-emerald-500" />
          <div>
            <h3 className="font-medium">Practice Units</h3>
            <p className="text-sm text-gray-500">
              {loading
                ? 'Loading…'
                : serverEnabled.size === 0
                  ? 'No units enabled — students see nothing in their picker'
                  : `${serverEnabled.size} unit${serverEnabled.size === 1 ? '' : 's'} enabled for this class`}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {isExpanded && (
        <CardContent className="pt-0 border-t space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mt-4">
                Tap a unit to turn it on or off for this class. Students only see enabled units in their practice picker.
              </p>
              {available.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No practice units have curriculum yet. Add a curriculum JSON to enable units.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {available.map((u) => {
                    const isOn = enabled.has(u.unit);
                    return (
                      <button
                        key={u.unit}
                        onClick={() => toggle(u.unit)}
                        disabled={saving}
                        className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition ${
                          isOn
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                        }`}
                      >
                        <span className="text-base">{u.emoji}</span>
                        <span>Unit {u.unit}</span>
                        <span className="text-xs text-gray-500 hidden sm:inline">— {u.topic}</span>
                        {isOn && <Check className="w-4 h-4 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEnabled(new Set(serverEnabled))}
                  disabled={!dirty || saving}
                >
                  Reset
                </Button>
                <Button size="sm" onClick={save} disabled={!dirty || saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
