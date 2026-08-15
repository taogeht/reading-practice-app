export type LoginLinkDestination =
  | { kind: 'student'; token: string }
  | { kind: 'class'; code: string };

export interface LoginLinkOrigins {
  appHost: string | null;
  apiHost: string | null;
}

export function parseLoginDestination(
  value: string,
  origins: LoginLinkOrigins,
): LoginLinkDestination | null {
  try {
    const url = new URL(value.trim());
    const isCustomScheme = url.protocol === 'starlingrise:';
    const isRecognizedWebOrigin =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      (url.host === origins.appHost || url.host === origins.apiHost);
    if (!isCustomScheme && !isRecognizedWebOrigin) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (isCustomScheme && (url.host === 's' || url.host === 'c')) {
      parts.unshift(url.host);
    }

    const credential = parts[1];
    if (parts[0] === 's' && credential && /^[A-Za-z0-9_-]{16,64}$/.test(credential)) {
      return { kind: 'student', token: credential };
    }
    if (parts[0] === 'c' && credential && /^[A-Za-z0-9-]{4,60}$/i.test(credential)) {
      return { kind: 'class', code: credential };
    }
    return null;
  } catch {
    return null;
  }
}
