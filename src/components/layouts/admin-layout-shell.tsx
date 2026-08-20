"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  School,
  Settings,
  BookOpen,
  LogOut,
  Layers,
  History,
  CalendarRange,
  Library,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";

// Every admin destination lives here. The dashboard used to repeat four of
// these as "Quick Actions" buttons at the bottom of a long scroll; the nav is
// the one place to look now, so anything reachable must be in this list.
// Books and the avatar catalog were only ever reachable by URL — Books from
// that removed button, the catalog from nothing at all.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/users", label: "User Management", icon: Users },
  { href: "/schools", label: "School Management", icon: School },
  { href: "/classes", label: "Classes", icon: Layers },
  { href: "/terms", label: "Academic Terms", icon: CalendarRange },
  { href: "/stories", label: "Story Management", icon: BookOpen },
  { href: "/admin/books", label: "Books", icon: Library },
  { href: "/avatar-catalog", label: "Avatar Catalog", icon: Sparkles },
  { href: "/settings", label: "System Settings", icon: Settings },
  { href: "/audit-logs", label: "Audit Logs", icon: History },
];

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
  const pathname = usePathname();

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
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              // Exact match only: "/classes" must not light up on
              // "/admin/classes", which is a different page.
              const isActive = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                      isActive
                        ? "bg-gray-100 dark:bg-gray-700 font-medium text-gray-900 dark:text-white border-l-2 border-blue-600"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    <Icon className="w-6 h-6 mr-3 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
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
