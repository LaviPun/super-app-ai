import { isRouteErrorResponse } from '@remix-run/react';

/**
 * Route errors reaching an ErrorBoundary aren't always a real `Error`
 * instance: a thrown `Response` (e.g. a route with no `action` receiving a
 * POST — see the internal.jobs_.$jobId.tsx replay-button fix) surfaces here
 * as Remix's `ErrorResponse` object instead. `String(nonErrorObject)`
 * degrades to the literal string "[object Object]", which is what showed up
 * gutting the Error Log's `message` column for exactly that bug — reported,
 * but useless for diagnosis. Extract the real status/statusText/data in that
 * case instead of falling through to `String()`.
 */
export function describeRouteError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRouteErrorResponse(error)) {
    const data = typeof error.data === 'string' ? error.data : JSON.stringify(error.data);
    return `${error.status} ${error.statusText}${data ? ': ' + data : ''}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
