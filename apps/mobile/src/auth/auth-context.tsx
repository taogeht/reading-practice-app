import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from 'react';
import type { MobileUser } from '@starling-rise/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/api/client';
import { clearMediaCache } from '@/media/audio-cache';
import { clearPendingRecordings } from '@/recording/pending-recording';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: MobileUser };

type AuthAction =
  | { type: 'signedIn'; user: MobileUser }
  | { type: 'signedOut' };

type AuthContextValue = AuthState & {
  loginWithQr: (loginToken: string) => Promise<void>;
  loginWithVisual: (input: {
    classId: string;
    studentId: string;
    visualPassword: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function clearPrivateMedia(): void {
  try {
    clearMediaCache();
  } catch {
    // Secure session cleanup must still complete if the OS cache is unavailable.
  }
  void clearPendingRecordings().catch(() => {
    // Logout must still complete if the device cannot remove a local file.
  });
}

function reducer(_state: AuthState, action: AuthAction): AuthState {
  return action.type === 'signedIn'
    ? { status: 'signedIn', user: action.user }
    : { status: 'signedOut', user: null };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, { status: 'loading', user: null });

  const markSignedOut = useCallback(() => {
    clearPrivateMedia();
    queryClient.clear();
    dispatch({ type: 'signedOut' });
  }, [queryClient]);

  useEffect(() => {
    mobileApi.setSessionExpiredListener(markSignedOut);
    void (async () => {
      try {
        await mobileApi.restore();
        const user = await mobileApi.me();
        if (user) {
          dispatch({ type: 'signedIn', user });
        } else {
          markSignedOut();
        }
      } catch {
        markSignedOut();
      }
    })();
    return () => mobileApi.setSessionExpiredListener(null);
  }, [markSignedOut]);

  const loginWithQr = useCallback(async (loginToken: string) => {
    const user = await mobileApi.loginWithQr(loginToken);
    dispatch({ type: 'signedIn', user });
  }, []);

  const loginWithVisual = useCallback(
    async (input: {
      classId: string;
      studentId: string;
      visualPassword: string;
    }) => {
      const user = await mobileApi.loginWithVisual(input);
      dispatch({ type: 'signedIn', user });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await mobileApi.logout();
    } finally {
      // The API client clears SecureStore in its own finally block. Always update
      // the in-memory state too, even when server-side revocation is unavailable.
      markSignedOut();
    }
  }, [markSignedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, loginWithQr, loginWithVisual, logout }),
    [state, loginWithQr, loginWithVisual, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
