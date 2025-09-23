'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Home, Users, School, Settings, BookOpen, LogOut, Layers } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    return null;
  }
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <aside className="w-64 bg-white dark:bg-gray-800 shadow-md">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Admin Dashboard</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Welcome, {user.firstName} {user.lastName}
          </p>
        </div>
        <nav className="mt-6">
          <ul>
            <li>
              <Link href="/dashboard" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Home className="w-6 h-6 mr-3" />
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/users" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Users className="w-6 h-6 mr-3" />
                User Management
              </Link>
            </li>
            <li>
              <Link href="/schools" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <School className="w-6 h-6 mr-3" />
                School Management
              </Link>
            </li>
            <li>
              <Link href="/classes" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Layers className="w-6 h-6 mr-3" />
                Classes
              </Link>
            </li>
            <li>
              <Link href="/stories" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <BookOpen className="w-6 h-6 mr-3" />
                Story Management
              </Link>
            </li>
            <li>
              <Link href="/settings" className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Settings className="w-6 h-6 mr-3" />
                System Settings
              </Link>
            </li>
          </ul>
        </nav>
        <div className="absolute bottom-0 w-64 p-4">
          <button
            onClick={() => logout()}
            className="flex items-center w-full px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
          >
            <LogOut className="w-6 h-6 mr-3" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
