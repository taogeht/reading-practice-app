"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { Home, Users, School, Settings, BookOpen, LogOut, Layers, History } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface AdminLayoutShellProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    role: "admin";
  };
  children: ReactNode;
}

export function AdminLayoutShell({ user, children }: AdminLayoutShellProps) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Admin logout failed", error);
    }
  };

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
              <Link
                href="/dashboard"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Home className="w-6 h-6 mr-3" />
                Dashboard
              </Link>
            </li>
            <li>
              <Link
                href="/users"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Users className="w-6 h-6 mr-3" />
                User Management
              </Link>
            </li>
            <li>
              <Link
                href="/schools"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <School className="w-6 h-6 mr-3" />
                School Management
              </Link>
            </li>
            <li>
              <Link
                href="/classes"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Layers className="w-6 h-6 mr-3" />
                Classes
              </Link>
            </li>
            <li>
              <Link
                href="/stories"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <BookOpen className="w-6 h-6 mr-3" />
                Story Management
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Settings className="w-6 h-6 mr-3" />
                System Settings
              </Link>
            </li>
            <li>
              <Link
                href="/audit-logs"
                className="flex items-center px-6 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <History className="w-6 h-6 mr-3" />
                Audit Logs
              </Link>
            </li>
          </ul>
        </nav>
        <div className="absolute bottom-0 w-64 p-4">
          <button
            onClick={handleLogout}
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
