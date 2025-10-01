'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Download, RefreshCw, Search } from 'lucide-react';

interface AuditLogRecord {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | null;
  user: {
    id: string;
    name: string;
    email?: string | null;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

interface FiltersResponse {
  availableActions: string[];
  availableResourceTypes: string[];
}

interface ApiResponse {
  logs: AuditLogRecord[];
  pagination: Pagination;
  filters: FiltersResponse;
}

type TimeframeOption = 7 | 30 | 90 | 180 | 365 | 0;

const TIMEFRAME_OPTIONS: Array<{ label: string; value: TimeframeOption }> = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 6 months', value: 180 },
  { label: 'Last 12 months', value: 365 },
  { label: 'All history', value: 0 },
];

const DEFAULT_PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
  });
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableResourceTypes, setAvailableResourceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const [filters, setFilters] = useState({
    action: 'all',
    resourceType: 'all',
    timeframe: 30 as TimeframeOption,
    search: '',
  });

  const params = useMemo(() => {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(pagination.page));
    searchParams.set('limit', String(pagination.limit));
    if (filters.action !== 'all') {
      searchParams.set('action', filters.action);
    }
    if (filters.resourceType !== 'all') {
      searchParams.set('resourceType', filters.resourceType);
    }
    if (filters.timeframe && filters.timeframe > 0) {
      searchParams.set('timeframeDays', String(filters.timeframe));
    } else if (filters.timeframe === 0) {
      searchParams.set('timeframeDays', '0');
    }
    if (filters.search.trim().length > 0) {
      searchParams.set('search', filters.search.trim());
    }
    return searchParams.toString();
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchLogs() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/admin/audit-logs?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load audit logs');
        }

        const data = (await response.json()) as ApiResponse;
        setLogs(data.logs);
        setPagination(data.pagination);
        setAvailableActions(data.filters.availableActions || []);
        setAvailableResourceTypes(data.filters.availableResourceTypes || []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();

    return () => controller.abort();
  }, [params, refreshToken]);

  const handleFilterChange = (partial: Partial<typeof filters>) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handlePageChange = (nextPage: number) => {
    setPagination((prev) => ({ ...prev, page: nextPage }));
  };

  const handleExport = async () => {
    const exportParams = new URLSearchParams(params);
    exportParams.set('limit', '2000');
    try {
      const response = await fetch(`/api/admin/audit-logs/export?${exportParams.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export logs');
    }
  };

  const clearFilters = () => {
    setFilters({ action: 'all', resourceType: 'all', timeframe: 30, search: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const renderDetailsPreview = (details: Record<string, unknown> | null | undefined) => {
    if (!details || Object.keys(details).length === 0) {
      return '—';
    }
    const json = JSON.stringify(details);
    return json.length > 60 ? `${json.slice(0, 57)}…` : json;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Review every administrative action across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRefreshToken((token) => token + 1)}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={handleExport} variant="outline">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              placeholder="Search action, resource, or details"
              className="pl-9"
              value={filters.search}
              onChange={(event) => handleFilterChange({ search: event.target.value })}
            />
          </div>
        </div>
        <Select
          value={filters.timeframe.toString()}
          onValueChange={(value) => handleFilterChange({ timeframe: Number(value) as TimeframeOption })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Timeframe" />
          </SelectTrigger>
          <SelectContent>
            {TIMEFRAME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.action}
          onValueChange={(value) => handleFilterChange({ action: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {availableActions.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.resourceType}
          onValueChange={(value) => handleFilterChange({ resourceType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resources</SelectItem>
            {availableResourceTypes.map((resource) => (
              <SelectItem key={resource} value={resource}>
                {resource}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  Loading audit logs…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-red-600 py-10">
                  {error}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  No audit events found for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="align-top">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{log.action}</span>
                      {log.ipAddress && (
                        <span className="text-xs text-muted-foreground mt-1">
                          IP {log.ipAddress}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{log.resourceType}</span>
                      {log.resourceId && (
                        <span className="text-xs text-muted-foreground">
                          ID {log.resourceId}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.user ? (
                      <div className="flex flex-col">
                        <span>{log.user.name}</span>
                        {log.user.email && (
                          <span className="text-xs text-muted-foreground">
                            {log.user.email}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline">System</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0"
                      onClick={() => setSelectedLog(log)}
                    >
                      {renderDetailsPreview(log.details)}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {log.createdAt
                      ? format(new Date(log.createdAt), 'MMM d, yyyy p')
                      : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {logs.length} of {pagination.totalItems} events
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={pagination.page <= 1 || loading}
            onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.page + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Audit Event Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Action</h3>
                <p>{selectedLog.action}</p>
              </div>
              <div>
                <h3 className="font-medium">Resource</h3>
                <p>
                  {selectedLog.resourceType}
                  {selectedLog.resourceId ? ` · ${selectedLog.resourceId}` : ''}
                </p>
              </div>
              <div>
                <h3 className="font-medium">User</h3>
                <p>
                  {selectedLog.user?.name ?? 'System'}
                  {selectedLog.user?.email ? ` (${selectedLog.user.email})` : ''}
                </p>
              </div>
              <div>
                <h3 className="font-medium">Timestamp</h3>
                <p>
                  {selectedLog.createdAt
                    ? format(new Date(selectedLog.createdAt), 'PPPpp')
                    : '—'}
                </p>
              </div>
              <div>
                <h3 className="font-medium">IP Address</h3>
                <p>{selectedLog.ipAddress ?? '—'}</p>
              </div>
              <div>
                <h3 className="font-medium">Details</h3>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
                  {JSON.stringify(selectedLog.details ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

