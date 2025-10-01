import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { systemSettings, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import {
  SYSTEM_SETTING_DEFINITIONS,
  SYSTEM_SETTING_DEFINITION_MAP,
  SystemSettingDefinition,
} from '@/config/system-settings';
import { recordAuditEvent } from '@/lib/audit';

type SerializableValue = boolean | number | string;

interface SettingResponse {
  key: string;
  label: string;
  description: string;
  group: string;
  type: 'boolean' | 'number' | 'string';
  value: SerializableValue;
  defaultValue: SerializableValue;
  helpText?: string | null;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy?: {
    id: string;
    name: string;
  } | null;
}

function coerceValue(
  definition: SystemSettingDefinition,
  raw: unknown,
  useDefaultWhenInvalid = true,
): SerializableValue {
  if (raw === null || raw === undefined || raw === '') {
    return useDefaultWhenInvalid ? definition.defaultValue : ('' as string);
  }

  switch (definition.type) {
    case 'boolean':
      if (typeof raw === 'boolean') {
        return raw;
      }
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
          return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
          return false;
        }
      }
      return Boolean(raw);
    case 'number':
      if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : definition.defaultValue;
      }
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed.length) {
          return useDefaultWhenInvalid ? definition.defaultValue : 0;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : definition.defaultValue;
      }
      return definition.defaultValue;
    default:
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }
}

function buildSettingResponse(
  definition: SystemSettingDefinition,
  value: SerializableValue,
  meta?: {
    updatedAt: Date | null;
    updatedById: string | null;
    updatedByFirstName: string | null;
    updatedByLastName: string | null;
  },
): SettingResponse {
  const coercedValue = coerceValue(definition, value);
  const isDefault = JSON.stringify(coercedValue) === JSON.stringify(definition.defaultValue);

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    group: definition.group,
    type: definition.type,
    value: coercedValue,
    defaultValue: definition.defaultValue,
    helpText: definition.helpText ?? null,
    isDefault,
    updatedAt: meta?.updatedAt ? meta.updatedAt.toISOString() : null,
    updatedBy: meta?.updatedById
      ? {
          id: meta.updatedById,
          name: [meta.updatedByFirstName, meta.updatedByLastName].filter(Boolean).join(' ') || 'User',
        }
      : null,
  };
}

function buildAdditionalSettingResponse(row: {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: Date | null;
}): SettingResponse {
  const value = row.value ?? '';
  const normalizedValue = typeof value === 'string' ? value : JSON.stringify(value);
  const label = row.description ?? 'Custom Setting';

  return {
    key: row.key,
    label,
    description: label,
    group: 'Custom',
    type: 'string',
    value: normalizedValue,
    defaultValue: normalizedValue,
    helpText: null,
    isDefault: true,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: null,
  };
}

function serializeValueForStorage(definition: SystemSettingDefinition | undefined, raw: unknown): SerializableValue {
  if (!definition) {
    if (typeof raw === 'string') {
      return raw;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'boolean') {
      return raw;
    }
    return raw === null || raw === undefined ? '' : JSON.stringify(raw);
  }

  return coerceValue(definition, raw);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedAt: systemSettings.updatedAt,
        updatedById: systemSettings.updatedBy,
        updatedByFirstName: users.firstName,
        updatedByLastName: users.lastName,
      })
      .from(systemSettings)
      .leftJoin(users, eq(systemSettings.updatedBy, users.id))
      .orderBy(systemSettings.key);

    const responseList: SettingResponse[] = [];
    const handledKeys = new Set<string>();

    for (const definition of SYSTEM_SETTING_DEFINITIONS) {
      const row = rows.find((item) => item.key === definition.key);
      const value = row?.value ?? definition.defaultValue;
      responseList.push(
        buildSettingResponse(definition, value, row ?? undefined),
      );
      handledKeys.add(definition.key);
    }

    const customSettings = rows
      .filter((row) => !handledKeys.has(row.key))
      .map((row) => buildAdditionalSettingResponse({
        key: row.key,
        value: row.value,
        description: row.description,
        updatedAt: row.updatedAt,
      }));

    return NextResponse.json({ settings: [...responseList, ...customSettings] });

  } catch (error) {
    logError(error, 'api/admin/settings');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: 'Settings must be an array' }, { status: 400 });
    }

    const now = new Date();
    const appliedKeys: string[] = [];
    const invalidSettings: string[] = [];

    await db.transaction(async (tx) => {
      for (const entry of settings) {
        const key = typeof entry?.key === 'string' ? entry.key : null;
        if (!key) {
          continue;
        }

        const definition = SYSTEM_SETTING_DEFINITION_MAP[key];
        const serializedValue = serializeValueForStorage(definition, entry?.value);

        if (definition && definition.type === 'number' && typeof serializedValue === 'number') {
          if (!Number.isFinite(serializedValue)) {
            invalidSettings.push(key);
            continue;
          }
        }

        if (definition && definition.type === 'boolean' && typeof serializedValue !== 'boolean') {
          invalidSettings.push(key);
          continue;
        }

        await tx
          .insert(systemSettings)
          .values({
            key,
            value: serializedValue,
            description: definition?.description ?? entry?.description ?? null,
            updatedBy: user.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: {
              value: serializedValue,
              description: definition?.description ?? entry?.description ?? null,
              updatedBy: user.id,
              updatedAt: now,
            },
          });

        appliedKeys.push(key);
      }
    });

    const latestRows = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedAt: systemSettings.updatedAt,
        updatedById: systemSettings.updatedBy,
        updatedByFirstName: users.firstName,
        updatedByLastName: users.lastName,
      })
      .from(systemSettings)
      .leftJoin(users, eq(systemSettings.updatedBy, users.id));

    const responseList: SettingResponse[] = [];
    const handledKeys = new Set<string>();

    for (const definition of SYSTEM_SETTING_DEFINITIONS) {
      const row = latestRows.find((item) => item.key === definition.key);
      const value = row?.value ?? definition.defaultValue;
      responseList.push(
        buildSettingResponse(definition, value, row ?? undefined),
      );
      handledKeys.add(definition.key);
    }

    const customSettings = latestRows
      .filter((row) => !handledKeys.has(row.key))
      .map((row) => buildAdditionalSettingResponse({
        key: row.key,
        value: row.value,
        description: row.description,
        updatedAt: row.updatedAt,
      }));

    await recordAuditEvent({
      userId: user.id,
      action: 'admin.settings.update',
      resourceType: 'system_settings',
      details: {
        keys: appliedKeys,
        invalid: invalidSettings,
      },
      request,
    });

    return NextResponse.json({
      settings: [...responseList, ...customSettings],
      invalidSettings,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    logError(error, 'api/admin/settings');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
