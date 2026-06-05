import { describe, it, expect } from 'vitest';
import { computeCorrelations, distinctEntryDays, tipsUnlocked } from './correlations';
import type { JournalEntry } from '../types/session';

// Minimal entry factory — only the fields correlation cares about.
function entry(date: string, mood: number | null, tags: string[] | null): JournalEntry {
  return {
    id: date + Math.random(),
    createdAt: `${date}T12:00:00.000Z`,
    transcripts: [null, null, null, null, null, null],
    themes: null,
    insight: null,
    moodScore: mood,
    activityTags: tags,
    eventContext: null,
    durationMs: null,
  };
}

describe('distinctEntryDays', () => {
  it('collapses multiple sessions on the same day into one day', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym']),
      entry('2026-06-01', 2, ['work']),
      entry('2026-06-02', 0, ['work']),
    ];
    expect(distinctEntryDays(entries)).toBe(2);
  });

  it('returns 0 for no entries', () => {
    expect(distinctEntryDays([])).toBe(0);
  });
});

describe('tipsUnlocked', () => {
  it('is locked below 7 distinct days', () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry(`2026-06-0${i + 1}`, 1, ['gym']));
    expect(tipsUnlocked(entries)).toBe(false);
  });

  it('unlocks at 7 distinct days', () => {
    const entries = Array.from({ length: 7 }, (_, i) =>
      entry(`2026-06-0${i + 1}`, 1, ['gym']));
    expect(tipsUnlocked(entries)).toBe(true);
  });
});

describe('computeCorrelations', () => {
  it('returns nothing before the minimum days are reached', () => {
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', -2, []),
    ];
    expect(computeCorrelations(entries)).toEqual([]);
  });

  it('surfaces a positive correlation when gym days have clearly better moods', () => {
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', 2, ['gym']),
      entry('2026-06-03', 2, ['gym']),
      entry('2026-06-04', -1, ['work']),
      entry('2026-06-05', -1, ['work']),
      entry('2026-06-06', -1, ['work']),
      entry('2026-06-07', 0, ['work']),
    ];
    const tips = computeCorrelations(entries);
    const gym = tips.find(t => t.tag === 'gym');
    expect(gym).toBeDefined();
    expect(gym!.message).toContain('better moods');
    expect(gym!.withTagAvg).toBeGreaterThan(gym!.withoutTagAvg);
    expect(gym!.dayCount).toBe(3);
  });

  it('surfaces a negative correlation when a tag tracks worse moods', () => {
    const entries = [
      entry('2026-06-01', -2, ['deadline']),
      entry('2026-06-02', -2, ['deadline']),
      entry('2026-06-03', -2, ['deadline']),
      entry('2026-06-04', 2, ['friends']),
      entry('2026-06-05', 2, ['friends']),
      entry('2026-06-06', 1, ['friends']),
      entry('2026-06-07', 1, ['friends']),
    ];
    const tips = computeCorrelations(entries);
    const deadline = tips.find(t => t.tag === 'deadline');
    expect(deadline).toBeDefined();
    expect(deadline!.message).toContain('dip');
  });

  it('ignores tags that appear on fewer than 3 days', () => {
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', 2, ['gym']),
      entry('2026-06-03', -1, ['work']),
      entry('2026-06-04', -1, ['work']),
      entry('2026-06-05', -1, ['work']),
      entry('2026-06-06', -1, ['work']),
      entry('2026-06-07', -1, ['work']),
    ];
    // gym only appears on 2 days → no tip for gym
    const tips = computeCorrelations(entries);
    expect(tips.find(t => t.tag === 'gym')).toBeUndefined();
  });

  it('suppresses weak correlations below the mood-delta threshold', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym']),
      entry('2026-06-02', 1, ['gym']),
      entry('2026-06-03', 1, ['gym']),
      entry('2026-06-04', 1, ['work']),
      entry('2026-06-05', 1, ['work']),
      entry('2026-06-06', 1, ['work']),
      entry('2026-06-07', 1, ['work']),
    ];
    // identical moods → delta 0 → no tips
    expect(computeCorrelations(entries)).toEqual([]);
  });

  it('skips days with no mood reading without crashing', () => {
    const entries = [
      entry('2026-06-01', null, ['gym']),
      entry('2026-06-02', 2, ['gym']),
      entry('2026-06-03', 2, ['gym']),
      entry('2026-06-04', 2, ['gym']),
      entry('2026-06-05', -2, ['work']),
      entry('2026-06-06', -2, ['work']),
      entry('2026-06-07', -2, ['work']),
      entry('2026-06-08', -2, ['work']),
    ];
    expect(() => computeCorrelations(entries)).not.toThrow();
  });
});
