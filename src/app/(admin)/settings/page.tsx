'use client';

import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Setting {
  key: string;
  value: any;
  description: string;
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
        setSettings(data.settings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleInputChange = (key: string, value: any) => {
    setSettings(currentSettings =>
      currentSettings.map(s => (s.key === key ? { ...s, value } : s))
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
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      const data = await response.json();
      setSaveMessage('Settings saved successfully!');
      
      // Update local settings with server response
      setSettings(data.settings);
      
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
      <h1 className="text-3xl font-bold mb-6">System Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings.map(setting => (
            <div key={setting.key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <Label htmlFor={setting.key} className="md:text-right">{setting.description}</Label>
              <div className="col-span-2">
                <Input
                  id={setting.key}
                  type={typeof setting.value === 'number' ? 'number' : 'text'}
                  value={JSON.stringify(setting.value)}
                  onChange={(e) => handleInputChange(setting.key, e.target.value)}
                />
              </div>
            </div>
          ))}
          
          {saveMessage && (
            <div className={`p-3 rounded-md ${
              saveMessage.startsWith('Error') 
                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100' 
                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100'
            }`}>
              {saveMessage}
            </div>
          )}
          
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
