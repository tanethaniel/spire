import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dayKey, currentStreak } from './stats';

describe('dayKey', () => {
  it('formats dates as YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-06-05T14:30:00Z'))).toBe('2026-06-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(dayKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('currentStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when no entries exist', () => {
    vi.setSystemTime(new Date('2026-06-06T20:00:00'));
    expect(currentStreak(new Set())).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    vi.setSystemTime(new Date('2026-06-06T20:00:00'));
    const days = new Set(['2026-06-04', '2026-06-05', '2026-06-06']);
    expect(currentStreak(days)).toBe(3);
  });

  it('allows today to be empty (grace period)', () => {
    vi.setSystemTime(new Date('2026-06-06T10:00:00'));
    const days = new Set(['2026-06-04', '2026-06-05']);
    expect(currentStreak(days)).toBe(2);
  });

  it('breaks on a gap', () => {
    vi.setSystemTime(new Date('2026-06-06T20:00:00'));
    const days = new Set(['2026-06-03', '2026-06-05', '2026-06-06']);
    expect(currentStreak(days)).toBe(2);
  });

  it('returns 1 for a single entry today', () => {
    vi.setSystemTime(new Date('2026-06-06T20:00:00'));
    const days = new Set(['2026-06-06']);
    expect(currentStreak(days)).toBe(1);
  });

  it('returns 0 when last entry was 2+ days ago', () => {
    vi.setSystemTime(new Date('2026-06-06T20:00:00'));
    const days = new Set(['2026-06-04']);
    expect(currentStreak(days)).toBe(0);
  });
});
