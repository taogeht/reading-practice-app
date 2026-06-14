/**
 * Secure logging utility to prevent sensitive information disclosure
 */

interface SanitizedError {
  message: string;
  name: string;
  stack?: string;
  timestamp: string;
  context?: string;
}

/**
 * Redacts only genuine secrets (embedded credentials, key=value secret pairs)
 * from a string, leaving the rest of the message intact. These logs go to the
 * server console only — never to a client — so the goal is a readable,
 * debuggable message with credentials masked, NOT a blanket rewrite.
 */
function redactSecrets(input: string): string {
  return (
    input
      // Credentials embedded in a URI: scheme://user:password@host → scheme://user:***@host
      .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, '$1:***@')
      // key=value / key: value secrets (password, secret, token, api key, auth header)
      .replace(
        /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer)\b(\s*[=:]\s*)('?[^\s'"&,}]+)/gi,
        '$1$2***',
      )
  );
}

/**
 * Normalizes an error into a structured, debuggable shape. Preserves the real
 * message, name, and stack (with secrets redacted) — earlier versions replaced
 * any message containing a "/", "connection", "SQL", etc. with a generic
 * string, which destroyed nearly every real error and made prod un-debuggable.
 */
export function sanitizeError(error: unknown, context?: string): SanitizedError {
  const timestamp = new Date().toISOString();

  if (error instanceof Error) {
    return {
      message: redactSecrets(error.message),
      name: error.name,
      stack: error.stack ? redactSecrets(error.stack) : undefined,
      timestamp,
      context
    };
  }

  // Handle non-Error throwables (strings, objects) without losing what they say.
  let message: string;
  try {
    message = typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    message = String(error);
  }
  return {
    message: redactSecrets(message ?? 'Unknown error occurred'),
    name: 'UnknownError',
    timestamp,
    context
  };
}

/**
 * Securely logs errors without exposing sensitive information
 */
export function logError(error: unknown, context?: string): void {
  const sanitized = sanitizeError(error, context);
  const prefix = `[${sanitized.timestamp}] ${context ? `[${context}] ` : ''}`;

  // Log the real message + stack in every environment (secrets are already
  // redacted). These are server-side logs on a long-running container — losing
  // the stack in prod is exactly what made past incidents hard to diagnose.
  console.error(`${prefix}${sanitized.name}: ${sanitized.message}`);
  if (sanitized.stack) {
    console.error(sanitized.stack);
  }
}

/**
 * Logs informational messages
 */
export function logInfo(message: string, context?: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${context ? `[${context}] ` : ''}${message}`);
}

/**
 * Logs warning messages
 */
export function logWarning(message: string, context?: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] ${context ? `[${context}] ` : ''}${message}`);
}

/**
 * Creates a request context string for logging
 */
export function createRequestContext(method: string, url: string, userRole?: string): string {
  return `${method} ${url}${userRole ? ` (${userRole})` : ''}`;
}