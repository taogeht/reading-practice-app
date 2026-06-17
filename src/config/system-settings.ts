export type SystemSettingType = 'boolean' | 'number' | 'string' | 'select';

export interface SystemSettingOption {
  value: string;
  label: string;
}

export interface SystemSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SystemSettingType;
  group: string;
  defaultValue: boolean | number | string;
  helpText?: string;
  /** Only for `type: 'select'` — the allowed values shown as a dropdown. */
  options?: SystemSettingOption[];
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
  {
    key: 'image.generationModel',
    label: 'Image Generation Model',
    description: 'Which AI model generates images across the app — spelling words, practice scenes, reading passages, and avatars.',
    type: 'select',
    group: 'Image Generation',
    defaultValue: 'gemini',
    options: [
      { value: 'gemini', label: 'Gemini 2.5 Flash (default)' },
      { value: 'gpt-image-1-mini', label: 'GPT Image 1 mini — low quality (cheapest)' },
    ],
    helpText: 'GPT Image 1 mini (low) is the cheapest option — useful for testing image quality and cost. Requires OPENAI_API_KEY. Takes effect within a few seconds; no redeploy needed.',
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

