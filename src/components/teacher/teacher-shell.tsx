"use client";

import { useState, type ReactNode, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import {
  Home,
  GraduationCap,
  ClipboardList,
  SpellCheck2,
  Users,
  Inbox,
  Sparkles,
  Trophy,
  Sun,
  BookOpen,
  FileText,
  Library,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export interface TeacherNavCaps {
  canManageSpellingLists: boolean;
  canManageAssignments: boolean;
  canGenerateReadingContent: boolean;
  canGeneratePracticeQuestions: boolean;
  canUseSunnyPreview: boolean;
}

type NavItem = { label: string; href: string; icon: ComponentType<{ className?: string }> };

/**
 * Persistent teacher navigation shell. Desktop: fixed left sidebar. Mobile: a
 * top bar with a hamburger that opens a drawer. Nav items are gated by the
 * teacher's capability flags, so a default teacher (spelling + assignments only)
 * sees a short list and an empty "More" section. Additive chrome — the wrapped
 * page renders unchanged in the main area.
 */
export function TeacherShell({
  caps,
  teacherName,
  children,
}: {
  caps: TeacherNavCaps;
  teacherName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  interface NavGroup {
    title: string;
    items: NavItem[];
  }

  const sections: NavGroup[] = [
    {
      title: "Teaching",
      items: [
        { label: "Home", href: "/teacher/dashboard", icon: Home },
        { label: "Classes", href: "/teacher/classes", icon: GraduationCap },
        { label: "Students", href: "/teacher/students", icon: Users },
      ],
    },
    {
      title: "Assignments & Grading",
      items: [
        ...(caps.canManageAssignments
          ? [{ label: "Assignments", href: "/teacher/assignments", icon: ClipboardList }]
          : []),
        { label: "Review", href: "/teacher/submissions", icon: Inbox },
      ],
    },
    {
      title: "Curriculum & Content",
      items: [
        ...(caps.canGenerateReadingContent
          ? [{ label: "Reading Practice", href: "/teacher/reading", icon: Sparkles }]
          : []),
        ...(caps.canManageSpellingLists
          ? [{ label: "Spelling Lists", href: "/teacher/spelling-lists", icon: SpellCheck2 }]
          : []),
        ...(caps.canGeneratePracticeQuestions
          ? [
              { label: "Practice Questions", href: "/teacher/practice-questions", icon: Trophy },
              { label: "Tests", href: "/teacher/tests", icon: FileText },
            ]
          : []),
        { label: "Story Library", href: "/teacher/stories", icon: Library },
        ...(caps.canUseSunnyPreview
          ? [{ label: "Sunny Helper", href: "/teacher/helper", icon: Sun }]
          : []),
      ],
    },
  ];

  // Home only matches exactly so deeper /teacher/* routes don't both light it
  // up; everything else matches its prefix (so a detail page keeps its parent
  // nav item active).
  const isActive = (href: string) =>
    href === "/teacher/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const { logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      window.location.href = "/login";
    }
  }

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", active ? "text-blue-600" : "text-gray-400")} />
        {item.label}
      </Link>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
          <BookOpen className="h-4 w-4" />
        </div>
        <span className="font-semibold text-gray-900">Teacher</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        {sections.map((section) => {
          if (section.items.length === 0) return null;
          return (
            <div key={section.title} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="truncate px-3 pb-2 text-xs text-gray-500">{teacherName}</div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-5 w-5 text-gray-400" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col lg:border-r">
        {sidebar}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-1.5 rounded-md p-1.5 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
        <span className="font-semibold text-gray-900">Teacher</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-2 z-10 rounded-md p-1.5 hover:bg-gray-100"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="lg:pl-60">{children}</main>
    </div>
  );
}
