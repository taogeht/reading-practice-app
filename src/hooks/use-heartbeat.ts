'use client';

import { useEffect } from 'react';
import { useStudentActivity, type ActivityType } from '@/components/providers/student-activity-provider';

export interface HeartbeatContext {
  activityType?: ActivityType;
  contextLabel?: string;
}

/**
 * Hook to set the active learning context for the student's heartbeat.
 *
 * Can be called with explicit context (e.g. in a reading passage or spelling game):
 *   useHeartbeat({ activityType: 'reading', contextLabel: 'The Big Blue Sea' });
 *
 * When unmounted, the explicit context is cleared and falls back to URL inference.
 */
export function useHeartbeat(explicitContext?: HeartbeatContext) {
  const setActivityContext = useStudentActivity()?.setActivityContext;
  const hasExplicitContext = explicitContext !== undefined;
  const activityType = explicitContext?.activityType;
  const contextLabel = explicitContext?.contextLabel;

  // Depend on the stable setter, not the context value this effect updates.
  useEffect(() => {
    if (!setActivityContext || !hasExplicitContext) return;

    setActivityContext({ activityType, contextLabel });

    return () => {
      setActivityContext(null);
    };
  }, [setActivityContext, hasExplicitContext, activityType, contextLabel]);
}
