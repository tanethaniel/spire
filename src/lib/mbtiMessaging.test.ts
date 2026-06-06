import { describe, it, expect } from 'vitest';
import { applyMbtiFlavor } from './mbtiMessaging';
import type { CorrelationTip } from '../types/session';

function tip(overrides: Partial<CorrelationTip> = {}): CorrelationTip {
  return {
    tag: 'gym',
    message: 'default message',
    withTagAvg: 1.5,
    withoutTagAvg: 0.5,
    dayCount: 4,
    category: 'activity',
    ...overrides,
  };
}

describe('applyMbtiFlavor', () => {
  it('returns tips unchanged when mbti is null-length', () => {
    const tips = [tip()];
    expect(applyMbtiFlavor(tips, '')).toEqual(tips);
  });

  it('returns tips unchanged for invalid mbti (wrong letters)', () => {
    const tips = [tip()];
    expect(applyMbtiFlavor(tips, 'XXXX')).toEqual(tips);
  });

  it('returns tips unchanged for mbti shorter than 4 chars', () => {
    const tips = [tip()];
    expect(applyMbtiFlavor(tips, 'INT')).toEqual(tips);
  });

  it('does not mutate the input array', () => {
    const original = tip();
    const tips = [original];
    const result = applyMbtiFlavor(tips, 'INTJ');
    expect(tips[0].message).toBe('default message');
    expect(result[0]).not.toBe(original);
  });

  // Activity tips: S/N × T/F
  it('flavors activity tips for S+T (concrete data)', () => {
    const result = applyMbtiFlavor([tip()], 'ISTJ');
    expect(result[0].message).toContain('averaged');
  });

  it('flavors activity tips for N+F (nourishing)', () => {
    const result = applyMbtiFlavor([tip()], 'INFP');
    expect(result[0].message).toContain('nourishes');
  });

  it('flavors activity tips for N+T (pattern)', () => {
    const result = applyMbtiFlavor([tip()], 'INTP');
    expect(result[0].message).toContain('pattern');
  });

  it('flavors negative activity tips for S+F', () => {
    const result = applyMbtiFlavor([tip({ withTagAvg: -1, withoutTagAvg: 1 })], 'ISFJ');
    expect(result[0].message).toContain('weigh on you');
  });

  // Schedule tips: J/P
  it('flavors schedule tips for J (structure)', () => {
    const result = applyMbtiFlavor([tip({ category: 'schedule', tag: 'balanced' })], 'INTJ');
    expect(result[0].message).toContain('structure');
  });

  it('flavors schedule tips for P (breathing room) on negative', () => {
    const result = applyMbtiFlavor([tip({ category: 'schedule', tag: 'busy', withTagAvg: -1, withoutTagAvg: 1 })], 'INTP');
    expect(result[0].message).toContain('breathing room');
  });

  // Social tips: E/I
  it('flavors social tips for E (charges batteries)', () => {
    const result = applyMbtiFlavor([tip({ category: 'social', tag: 'with friends' })], 'ENFP');
    expect(result[0].message).toContain('charges your batteries');
  });

  it('flavors social tips for I on negative (social energy)', () => {
    const result = applyMbtiFlavor([tip({ category: 'social', tag: 'with friends', withTagAvg: -1, withoutTagAvg: 1 })], 'INTJ');
    expect(result[0].message).toContain('social energy');
  });

  // Recurring tips: S/N
  it('flavors recurring tips for S (concrete trend)', () => {
    const result = applyMbtiFlavor([tip({ category: 'recurring', tag: 'work pressure', dayCount: 4 })], 'ISTJ');
    expect(result[0].message).toContain('concrete trend');
  });

  it('flavors recurring tips for N (working through something)', () => {
    const result = applyMbtiFlavor([tip({ category: 'recurring', tag: 'work pressure', dayCount: 4 })], 'INFJ');
    expect(result[0].message).toContain('working through something');
  });

  // Trend tips: T/F
  it('flavors upward trend for T (measurably higher)', () => {
    const result = applyMbtiFlavor([tip({ category: 'trend', tag: 'mood trend' })], 'INTJ');
    expect(result[0].message).toContain('measurably higher');
  });

  it('flavors downward trend for F (be kind)', () => {
    const result = applyMbtiFlavor([tip({ category: 'trend', tag: 'mood trend', withTagAvg: -1, withoutTagAvg: 1 })], 'INFP');
    expect(result[0].message).toContain('be kind');
  });

  // Mixed tips array
  it('handles multiple tip categories in one call', () => {
    const tips = [
      tip({ category: 'activity', tag: 'gym' }),
      tip({ category: 'social', tag: 'alone', withTagAvg: -0.5, withoutTagAvg: 1 }),
      tip({ category: 'trend', tag: 'mood trend' }),
    ];
    const result = applyMbtiFlavor(tips, 'ENFJ');
    expect(result).toHaveLength(3);
    expect(result[0].message).not.toBe('default message');
    expect(result[1].message).not.toBe('default message');
    expect(result[2].message).not.toBe('default message');
  });

  it('handles empty tips array', () => {
    expect(applyMbtiFlavor([], 'INTJ')).toEqual([]);
  });

  it('is case-insensitive for mbti input', () => {
    const result = applyMbtiFlavor([tip()], 'intj');
    expect(result[0].message).toContain('pattern');
  });
});
