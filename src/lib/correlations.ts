import type { CorrelationTip, JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';

const MIN_DAYS_PER_TAG = 3;
const MIN_MOOD_DELTA = 0.5;
const MAX_TIPS = 6;
const MAX_PER_CATEGORY = 2;

interface DaySignal {
  tags: Set<string>;
  keywordTags: string[];
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
      day = { tags: new Set(), keywordTags: [], moodSum: 0, moodCount: 0 };
      days.set(key, day);
    }
    if (e.activityTags) {
      for (const t of e.activityTags) day.tags.add(t);
    }
    if (e.keywordTags) {
      for (const t of e.keywordTags) {
        if (!day.keywordTags.includes(t)) day.keywordTags.push(t);
      }
    }
    if (e.moodScore !== null && e.moodScore !== undefined) {
      day.moodSum += e.moodScore;
      day.moodCount += 1;
    }
  }
  return days;
}

export function distinctEntryDays(entries: JournalEntry[]): number {
  return buildDayMap(entries).size;
}

export function tipsUnlocked(entries: JournalEntry[]): boolean {
  return distinctEntryDays(entries) >= TIPS_MIN_DAYS;
}

interface MoodDay {
  tags: Set<string>;
  keywordTags: string[];
  mood: number;
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeActivityMoodTips(moodDays: MoodDay[]): CorrelationTip[] {
  const allTags = new Set<string>();
  for (const d of moodDays) for (const t of d.tags) allTags.add(t);

  const tips: CorrelationTip[] = [];
  for (const tag of allTags) {
    const withTag = moodDays.filter(d => d.tags.has(tag));
    const withoutTag = moodDays.filter(d => !d.tags.has(tag));
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
      category: 'activity',
      message: delta > 0
        ? `You tend to report better moods on days you mention ${tag}.`
        : `Your mood tends to dip on days you mention ${tag}.`,
    });
  }
  return tips;
}

const SCHEDULE_TAGS = new Set(['busy', 'packed', 'balanced', 'light', 'light day', 'rushed', 'relaxed day', 'full day']);
const SOCIAL_TAGS = new Set(['alone', 'with friends', 'family time', 'solo', 'social', 'coworkers', 'partner']);

function computeKeywordMoodTips(
  moodDays: MoodDay[],
  filterTags: Set<string>,
  category: 'schedule' | 'social',
): CorrelationTip[] {
  const tips: CorrelationTip[] = [];
  for (const tag of filterTags) {
    const withTag = moodDays.filter(d => d.keywordTags.includes(tag));
    const withoutTag = moodDays.filter(d => !d.keywordTags.includes(tag));
    if (withTag.length < MIN_DAYS_PER_TAG || withoutTag.length < 1) continue;

    const withAvg = avg(withTag.map(d => d.mood));
    const withoutAvg = avg(withoutTag.map(d => d.mood));
    const delta = withAvg - withoutAvg;
    if (Math.abs(delta) < MIN_MOOD_DELTA) continue;

    const verb = category === 'schedule'
      ? (delta > 0 ? `You tend to feel better on ${tag} days.` : `Your mood tends to dip on ${tag} days.`)
      : (delta > 0 ? `You seem more energized when you have ${tag}.` : `Your mood tends to dip when you have ${tag}.`);

    tips.push({
      tag,
      withTagAvg: round1(withAvg),
      withoutTagAvg: round1(withoutAvg),
      dayCount: withTag.length,
      category,
      message: verb,
    });
  }
  return tips;
}

function computeRecurringTopics(entries: JournalEntry[]): CorrelationTip[] {
  const recent = entries
    .filter(e => e.keywordTags && e.keywordTags.length > 0)
    .slice(0, 10);
  if (recent.length < 5) return [];

  const tagCounts = new Map<string, number>();
  for (const e of recent) {
    for (const t of e.keywordTags!) {
      if (SCHEDULE_TAGS.has(t) || SOCIAL_TAGS.has(t)) continue;
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const tips: CorrelationTip[] = [];
  for (const [tag, count] of tagCounts) {
    const ratio = count / recent.length;
    if (ratio >= 0.6 && count >= 3) {
      tips.push({
        tag,
        withTagAvg: 0,
        withoutTagAvg: 0,
        dayCount: count,
        category: 'recurring',
        message: `${tag.charAt(0).toUpperCase() + tag.slice(1)} has come up in ${count} of your last ${recent.length} sessions.`,
      });
    }
  }
  return tips.sort((a, b) => b.dayCount - a.dayCount).slice(0, 2);
}

function computeSentimentTrend(entries: JournalEntry[]): CorrelationTip[] {
  const recentWithMood = entries
    .filter(e => e.moodScore !== null)
    .slice(0, 14);
  if (recentWithMood.length < 6) return [];

  const recent3 = recentWithMood.slice(0, 3).map(e => e.moodScore!);
  const prior = recentWithMood.slice(3, 10).map(e => e.moodScore!);
  if (prior.length < 3) return [];

  const recentAvg = avg(recent3);
  const priorAvg = avg(prior);
  const delta = recentAvg - priorAvg;

  if (Math.abs(delta) < MIN_MOOD_DELTA) return [];

  return [{
    tag: 'mood trend',
    withTagAvg: round1(recentAvg),
    withoutTagAvg: round1(priorAvg),
    dayCount: recent3.length + prior.length,
    category: 'trend',
    message: delta > 0
      ? 'Your mood has been trending upward recently.'
      : 'Your mood has been dipping a bit recently — take care of yourself.',
  }];
}

function computeObservationalStats(days: Map<string, DaySignal>): CorrelationTip[] {
  const totalDays = days.size;
  if (totalDays < TIPS_MIN_DAYS) return [];

  const tagDayCount = new Map<string, number>();
  for (const [, day] of days) {
    for (const t of day.tags) {
      tagDayCount.set(t, (tagDayCount.get(t) ?? 0) + 1);
    }
  }

  const tips: CorrelationTip[] = [];
  const sorted = [...tagDayCount.entries()].sort((a, b) => b[1] - a[1]);

  for (const [tag, count] of sorted) {
    if (count < 2) continue;
    const pct = Math.round((count / totalDays) * 100);

    let message: string;
    if (pct >= 70) {
      message = `${tag.charAt(0).toUpperCase() + tag.slice(1)} has been part of most of your days — ${count} out of ${totalDays}.`;
    } else if (pct >= 40) {
      message = `You had ${tag} on ${count} of your last ${totalDays} days.`;
    } else {
      message = `${tag.charAt(0).toUpperCase() + tag.slice(1)} showed up ${count} time${count > 1 ? 's' : ''} in the last ${totalDays} days.`;
    }

    tips.push({
      tag,
      withTagAvg: 0,
      withoutTagAvg: 0,
      dayCount: count,
      category: 'observation',
      message,
    });
  }

  return tips.slice(0, 3);
}

function diverseTopN(tips: CorrelationTip[], max: number): CorrelationTip[] {
  const byCategory = new Map<string, CorrelationTip[]>();
  for (const tip of tips) {
    const cat = tip.category ?? 'activity';
    const list = byCategory.get(cat) ?? [];
    list.push(tip);
    byCategory.set(cat, list);
  }

  for (const [, list] of byCategory) {
    list.sort((a, b) =>
      Math.abs(b.withTagAvg - b.withoutTagAvg) - Math.abs(a.withTagAvg - a.withoutTagAvg));
  }

  const result: CorrelationTip[] = [];
  const catCounts = new Map<string, number>();
  const categories = [...byCategory.keys()];
  let round = 0;

  while (result.length < max) {
    let added = false;
    for (const cat of categories) {
      if (result.length >= max) break;
      const count = catCounts.get(cat) ?? 0;
      if (count >= MAX_PER_CATEGORY) continue;
      const list = byCategory.get(cat)!;
      if (count < list.length) {
        result.push(list[count]);
        catCounts.set(cat, count + 1);
        added = true;
      }
    }
    if (!added) break;
    round++;
    if (round > 10) break;
  }

  return result;
}

export function computeCorrelations(entries: JournalEntry[]): CorrelationTip[] {
  const days = buildDayMap(entries);

  const moodDays: MoodDay[] = [...days.values()]
    .filter(d => d.moodCount > 0)
    .map(d => ({ tags: d.tags, keywordTags: d.keywordTags, mood: d.moodSum / d.moodCount }));

  const tips: CorrelationTip[] = [];

  if (moodDays.length >= TIPS_MIN_DAYS) {
    tips.push(...computeActivityMoodTips(moodDays));
    tips.push(...computeKeywordMoodTips(moodDays, SCHEDULE_TAGS, 'schedule'));
    tips.push(...computeKeywordMoodTips(moodDays, SOCIAL_TAGS, 'social'));
  }

  tips.push(...computeObservationalStats(days));
  tips.push(...computeRecurringTopics(entries));
  tips.push(...computeSentimentTrend(entries));

  return diverseTopN(tips, MAX_TIPS);
}
