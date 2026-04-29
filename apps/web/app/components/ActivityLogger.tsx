import { useEffect, useRef } from 'react';
import { useLocation } from '@remix-run/react';

/**
 * Logs merchant app activity to the Activity Log: page opens, refreshes.
 * Activity log is the "everything" log (clicks, requests, outcomes); this handles navigation.
 */
export function ActivityLogger() {
  const location = useLocation();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    const pathname = location.pathname;
    const isFirstRun = previousPathRef.current === null;
    const isReload =
      isFirstRun &&
      typeof performance !== 'undefined' &&
      (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload';

    const action = isReload ? 'PAGE_REFRESHED' : 'PAGE_OPENED';
    previousPathRef.current = pathname;

    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        resource: pathname,
        details: {
          search: location.search || undefined,
          ...(isReload ? { type: 'refresh' } : { type: isFirstRun ? 'initial' : 'navigate' }),
        },
      }),
    }).catch(() => {});
  }, [location.pathname, location.search]);

  return null;
}

/**
 * Call from event handlers to log button/link clicks to Activity Log.
 * Example: onAction={() => { logActivityClick('BUTTON_CLICK', 'Save settings'); save(); }}
 */
export function logActivityClick(
  action: 'BUTTON_CLICK' | 'LINK_CLICK',
  label: string,
  resource?: string,
  details?: Record<string, unknown>
) {
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      resource: resource ?? label,
      details: { label, ...details },
    }),
  }).catch(() => {});
}

/**
 * Log request outcome (success or error) from the client after a fetcher/submit completes.
 * Use in addition to server-side logging for full coverage.
 */
export function logActivityRequestOutcome(
  success: boolean,
  pathOrMethod: string,
  details?: { status?: number; error?: string; [k: string]: unknown }
) {
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: success ? 'REQUEST_SUCCESS' : 'REQUEST_ERROR',
      resource: pathOrMethod,
      details: { outcome: success ? 'success' : 'error', ...details },
    }),
  }).catch(() => {});
}
