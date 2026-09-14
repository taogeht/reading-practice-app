export interface StoryTtsAudio {
  id: string;
  url: string;
  durationSeconds?: number | null;
  generatedAt?: string | null;
  voiceId?: string | null;
  label?: string | null;
  storageKey?: string | null;
}

const VOICE_LABEL_MAP: Record<string, string> = {
  // Google Journey voices
  'en-US-Journey-F': 'Journey (Female)',
  'en-US-Journey-D': 'Journey (Male)',
};

const resolveVoiceLabel = (voiceId?: string | null, fallback?: string | null) => {
  if (!voiceId) return fallback ?? null;
  return VOICE_LABEL_MAP[voiceId] ?? fallback ?? null;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // ignore and fall through
    }
  }
  return Math.random().toString(36).slice(2);
};

export function normalizeTtsAudio(value: unknown): StoryTtsAudio[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    const parsed = value
      .map((item): StoryTtsAudio | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const urlRaw = record.url ?? record['audioUrl'];
        if (!urlRaw) return null;
        const idRaw = record.id ?? record['audioId'];
        const voiceId = record.voiceId ? String(record.voiceId) : null;
        return {
          id: typeof idRaw === 'string' ? idRaw : createId(),
          url: String(urlRaw),
          durationSeconds:
            typeof record.durationSeconds === 'number'
              ? record.durationSeconds
              : record.durationSeconds == null
              ? null
              : Number.parseFloat(String(record.durationSeconds)) || null,
          generatedAt: record.generatedAt ? String(record.generatedAt) : null,
          voiceId,
          label: resolveVoiceLabel(voiceId, record.label ? String(record.label) : null),
          storageKey: record.storageKey ? String(record.storageKey) : null,
        };
      });
    return parsed.filter((item): item is StoryTtsAudio => item !== null);
  }
  try {
    const parsed = JSON.parse(String(value));
    return normalizeTtsAudio(parsed);
  } catch (error) {
    return [];
  }
}

export function getVoiceLabel(voiceId: string | null | undefined, fallback?: string | null) {
  return resolveVoiceLabel(voiceId ?? null, fallback ?? null);
}
