export type SystemSettingType = 'boolean' | 'number' | 'string';

export interface SystemSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SystemSettingType;
  group: string;
  defaultValue: boolean | number | string;
  helpText?: string;
}

export const SYSTEM_SETTING_DEFINITIONS: SystemSettingDefinition[] = [
  {
    key: 'auth.sessionDurationHours',
    label: 'Session Duration (hours)',
    description: 'How long teacher and admin sessions remain active before re-authentication is required.',
    type: 'number',
    group: 'Authentication',
    defaultValue: 168,
    helpText: 'Default is 7 days (168 hours). '
      + 'Lower this value for stricter security policies.',
  },
  {
    key: 'student.maxRecordingAttempts',
    label: 'Max Recording Attempts',
    description: 'Maximum number of times a student can retry a single assignment recording before it locks.',
    type: 'number',
    group: 'Student Experience',
    defaultValue: 3,
  },
  {
    key: 'storage.recordingRetentionDays',
    label: 'Recording Retention (days)',
    description: 'Number of days to keep student recordings before they are eligible for archival or deletion.',
    type: 'number',
    group: 'Storage & Costs',
    defaultValue: 365,
    helpText: 'Use a smaller value if you plan to offload recordings to long-term storage.',
  },
  {
    key: 'storage.autoCleanupEnabled',
    label: 'Automatic Cleanup',
    description: 'Automatically clean up expired recordings and temporary assets during nightly maintenance.',
    type: 'boolean',
    group: 'Storage & Costs',
    defaultValue: true,
  },
  {
    key: 'tts.batchMaxItems',
    label: 'Maximum TTS Batch Items',
    description: 'The maximum number of stories that can be submitted in a single text-to-speech batch job.',
    type: 'number',
    group: 'Audio & TTS',
    defaultValue: 10,
  },
  {
    key: 'analytics.flagAccuracyThreshold',
    label: 'Flag Accuracy Threshold (%)',
    description: 'Automatically flag student recordings when accuracy scores fall below this percentage.',
    type: 'number',
    group: 'Analytics',
    defaultValue: 70,
  },
  {
    key: 'notifications.parentEmailEnabled',
    label: 'Send Parent Email Alerts',
    description: 'Notify parents when a new recording is reviewed and feedback is provided.',
    type: 'boolean',
    group: 'Notifications',
    defaultValue: false,
  },
];

export const SYSTEM_SETTING_DEFINITION_MAP = SYSTEM_SETTING_DEFINITIONS.reduce<Record<string, SystemSettingDefinition>>(
  (acc, definition) => {
    acc[definition.key] = definition;
    return acc;
  },
  {},
);

export function getSystemSettingDefinition(key: string): SystemSettingDefinition | undefined {
  return SYSTEM_SETTING_DEFINITION_MAP[key];
}

