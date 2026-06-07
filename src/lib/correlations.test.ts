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
    emotionTag: null,
    activityTags: tags,
    summary: null,
    keywordTags: null,
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

describe('tag normalization', () => {
  it('merges synonym tags into canonical forms', () => {
    const entries = [
      entry('2026-06-01', 2, ['workout']),
      entry('2026-06-02', 2, ['exercise']),
      entry('2026-06-03', 2, ['gym']),
      entry('2026-06-04', -1, ['work']),
      entry('2026-06-05', -1, ['work']),
      entry('2026-06-06', -1, ['work']),
      entry('2026-06-07', 0, ['work']),
    ];
    const tips = computeCorrelations(entries);
    const gym = tips.find(t => t.tag === 'gym');
    expect(gym).toBeDefined();
    expect(gym!.dayCount).toBe(3);
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

  it('surfaces observational stats for frequent activities', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym', 'coding']),
      entry('2026-06-02', 1, ['gym']),
      entry('2026-06-03', 1, ['gym']),
      entry('2026-06-04', 1, ['coding']),
      entry('2026-06-05', 1, ['coding']),
      entry('2026-06-06', 1, ['reading']),
      entry('2026-06-07', 1, ['reading']),
    ];
    const tips = computeCorrelations(entries);
    const obs = tips.filter(t => t.category === 'observation');
    expect(obs.length).toBeGreaterThan(0);
    const gymObs = obs.find(t => t.tag === 'gym');
    expect(gymObs).toBeDefined();
    expect(gymObs!.dayCount).toBe(3);
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

  it('ignores mood correlations for tags on fewer than 3 days', () => {
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', 2, ['gym']),
      entry('2026-06-03', -1, ['work']),
      entry('2026-06-04', -1, ['work']),
      entry('2026-06-05', -1, ['work']),
      entry('2026-06-06', -1, ['work']),
      entry('2026-06-07', -1, ['work']),
    ];
    const tips = computeCorrelations(entries);
    expect(tips.find(t => t.tag === 'gym' && t.category === 'activity')).toBeUndefined();
  });

  it('suppresses weak mood correlations below the delta threshold', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym']),
      entry('2026-06-02', 1, ['gym']),
      entry('2026-06-03', 1, ['gym']),
      entry('2026-06-04', 1, ['work']),
      entry('2026-06-05', 1, ['work']),
      entry('2026-06-06', 1, ['work']),
      entry('2026-06-07', 1, ['work']),
    ];
    const tips = computeCorrelations(entries);
    expect(tips.find(t => t.category === 'activity')).toBeUndefined();
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
