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
 * Sanitizes error objects to remove sensitive information
 * while preserving useful debugging information
 */
export function sanitizeError(error: unknown, context?: string): SanitizedError {
  const timestamp = new Date().toISOString();

  if (error instanceof Error) {
    // Remove potentially sensitive information from error messages
    let sanitizedMessage = error.message;

    // Remove database connection details
    if (sanitizedMessage.includes('connection')) {
      sanitizedMessage = 'Database connection error occurred';
    }

    // Remove file path information
    if (sanitizedMessage.includes('/') || sanitizedMessage.includes('\\')) {
      sanitizedMessage = 'File system error occurred';
    }

    // Remove SQL details but keep general query info
    if (sanitizedMessage.includes('SQL') || sanitizedMessage.includes('query')) {
      sanitizedMessage = 'Database query error occurred';
    }

    // Remove environment variable references
    if (sanitizedMessage.includes('process.env') || sanitizedMessage.includes('NODE_ENV')) {
      sanitizedMessage = 'Environment configuration error';
    }

    return {
      message: sanitizedMessage,
      name: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp,
      context
    };
  }

  // Handle non-Error objects
  return {
    message: 'Unknown error occurred',
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

  if (process.env.NODE_ENV === 'development') {
    // In development, log more details for debugging
    console.error(`[${sanitized.timestamp}] ${context ? `[${context}] ` : ''}${sanitized.name}: ${sanitized.message}`);
    if (sanitized.stack) {
      console.error(sanitized.stack);
    }
  } else {
    // In production, log minimal safe information
    console.error(`[${sanitized.timestamp}] ${context ? `[${context}] ` : ''}Error: ${sanitized.message}`);
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