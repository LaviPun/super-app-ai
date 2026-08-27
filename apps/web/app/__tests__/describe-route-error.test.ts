import { describe, expect, it } from 'vitest';
import { describeRouteError } from '~/utils/describe-route-error';

describe('describeRouteError', () => {
  it('returns a real Error instance\'s message', () => {
    expect(describeRouteError(new Error('boom'))).toBe('boom');
  });

  it('extracts status/statusText/data from a Remix ErrorResponse (thrown Response)', () => {
    // Matches the shape @remix-run/react's isRouteErrorResponse checks for —
    // this is exactly what a route with no `action` handling a POST throws
    // (see the internal.jobs_.$jobId.tsx replay-button fix this covers).
    const routeErrorResponse = {
      status: 405,
      statusText: 'Method Not Allowed',
      data: "Route \"routes/internal.jobs\" does not have an action",
      error: undefined,
      internal: true,
    };
    expect(describeRouteError(routeErrorResponse)).toBe(
      '405 Method Not Allowed: Route "routes/internal.jobs" does not have an action',
    );
  });

  it('never degrades to the useless literal "[object Object]" for a plain thrown object', () => {
    const result = describeRouteError({ weird: 'shape' });
    expect(result).not.toBe('[object Object]');
    expect(result).toBe('{"weird":"shape"}');
  });

  it('falls back to String() when the value cannot be JSON-serialized (e.g. a circular object)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeRouteError(circular)).not.toThrow();
    expect(describeRouteError(circular)).toBe(String(circular));
  });

  it('handles primitive thrown values', () => {
    expect(describeRouteError('just a string')).toBe('"just a string"');
    expect(describeRouteError(null)).toBe('null');
  });
});
