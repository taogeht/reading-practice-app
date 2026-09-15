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
  const activity = useStudentActivity();

  useEffect(() => {
    if (!activity || !explicitContext) return;

    activity.setActivityContext(explicitContext);

    return () => {
      activity.setActivityContext(null);
    };
  }, [activity, explicitContext?.activityType, explicitContext?.contextLabel]);
}
