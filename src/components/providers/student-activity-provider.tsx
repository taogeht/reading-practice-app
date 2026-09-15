'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export type ActivityType = 'reading' | 'spelling' | 'assignment' | 'practice' | 'general';

export interface ActivityContextState {
  activityType?: ActivityType;
  contextLabel?: string;
}

interface StudentActivityContextValue {
  setActivityContext: (context: ActivityContextState | null) => void;
  currentContext: ActivityContextState | null;
}

const StudentActivityContext = createContext<StudentActivityContextValue | null>(null);

const HEARTBEAT_INTERVAL_MS = 60_000;
const ACTIVITY_WINDOW_MS = 90_000;

const ACTIVITY_EVENTS = [
  'mousemove',
  'click',
  'keydown',
  'touchstart',
  'wheel',
  'scroll',
  'pointerdown',
] as const;

function inferActivityFromUrl(pathname: string, searchParams: URLSearchParams | null): {
  activityType: ActivityType;
  contextLabel: string;
} {
  if (pathname.startsWith('/student/reading')) {
    return { activityType: 'reading', contextLabel: 'Reading Library' };
  }
  if (pathname.startsWith('/student/assignments')) {
    return { activityType: 'assignment', contextLabel: 'Assignment Practice' };
  }
  if (pathname.startsWith('/student/stuff')) {
    return { activityType: 'general', contextLabel: 'Avatar & Profile' };
  }
  if (pathname.startsWith('/student/dashboard')) {
    const tab = searchParams?.get('tab') || 'home';
    if (tab === 'spelling') return { activityType: 'spelling', contextLabel: 'Spelling Games' };
    if (tab === 'stories') return { activityType: 'reading', contextLabel: 'Reading Passages' };
    if (tab === 'practice') return { activityType: 'practice', contextLabel: 'Grammar Practice' };
    return { activityType: 'general', contextLabel: 'Dashboard' };
  }
  return { activityType: 'general', contextLabel: 'Student App' };
}

export function StudentActivityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const [explicitContext, setExplicitContext] = useState<ActivityContextState | null>(null);
  const [, startTransition] = useTransition();

  const explicitContextRef = useRef(explicitContext);
  useEffect(() => {
    explicitContextRef.current = explicitContext;
  }, [explicitContext]);

  const lastInputAtRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setActivityContext = useCallback((ctx: ActivityContextState | null) => {
    startTransition(() => {
      setExplicitContext(ctx);
    });
  }, []);

  const sendHeartbeat = useCallback(() => {
    const currentExplicit = explicitContextRef.current;
    const inferred = inferActivityFromUrl(pathname, searchParams);

    const activityType = currentExplicit?.activityType || inferred.activityType;
    const contextLabel = currentExplicit?.contextLabel || inferred.contextLabel;

    fetch('/api/student/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityType, contextLabel }),
    }).catch(() => {});
  }, [pathname, searchParams]);

  useEffect(() => {
    const onInput = () => {
      lastInputAtRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onInput, { passive: true })
    );

    // Initial heartbeat on mount / navigation change
    sendHeartbeat();

    intervalRef.current = setInterval(() => {
      const recentInput = Date.now() - lastInputAtRef.current < ACTIVITY_WINDOW_MS;
      const visible = document.visibilityState === 'visible';
      if (recentInput && visible) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastInputAtRef.current = Date.now();
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onInput));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendHeartbeat]);

  return (
    <StudentActivityContext.Provider value={{ setActivityContext, currentContext: explicitContext }}>
      {children}
    </StudentActivityContext.Provider>
  );
}

export function useStudentActivity() {
  const ctx = useContext(StudentActivityContext);
  return ctx;
}
