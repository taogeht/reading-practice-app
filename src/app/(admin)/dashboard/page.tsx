'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface DashboardStats {
  totalUsers: number;
  totalSchools: number;
  totalStories: number;
  totalRecordings: number;
  totalAdmins: number;
  totalTeachers: number;
  totalStudents: number;
  totalRecordingSizeBytes: number;
  totalRecordingDurationSeconds: number;
  totalRecordingDurationHours: number;
  monthlyRecordingCount: number;
  estimatedStorageCostUsd: number;
}

type StorageFilter = 'all' | 'tts' | 'recordings';

interface R2ObjectItem {
  key: string;
  size: number;
  lastModified: string | null;
  type: string;
  metadata?: Record<string, string>;
  story?: {
    id: string;
    title: string;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageItems, setStorageItems] = useState<R2ObjectItem[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageCursor, setStorageCursor] = useState<string | null>(null);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('tts');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats');
        }
        const data = await response.json();
        const payload = data.stats ?? {};
        setStats({
          totalUsers: payload.totalUsers ?? 0,
          totalSchools: payload.totalSchools ?? 0,
          totalStories: payload.totalStories ?? 0,
          totalRecordings: payload.totalRecordings ?? 0,
          totalAdmins: payload.totalAdmins ?? 0,
          totalTeachers: payload.totalTeachers ?? 0,
          totalStudents: payload.totalStudents ?? 0,
          totalRecordingSizeBytes: payload.totalRecordingSizeBytes ?? 0,
          totalRecordingDurationSeconds: payload.totalRecordingDurationSeconds ?? 0,
          totalRecordingDurationHours: payload.totalRecordingDurationHours ?? 0,
          monthlyRecordingCount: payload.monthlyRecordingCount ?? 0,
          estimatedStorageCostUsd: payload.estimatedStorageCostUsd ?? 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  useEffect(() => {
    loadStorage(true);
  }, [storageFilter]);

  const loadStorage = async (reset = false) => {
    try {
      if (reset) {
        setStorageLoading(true);
        setStorageCursor(null);
        setStorageError(null);
      } else {
        setStorageLoading(true);
      }

      const params = new URLSearchParams();
      if (storageFilter === 'tts') {
        params.set('prefix', 'audio/tts/');
      } else if (storageFilter === 'recordings') {
        params.set('prefix', 'audio/recordings/');
      }
      if (!reset && storageCursor) {
        params.set('cursor', storageCursor);
      }
      params.set('limit', '50');

      const response = await fetch(`/api/admin/r2/objects?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load storage objects');
      }
      const data = await response.json();

      const items: R2ObjectItem[] = (data.items || []).map((item: any) => ({
        key: item.key,
        size: item.size,
        lastModified: item.lastModified,
        type: item.type,
        metadata: item.metadata,
        story: item.story,
      }));

      setStorageItems((prev) => (reset ? items : [...prev, ...items]));
      setStorageCursor(data.nextCursor ?? null);
    } catch (err) {
      setStorageError(err instanceof Error ? err.message : 'Failed to load storage objects');
    } finally {
      setStorageLoading(false);
    }
  };

  const handleDeleteObject = async (key: string) => {
    if (!confirm(`Delete ${key}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingKey(key);
      const response = await fetch('/api/admin/r2/objects', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete file');
      }

      setStorageItems((prev) => prev.filter((item) => item.key !== key));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeletingKey(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  };

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return '0m';
    }
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts = [] as string[];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    if (parts.length === 0) {
      parts.push('1m');
    }
    return parts.join(' ');
  };

  const getFilterLabel = (filter: StorageFilter) => {
    switch (filter) {
      case 'tts':
        return 'TTS Audio';
      case 'recordings':
        return 'Student Recordings';
      default:
        return 'All Files';
    }
  };

  const totalRecordingSizeBytes = stats?.totalRecordingSizeBytes ?? 0;
  const totalRecordingDurationSeconds = stats?.totalRecordingDurationSeconds ?? 0;
  const monthlyRecordingCount = stats?.monthlyRecordingCount ?? 0;
  const estimatedStorageCostUsd = stats?.estimatedStorageCostUsd ?? 0;
  const formattedRecordingDuration = formatDuration(totalRecordingDurationSeconds);
  const storageItemsTotalBytes = storageItems.reduce((sum, item) => sum + (item.size || 0), 0);
  const currentMonthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 mb-6">
          Admin Dashboard
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle>Loading...</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="animate-pulse">
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 mb-6">
          Admin Dashboard
        </h1>
        <div className="text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 mb-6">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.totalUsers.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Schools</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.totalSchools.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Active schools</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Stories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.totalStories.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Available stories</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Recordings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{stats?.totalRecordings.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Student recordings</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Admins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.totalAdmins.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Administrative accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.totalTeachers.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Active teachers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.totalStudents.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Student accounts</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Storage Consumed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatBytes(totalRecordingSizeBytes)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">All recording assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly Recordings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{monthlyRecordingCount.toLocaleString()}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Submitted this month ({currentMonthLabel})</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Listening Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formattedRecordingDuration}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Across all student submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Storage Cost (est.)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${estimatedStorageCostUsd.toFixed(2)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Based on R2 $0.015/GB</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Storage Files</h2>
          <div className="flex items-center gap-2">
            <Select value={storageFilter} onValueChange={(value: StorageFilter) => setStorageFilter(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tts">TTS Audio</SelectItem>
                <SelectItem value="recordings">Student Recordings</SelectItem>
                <SelectItem value="all">All Files</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => loadStorage(true)} disabled={storageLoading}>
              Refresh
            </Button>
          </div>
        </div>

        {storageError && (
          <Card>
            <CardContent className="text-red-600 dark:text-red-400 p-4">
              {storageError}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>R2 Bucket Files</CardTitle>
            <CardDescription>
              {storageItems.length === 0 && !storageLoading
                ? `No files found for ${getFilterLabel(storageFilter).toLowerCase()}.`
                : 'Review audio assets stored in Cloudflare R2. Deleting an audio file will unlink it from any associated story.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Linked Story</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Last Modified</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storageItems.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-mono text-xs sm:text-sm break-all">
                        {item.key}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {item.type.replace('-', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.story ? (
                          <span className="text-sm">
                            {item.story.title}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{formatBytes(item.size)}</TableCell>
                      <TableCell>
                        {item.lastModified
                          ? new Date(item.lastModified).toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteObject(item.key)}
                          disabled={deletingKey === item.key}
                        >
                          {deletingKey === item.key ? 'Deleting…' : 'Delete'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!storageLoading && storageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        No files to display.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Loaded {storageItems.length} file{storageItems.length === 1 ? '' : 's'} for {getFilterLabel(storageFilter).toLowerCase()} (≈{formatBytes(storageItemsTotalBytes)}).
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => loadStorage(true)}
                  disabled={storageLoading}
                >
                  Reload
                </Button>
                <Button
                  onClick={() => loadStorage(false)}
                  disabled={storageLoading || !storageCursor}
                >
                  {storageLoading && storageCursor ? 'Loading…' : 'Load More'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/users">
            <Button>Manage Users</Button>
          </Link>
          <Link href="/schools">
            <Button>Manage Schools</Button>
          </Link>
          <Link href="/admin/books">
            <Button>Manage Books</Button>
          </Link>
          <Link href="/settings">
            <Button>System Settings</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
