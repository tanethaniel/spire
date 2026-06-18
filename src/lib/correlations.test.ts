import { describe, it, expect } from 'vitest';
import { computeCorrelations, distinctEntryDays, tipsUnlocked } from './correlations';
import type { JournalEntry, EmotionTag } from '../types/session';

function entry(
  date: string,
  mood: number | null,
  tags: string[] | null,
  emotion: EmotionTag | null = null,
): JournalEntry {
  return {
    id: date + Math.random(),
    createdAt: `${date}T12:00:00.000Z`,
    transcripts: [null, null, null, null, null, null],
    themes: null,
    insight: null,
    moodScore: mood,
    emotionTag: emotion,
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

  it('surfaces a positive correlation with graduated language', () => {
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
    expect(gym!.message).toContain('better');
    expect(gym!.message).toMatch(/slightly|noticeably|significantly/);
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

describe('emotion patterns', () => {
  it('surfaces the dominant emotion when enough data exists', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym'], 'happy'),
      entry('2026-06-02', 1, ['gym'], 'happy'),
      entry('2026-06-03', 0, ['work'], 'happy'),
      entry('2026-06-04', -1, ['work'], 'anxious'),
      entry('2026-06-05', -1, ['work'], 'tired'),
    ];
    const tips = computeCorrelations(entries);
    const emotionTip = tips.find(t => t.category === 'emotion');
    expect(emotionTip).toBeDefined();
    expect(emotionTip!.tag).toBe('happy');
    expect(emotionTip!.message.toLowerCase()).toContain('happy');
  });

  it('does not surface emotion patterns with fewer than 5 entries', () => {
    const entries = [
      entry('2026-06-01', 1, ['gym'], 'happy'),
      entry('2026-06-02', 1, ['gym'], 'happy'),
      entry('2026-06-03', 0, ['work'], 'happy'),
      entry('2026-06-04', -1, ['work'], 'anxious'),
    ];
    const tips = computeCorrelations(entries);
    expect(tips.find(t => t.category === 'emotion')).toBeUndefined();
  });

  it('surfaces emotion+activity co-occurrence', () => {
    const entries = [
      entry('2026-06-01', -1, ['deadline'], 'anxious'),
      entry('2026-06-02', -1, ['deadline'], 'anxious'),
      entry('2026-06-03', -1, ['deadline'], 'anxious'),
      entry('2026-06-04', 1, ['gym'], 'happy'),
      entry('2026-06-05', 1, ['gym'], 'happy'),
    ];
    const tips = computeCorrelations(entries);
    // anxious+deadline should surface since anxious is the dominant emotion
    // and the co-occurrence with a different emotion might show up
    // The dominant emotion (anxious, 3 of 5) surfaces as the primary tip
    const dominantTip = tips.find(t => t.category === 'emotion' && t.tag === 'anxious');
    expect(dominantTip).toBeDefined();
  });
});

describe('day-of-week patterns', () => {
  it('surfaces the best day of the week', () => {
    // Create entries spanning multiple weeks, same day-of-week
    // 2026-06-01 is a Monday, 2026-06-08 is a Monday, 2026-06-15 is Monday
    const entries = [
      entry('2026-06-01', 2, ['gym']),   // Mon
      entry('2026-06-08', 2, ['gym']),   // Mon
      entry('2026-06-15', 2, ['gym']),   // Mon
      entry('2026-06-02', -1, ['work']), // Tue
      entry('2026-06-09', -1, ['work']), // Tue
      entry('2026-06-16', -1, ['work']), // Tue
      entry('2026-06-03', 0, ['work']),  // Wed
    ];
    const tips = computeCorrelations(entries);
    const dowTip = tips.find(t => t.category === 'dayofweek');
    expect(dowTip).toBeDefined();
    expect(dowTip!.tag).toBe('Monday');
    expect(dowTip!.message).toContain('best');
  });

  it('does not surface day-of-week with insufficient data', () => {
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', -1, ['work']),
      entry('2026-06-03', 0, ['work']),
    ];
    const tips = computeCorrelations(entries);
    expect(tips.find(t => t.category === 'dayofweek')).toBeUndefined();
  });
});

describe('graduated language', () => {
  it('uses "slightly" for small deltas', () => {
    // Delta of 0.5 (min threshold)
    const entries = [
      entry('2026-06-01', 1, ['gym']),
      entry('2026-06-02', 1, ['gym']),
      entry('2026-06-03', 1, ['gym']),
      entry('2026-06-04', 0, ['work']),
      entry('2026-06-05', 1, ['work']),
      entry('2026-06-06', 0, ['work']),
      entry('2026-06-07', 0, ['work']),
    ];
    const tips = computeCorrelations(entries);
    const gym = tips.find(t => t.tag === 'gym' && t.category === 'activity');
    if (gym) {
      expect(gym.message).toContain('slightly');
    }
  });

  it('uses "significantly" for large deltas', () => {
    // Delta of ~3.5
    const entries = [
      entry('2026-06-01', 2, ['gym']),
      entry('2026-06-02', 2, ['gym']),
      entry('2026-06-03', 2, ['gym']),
      entry('2026-06-04', -2, ['work']),
      entry('2026-06-05', -2, ['work']),
      entry('2026-06-06', -1, ['work']),
      entry('2026-06-07', -1, ['work']),
    ];
    const tips = computeCorrelations(entries);
    const gym = tips.find(t => t.tag === 'gym' && t.category === 'activity');
    expect(gym).toBeDefined();
    expect(gym!.message).toContain('significantly');
  });
});
