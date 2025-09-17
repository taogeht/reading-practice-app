import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/student-login', '/student2.0-login', '/unauthorized'];
  const apiPublicRoutes = ['/api/auth/login', '/api/auth/logout', '/api/auth/student-login'];
  
  // Skip auth check for public routes and API auth routes
  if (publicRoutes.includes(pathname) || 
      apiPublicRoutes.some(route => pathname.startsWith(route)) ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }
  
  // For API routes, let them handle their own authentication
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  // For protected pages, let the client-side AuthProvider handle redirects
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};