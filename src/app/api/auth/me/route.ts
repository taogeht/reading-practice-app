import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { 
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      },
      { status: 200 }
    );
    
  } catch (error) {
    logError(error, 'api/auth/me');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}