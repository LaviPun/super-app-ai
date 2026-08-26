import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  relativeTime,
  relativeTimeFloor,
  relativeTimeHourly,
  relativeTimeVerbose,
} from '~/utils/relative-time';

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function agoMs(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe('relativeTime (minute → hour → day, rounded)', () => {
  it('returns the default fallback for null/undefined', () => {
    expect(relativeTime(null)).toBe('never');
    expect(relativeTime(undefined)).toBe('never');
  });

  it('returns a custom fallback for null/undefined', () => {
    expect(relativeTime(null, '—')).toBe('—');
    expect(relativeTime(undefined, '—')).toBe('—');
  });

  it('returns the fallback for an unparseable date string', () => {
    expect(relativeTime('not-a-date')).toBe('never');
    expect(relativeTime('not-a-date', '—')).toBe('—');
  });

  it('formats under a minute as "just now"', () => {
    expect(relativeTime(agoMs(20_000))).toBe('just now');
  });

  it('formats minute boundaries', () => {
    expect(relativeTime(agoMs(60_000))).toBe('1m ago');
    expect(relativeTime(agoMs(59 * 60_000))).toBe('59m ago');
  });

  it('formats hour boundaries', () => {
    expect(relativeTime(agoMs(60 * 60_000))).toBe('1h ago');
    expect(relativeTime(agoMs(23 * 60 * 60_000))).toBe('23h ago');
  });

  it('formats day boundaries', () => {
    expect(relativeTime(agoMs(24 * 60 * 60_000))).toBe('1d ago');
    expect(relativeTime(agoMs(3 * 24 * 60 * 60_000))).toBe('3d ago');
  });

  it('accepts both Date objects and ISO strings', () => {
    const d = new Date(NOW - 5 * 60_000);
    expect(relativeTime(d)).toBe('5m ago');
    expect(relativeTime(d.toISOString())).toBe('5m ago');
  });
});

describe('relativeTimeHourly (hour → day only, rounded, no minute bucket)', () => {
  it('returns the fallback for null and unparseable input', () => {
    expect(relativeTimeHourly(null)).toBe('never');
    expect(relativeTimeHourly(null, 'untested')).toBe('untested');
    expect(relativeTimeHourly('nope')).toBe('never');
  });

  it('reads sub-30-minute diffs as "just now" (no minute granularity)', () => {
    expect(relativeTimeHourly(agoMs(20 * 60_000))).toBe('just now');
  });

  it('rounds a 45-minute diff up to "1h ago"', () => {
    expect(relativeTimeHourly(agoMs(45 * 60_000))).toBe('1h ago');
  });

  it('formats day boundaries', () => {
    expect(relativeTimeHourly(agoMs(24 * 60 * 60_000))).toBe('1d ago');
  });
});

describe('relativeTimeFloor (second → minute → hour → day, floored)', () => {
  it('returns the fallback for null/undefined', () => {
    expect(relativeTimeFloor(null)).toBe('never');
    expect(relativeTimeFloor(null, '—')).toBe('—');
    expect(relativeTimeFloor(undefined, '—')).toBe('—');
  });

  it('formats under a minute as "just now"', () => {
    expect(relativeTimeFloor(agoMs(59_000))).toBe('just now');
  });

  it('floors (not rounds) minute/hour/day buckets', () => {
    expect(relativeTimeFloor(agoMs(119_000))).toBe('1m ago'); // 1m59s -> floor to 1m, not round to 2m
    expect(relativeTimeFloor(agoMs(3599 * 1000))).toBe('59m ago');
    expect(relativeTimeFloor(agoMs(3600 * 1000))).toBe('1h ago');
    expect(relativeTimeFloor(agoMs(86399 * 1000))).toBe('23h ago');
    expect(relativeTimeFloor(agoMs(86400 * 1000))).toBe('1d ago');
  });
});

describe('relativeTimeVerbose (second → minute → hour → day, rounded, "Yesterday")', () => {
  it('returns the fallback for null/undefined', () => {
    expect(relativeTimeVerbose(null)).toBe('never');
    expect(relativeTimeVerbose(undefined)).toBe('never');
  });

  it('formats seconds', () => {
    expect(relativeTimeVerbose(agoMs(1_000))).toBe('1s ago');
    expect(relativeTimeVerbose(agoMs(59_000))).toBe('59s ago');
  });

  it('formats minute/hour boundaries', () => {
    expect(relativeTimeVerbose(agoMs(60_000))).toBe('1m ago');
    expect(relativeTimeVerbose(agoMs(60 * 60_000))).toBe('1h ago');
  });

  it('special-cases exactly 1 day as "Yesterday"', () => {
    expect(relativeTimeVerbose(agoMs(24 * 60 * 60_000))).toBe('Yesterday');
  });

  it('formats multi-day diffs numerically', () => {
    expect(relativeTimeVerbose(agoMs(3 * 24 * 60 * 60_000))).toBe('3d ago');
  });

  it('accepts both Date objects and ISO strings', () => {
    const d = new Date(NOW - 5 * 60_000);
    expect(relativeTimeVerbose(d)).toBe('5m ago');
    expect(relativeTimeVerbose(d.toISOString())).toBe('5m ago');
  });
});
