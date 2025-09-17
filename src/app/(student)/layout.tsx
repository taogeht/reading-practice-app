'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Home, BookOpen, Headphones, LogOut, User } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'student')) {
      router.push('/student2.0-login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'student') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100">
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <BookOpen className="w-8 h-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Reading Practice</h1>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link
                href="/student2.0/dashboard"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium"
              >
                <Home className="w-5 h-5" />
                Dashboard
              </Link>
              <Link
                href="/student2.0/practice"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium"
              >
                <Headphones className="w-5 h-5" />
                Practice
              </Link>
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center gap-2 text-gray-700">
                <User className="w-5 h-5" />
                <span className="font-medium">{user.firstName}</span>
              </div>
              <button
                onClick={() => logout()}
                className="flex items-center gap-2 text-gray-600 hover:text-red-600 font-medium"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden py-4 border-t">
            <div className="flex flex-col space-y-3">
              <Link
                href="/student2.0/dashboard"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium py-2"
              >
                <Home className="w-5 h-5" />
                Dashboard
              </Link>
              <Link
                href="/student2.0/practice"
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600 font-medium py-2"
              >
                <Headphones className="w-5 h-5" />
                Practice
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}