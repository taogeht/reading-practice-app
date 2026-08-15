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
import { mobileApi } from '@/api/client';

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

function reducer(_state: AuthState, action: AuthAction): AuthState {
  return action.type === 'signedIn'
    ? { status: 'signedIn', user: action.user }
    : { status: 'signedOut', user: null };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', user: null });

  useEffect(() => {
    mobileApi.setSessionExpiredListener(() => dispatch({ type: 'signedOut' }));
    void (async () => {
      try {
        await mobileApi.restore();
        const user = await mobileApi.me();
        dispatch(user ? { type: 'signedIn', user } : { type: 'signedOut' });
      } catch {
        dispatch({ type: 'signedOut' });
      }
    })();
    return () => mobileApi.setSessionExpiredListener(null);
  }, []);

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
    await mobileApi.logout();
    dispatch({ type: 'signedOut' });
  }, []);

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
