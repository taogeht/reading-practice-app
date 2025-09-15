'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface DashboardStats {
  totalUsers: number;
  totalSchools: number;
  totalStories: number;
  totalRecordings: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats');
        }
        const data = await response.json();
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

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
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/users">
            <Button>Manage Users</Button>
          </Link>
          <Link href="/schools">
            <Button>Manage Schools</Button>
          </Link>
          <Link href="/settings">
            <Button>System Settings</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
