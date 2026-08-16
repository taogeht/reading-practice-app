import Constants from 'expo-constants';
import {
  mobileAssignmentDetailResponseSchema,
  mobileAssignmentListResponseSchema,
  mobileAuthResponseSchema,
  mobileClassResolveResponseSchema,
  mobileDashboardResponseSchema,
  mobileErrorResponseSchema,
  mobileMeResponseSchema,
  studentRosterResponseSchema,
  visualPasswordStudentResponseSchema,
  type MobileAssignmentDetailResponse,
  type MobileAssignmentListResponse,
  type MobileAuthResponse,
  type MobileClassResolveResponse,
  type MobileDashboardResponse,
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

const MAX_CACHED_AUDIO_BYTES = 25 * 1024 * 1024;

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

  dashboard(): Promise<MobileDashboardResponse> {
    return this.request(
      '/api/mobile/v1/dashboard',
      {},
      mobileDashboardResponseSchema,
    );
  }

  assignments(): Promise<MobileAssignmentListResponse> {
    return this.request(
      '/api/mobile/v1/assignments',
      {},
      mobileAssignmentListResponseSchema,
    );
  }

  assignment(assignmentId: string): Promise<MobileAssignmentDetailResponse> {
    return this.request(
      `/api/mobile/v1/assignments/${encodeURIComponent(assignmentId)}`,
      {},
      mobileAssignmentDetailResponseSchema,
    );
  }

  async downloadAudio(source: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    const response = source.startsWith('/api/audio/')
      ? await this.authenticatedFetch(source, {})
      : await this.publicMediaFetch(source);

    if (!response.ok) {
      await this.throwResponseError(response);
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_CACHED_AUDIO_BYTES) {
      throw new MobileApiError('This audio file is too large to play.', 413);
    }

    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (contentType && !contentType.startsWith('audio/')) {
      throw new MobileApiError('The server returned an invalid audio file.', 502);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_CACHED_AUDIO_BYTES) {
      throw new MobileApiError('This audio file is too large to play.', 413);
    }

    return {
      bytes: new Uint8Array(buffer),
      contentType: contentType || 'audio/mpeg',
    };
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
    const response = await this.authenticatedFetch(path, init, retry);
    return this.parseResponse(response, schema);
  }

  private async authenticatedFetch(
    path: string,
    init: RequestInit,
    retry = true,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    headers.set('X-App-Version', Constants.expoConfig?.version ?? 'development');
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });

    if (response.status === 401 && retry && (await this.refresh())) {
      return this.authenticatedFetch(path, init, false);
    }
    return response;
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
      this.throwParsedResponseError(response.status, body);
    }

    if (!schema) return body as T;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new MobileApiError('The server returned an unexpected response.', 502);
    }
    return parsed.data;
  }

  private async publicMediaFetch(source: string): Promise<Response> {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new MobileApiError('This audio link is invalid.', 400);
    }
    if (url.protocol !== 'https:') {
      throw new MobileApiError('This audio link is not secure.', 400);
    }
    return fetch(url.toString(), {
      headers: { 'X-App-Version': Constants.expoConfig?.version ?? 'development' },
    });
  }

  private async throwResponseError(response: Response): Promise<never> {
    const body: unknown = await response.json().catch(() => null);
    return this.throwParsedResponseError(response.status, body);
  }

  private throwParsedResponseError(status: number, body: unknown): never {
    const error = mobileErrorResponseSchema.safeParse(body);
    throw new MobileApiError(
      error.success ? error.data.error.message : 'The server could not complete this request.',
      status,
      error.success ? error.data.error.code : undefined,
      error.success ? error.data.error.retryAfterSeconds : undefined,
    );
  }
}

export const mobileApi = new MobileApiClient();
