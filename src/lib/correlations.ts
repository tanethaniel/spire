import type { CorrelationTip, JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';

// Thresholds for surfacing a correlation tip. Conservative on purpose: we only
// want to show patterns the user would actually recognize, not noise.
const MIN_DAYS_PER_TAG = 3;   // a tag must appear on at least this many days
const MIN_MOOD_DELTA = 0.5;   // mood difference (on the -2..+2 scale) to be worth showing
const MAX_TIPS = 3;

// Group entries into a per-day view: a day "has" a tag if any entry that day
// carried it, and the day's mood is the average mood of that day's entries.
interface DaySignal {
  tags: Set<string>;
  moodSum: number;
  moodCount: number;
}

function dayKey(createdAt: string): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDayMap(entries: JournalEntry[]): Map<string, DaySignal> {
  const days = new Map<string, DaySignal>();
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    let day = days.get(key);
    if (!day) {
      day = { tags: new Set(), moodSum: 0, moodCount: 0 };
      days.set(key, day);
    }
    if (e.activityTags) {
      for (const t of e.activityTags) day.tags.add(t);
    }
    if (e.moodScore !== null && e.moodScore !== undefined) {
      day.moodSum += e.moodScore;
      day.moodCount += 1;
    }
  }
  return days;
}

// How many distinct days the user has reflected. Drives the "tips unlock after
// N days" gate.
export function distinctEntryDays(entries: JournalEntry[]): number {
  return buildDayMap(entries).size;
}

export function tipsUnlocked(entries: JournalEntry[]): boolean {
  return distinctEntryDays(entries) >= TIPS_MIN_DAYS;
}

// Compute cross-session correlations between activity tags and mood. Only days
// with a recorded mood count toward the averages. Returns the strongest tips
// first, capped at MAX_TIPS.
export function computeCorrelations(entries: JournalEntry[]): CorrelationTip[] {
  const days = buildDayMap(entries);

  // Only days that actually have a mood reading are usable for correlation.
  const moodDays = [...days.values()].filter(d => d.moodCount > 0)
    .map(d => ({ tags: d.tags, mood: d.moodSum / d.moodCount }));

  if (moodDays.length < TIPS_MIN_DAYS) return [];

  // Collect every tag seen across mood-bearing days.
  const allTags = new Set<string>();
  for (const d of moodDays) for (const t of d.tags) allTags.add(t);

  const tips: CorrelationTip[] = [];
  for (const tag of allTags) {
    const withTag = moodDays.filter(d => d.tags.has(tag));
    const withoutTag = moodDays.filter(d => !d.tags.has(tag));

    // Need enough days both with and without the tag to compare meaningfully.
    if (withTag.length < MIN_DAYS_PER_TAG || withoutTag.length < 1) continue;

    const withAvg = avg(withTag.map(d => d.mood));
    const withoutAvg = avg(withoutTag.map(d => d.mood));
    const delta = withAvg - withoutAvg;
    if (Math.abs(delta) < MIN_MOOD_DELTA) continue;

    tips.push({
      tag,
      withTagAvg: round1(withAvg),
      withoutTagAvg: round1(withoutAvg),
      dayCount: withTag.length,
      message: delta > 0
        ? `You tend to report better moods on days you mention ${tag}.`
        : `Your mood tends to dip on days you mention ${tag}.`,
    });
  }

  tips.sort((a, b) =>
    Math.abs(b.withTagAvg - b.withoutTagAvg) - Math.abs(a.withTagAvg - a.withoutTagAvg));
  return tips.slice(0, MAX_TIPS);
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
