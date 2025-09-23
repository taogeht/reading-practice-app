"use client";

import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: string;
  email: string | null;
  role: 'student' | 'teacher' | 'admin';
  firstName: string;
  lastName: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const publicRoutes = ['/', '/login', '/student-login'];
    const isPublicRoute =
      publicRoutes.includes(pathname) ||
      pathname.startsWith('/student-login');

    // Redirect to login if not authenticated on protected route
    if (!user && !isPublicRoute) {
      const loginUrl = pathname.startsWith('/student') ? '/student-login' : '/login';
      router.push(loginUrl);
      return;
    }

    // Handle authenticated users on public routes
    if (isPublicRoute && user) {
      if (user.role === 'student') {
        router.push('/student/dashboard');
      } else if (user.role === 'teacher') {
        router.push('/teacher/dashboard');
      } else if (user.role === 'admin') {
        router.push('/dashboard');
      }
      return;
    }

    // Role-based access control for protected routes
    if (user) {
      // Admin routes (dashboard, users, schools, stories, settings)
      const adminRoutes = ['/dashboard', '/users', '/schools', '/stories', '/settings'];
      const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));
      
      if (isAdminRoute && user.role !== 'admin') {
        router.push('/unauthorized');
        return;
      }

      if (pathname.startsWith('/teacher') && user.role !== 'teacher' && user.role !== 'admin') {
        router.push('/unauthorized');
        return;
      }

      if (pathname.startsWith('/student') && user.role !== 'student') {
        router.push('/unauthorized');
        return;
      }
    }
  }, [user, isLoading, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
