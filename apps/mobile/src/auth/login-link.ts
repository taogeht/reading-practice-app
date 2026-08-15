import Constants from 'expo-constants';
import {
  parseLoginDestination,
  type LoginLinkDestination,
} from '@/auth/login-link-core';

export function loginDestinationFromLink(value: string): LoginLinkDestination | null {
  try {
    const configuredHost = Constants.expoConfig?.extra?.appHost;
    const apiUrl = Constants.expoConfig?.extra?.apiUrl;
    const apiHost = typeof apiUrl === 'string' ? new URL(apiUrl).host : null;
    return parseLoginDestination(value, {
      appHost: typeof configuredHost === 'string' ? configuredHost : null,
      apiHost,
    });
  } catch {
    return null;
  }
}

export type { LoginLinkDestination } from '@/auth/login-link-core';
