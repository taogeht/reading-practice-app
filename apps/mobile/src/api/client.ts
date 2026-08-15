import Constants from 'expo-constants';
import {
  mobileAuthResponseSchema,
  mobileClassResolveResponseSchema,
  mobileErrorResponseSchema,
  mobileMeResponseSchema,
  studentRosterResponseSchema,
  visualPasswordStudentResponseSchema,
  type MobileAuthResponse,
  type MobileClassResolveResponse,
  type MobilePlatform,
  type MobileUser,
  type StudentRosterResponse,
  type VisualPasswordStudent,
} from '@starling-rise/contracts';
import { Platform } from 'react-native';
import type { z } from 'zod';
import { clearTokens, loadTokens, saveTokens } from '@/auth/token-store';

const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl;
const API_URL = String(configuredApiUrl ?? 'http://localhost:3000').replace(/\/$/, '');

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

type Schema<T> = z.ZodType<T>;

class MobileApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private sessionExpiredListener: (() => void) | null = null;

  setSessionExpiredListener(listener: (() => void) | null) {
    this.sessionExpiredListener = listener;
  }

  async restore(): Promise<void> {
    const stored = await loadTokens();
    this.accessToken = stored?.accessToken ?? null;
    this.refreshToken = stored?.refreshToken ?? null;
  }

  async me(): Promise<MobileUser | null> {
    if (!this.accessToken || !this.refreshToken) return null;
    try {
      const response = await this.request(
        '/api/mobile/v1/auth/me',
        {},
        mobileMeResponseSchema,
      );
      return response.user;
    } catch (error) {
      if (error instanceof MobileApiError && error.status === 401) return null;
      throw error;
    }
  }

  async loginWithQr(loginToken: string, deviceName?: string): Promise<MobileUser> {
    if (this.refreshToken) await this.logout();
    const response = await this.publicRequest(
      '/api/mobile/v1/auth/qr',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginToken,
          platform: Platform.OS as MobilePlatform,
          deviceName,
        }),
      },
      mobileAuthResponseSchema,
    );
    await this.acceptAuth(response);
    return response.user;
  }

  async loginWithVisual(input: {
    classId: string;
    studentId: string;
    visualPassword: string;
    deviceName?: string;
  }): Promise<MobileUser> {
    if (this.refreshToken) await this.logout();
    const response = await this.publicRequest(
      '/api/mobile/v1/auth/visual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          platform: Platform.OS as MobilePlatform,
        }),
      },
      mobileAuthResponseSchema,
    );
    await this.acceptAuth(response);
    return response.user;
  }

  resolveClass(code: string): Promise<MobileClassResolveResponse> {
    return this.publicRequest(
      `/api/mobile/v1/classes/resolve/${encodeURIComponent(code)}`,
      {},
      mobileClassResolveResponseSchema,
    );
  }

  classRoster(classId: string): Promise<StudentRosterResponse> {
    return this.publicRequest(
      `/api/classes/${encodeURIComponent(classId)}/students`,
      {},
      studentRosterResponseSchema,
    );
  }

  async visualPasswordStudent(
    classId: string,
    studentId: string,
  ): Promise<VisualPasswordStudent> {
    const response = await this.publicRequest(
      `/api/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`,
      {},
      visualPasswordStudentResponseSchema,
    );
    return response.student;
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshToken;
    try {
      if (refreshToken) {
        await this.publicRequest(
          '/api/mobile/v1/auth/logout',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          },
        );
      }
    } finally {
      await this.clearSession();
    }
  }

  private async acceptAuth(response: MobileAuthResponse): Promise<void> {
    this.accessToken = response.accessToken;
    this.refreshToken = response.refreshToken;
    await saveTokens(response);
  }

  private async clearSession(notify = false): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    await clearTokens();
    if (notify) this.sessionExpiredListener?.();
  }

  private async refresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const response = await this.publicRequest(
          '/api/mobile/v1/auth/refresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              refreshToken: this.refreshToken,
              platform: Platform.OS as MobilePlatform,
            }),
          },
          mobileAuthResponseSchema,
        );
        await this.acceptAuth(response);
        return true;
      } catch {
        await this.clearSession(true);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema?: Schema<T>,
    retry = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    headers.set('X-App-Version', Constants.expoConfig?.version ?? 'development');
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });

    if (response.status === 401 && retry && (await this.refresh())) {
      return this.request(path, init, schema, false);
    }
    return this.parseResponse(response, schema);
  }

  private async publicRequest<T>(
    path: string,
    init: RequestInit,
    schema?: Schema<T>,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-App-Version', Constants.expoConfig?.version ?? 'development');
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    return this.parseResponse(response, schema);
  }

  private async parseResponse<T>(response: Response, schema?: Schema<T>): Promise<T> {
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = mobileErrorResponseSchema.safeParse(body);
      throw new MobileApiError(
        error.success ? error.data.error.message : 'The server could not complete this request.',
        response.status,
        error.success ? error.data.error.code : undefined,
        error.success ? error.data.error.retryAfterSeconds : undefined,
      );
    }

    if (!schema) return body as T;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new MobileApiError('The server returned an unexpected response.', 502);
    }
    return parsed.data;
  }
}

export const mobileApi = new MobileApiClient();
