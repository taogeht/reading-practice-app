"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Headphones, Home, LogOut, User } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

interface StudentLayoutShellProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: "student";
  };
  children: ReactNode;
}

export function StudentLayoutShell({ user, children }: StudentLayoutShellProps) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Student logout failed", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <BookOpen className="w-8 h-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Reading Practice</h1>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/student/dashboard"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium"
              >
                <Home className="w-5 h-5" />
                Dashboard
              </Link>
              <Link
                href="/student/practice"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium"
              >
                <Headphones className="w-5 h-5" />
                Practice
              </Link>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 text-gray-700">
                <User className="w-5 h-5" />
                <span className="font-medium">{user.firstName}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-600 hover:text-red-600 font-medium"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>

          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col space-y-3">
              <Link
                href="/student/dashboard"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium py-2"
              >
                <Home className="w-5 h-5" />
                Dashboard
              </Link>
              <Link
                href="/student/practice"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium py-2"
              >
                <Headphones className="w-5 h-5" />
                Practice
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
