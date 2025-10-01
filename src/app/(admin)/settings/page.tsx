'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

type SettingType = 'boolean' | 'number' | 'string';

interface Setting {
  key: string;
  label: string;
  description: string;
  group: string;
  type: SettingType;
  value: boolean | number | string;
  defaultValue: boolean | number | string;
  isDefault: boolean;
  helpText?: string | null;
  updatedAt: string | null;
  updatedBy?: {
    id: string;
    name: string;
  } | null;
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/admin/settings');
        if (!response.ok) {
          throw new Error('Failed to fetch settings');
        }
        const data = await response.json();
        setSettings((data.settings ?? []) as Setting[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, Setting[]>();
    settings.forEach((setting) => {
      const list = groups.get(setting.group) ?? [];
      list.push(setting);
      groups.set(setting.group, list);
    });
    return Array.from(groups.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [settings]);

  const handleInputChange = (key: string, value: boolean | number | string) => {
    setSettings((current) =>
      current.map((setting) =>
        setting.key === key
          ? {
              ...setting,
              value,
              isDefault: JSON.stringify(value) === JSON.stringify(setting.defaultValue),
            }
          : setting,
      ),
    );
  };

  const handleResetToDefault = (key: string) => {
    setSettings((current) =>
      current.map((setting) =>
        setting.key === key
          ? {
              ...setting,
              value: setting.defaultValue,
              isDefault: true,
            }
          : setting,
      ),
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMessage(null);
      
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: settings.map((setting) => ({
            key: setting.key,
            value: setting.value,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      const data = await response.json();
      setSaveMessage(
        data.invalidSettings && data.invalidSettings.length
          ? `Saved with warnings. Invalid settings: ${data.invalidSettings.join(', ')}`
          : 'Settings saved successfully!',
      );

      const nextSettings: Setting[] = data.settings ?? [];
      setSettings(nextSettings);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save settings';
      setSaveMessage(`Error: ${errorMessage}`);
      
      // Clear error message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading settings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">System Settings</h1>
          <p className="text-muted-foreground">
            Adjust global behaviours for authentication, storage, analytics, and more.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {saveMessage && (
        <div
          className={`mb-6 p-3 rounded-md ${
            saveMessage.startsWith('Error')
              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100'
              : saveMessage.startsWith('Saved with warnings')
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-100'
              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100'
          }`}
        >
          {saveMessage}
        </div>
      )}

      <div className="space-y-6">
        {groupedSettings.map(({ groupName, items }) => (
          <Card key={groupName}>
            <CardHeader>
              <CardTitle>{groupName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {items.map((setting) => {
                const inputId = `setting-${setting.key}`;
                const lastUpdated = setting.updatedAt
                  ? format(new Date(setting.updatedAt), 'MMM d, yyyy p')
                  : null;

                return (
                  <div key={setting.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label htmlFor={inputId} className="text-base">
                          {setting.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {setting.description}
                        </p>
                        {setting.helpText && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {setting.helpText}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {setting.isDefault ? (
                          <Badge variant="outline">Default</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetToDefault(setting.key)}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {setting.type === 'boolean' ? (
                        <Switch
                          id={inputId}
                          checked={Boolean(setting.value)}
                          onCheckedChange={(checked) => handleInputChange(setting.key, checked)}
                        />
                      ) : (
                        <Input
                          id={inputId}
                          type={setting.type === 'number' ? 'number' : 'text'}
                          value={String(setting.value)}
                          onChange={(event) => {
                            const rawValue = event.target.value;
                            if (setting.type === 'number') {
                              handleInputChange(setting.key, rawValue === '' ? '' : Number(rawValue));
                            } else {
                              handleInputChange(setting.key, rawValue);
                            }
                          }}
                        />
                      )}
                    </div>

                    {lastUpdated && (
                      <p className="text-xs text-muted-foreground">
                        Last updated {lastUpdated}
                        {setting.updatedBy ? ` · ${setting.updatedBy.name}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
