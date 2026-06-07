import type { CorrelationTip, JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';

const MIN_DAYS_PER_TAG = 3;
const MIN_MOOD_DELTA = 0.5;
const MAX_TIPS = 6;
const MAX_PER_CATEGORY = 2;

const TAG_SYNONYMS: Record<string, string> = {
  workout: 'gym', exercise: 'gym', weights: 'gym', lifting: 'gym',
  'weight training': 'gym', 'working out': 'gym', fitness: 'gym',
  jogging: 'running', jog: 'running', run: 'running',
  programming: 'coding', dev: 'coding', development: 'coding',
  'side project': 'coding',
  office: 'work', job: 'work',
  'hanging out': 'friends', socializing: 'friends',
  'family dinner': 'family', parents: 'family',
  calls: 'meetings', standup: 'meetings', 'stand-up': 'meetings',
  book: 'reading', books: 'reading',
  netflix: 'watching', tv: 'watching', movie: 'watching',
};

function normalizeTag(tag: string): string {
  return TAG_SYNONYMS[tag] ?? tag;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
      for (const t of e.activityTags) day.tags.add(normalizeTag(t));
    }
    if (e.keywordTags) {
      for (const t of e.keywordTags) {
        const norm = normalizeTag(t);
        if (!day.keywordTags.includes(norm)) day.keywordTags.push(norm);
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

function deltaWord(absDelta: number): string {
  if (absDelta >= 1.5) return 'significantly';
  if (absDelta >= 1.0) return 'noticeably';
  return 'slightly';
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

    const word = deltaWord(Math.abs(delta));
    tips.push({
      tag,
      withTagAvg: round1(withAvg),
      withoutTagAvg: round1(withoutAvg),
      dayCount: withTag.length,
      category: 'activity',
      message: delta > 0
        ? `Your mood is ${word} better on days with ${tag}.`
        : `Your mood tends to dip ${word} on days with ${tag}.`,
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

    const word = deltaWord(Math.abs(delta));
    const verb = category === 'schedule'
      ? (delta > 0 ? `You tend to feel ${word} better on ${tag} days.` : `Your mood tends to dip ${word} on ${tag} days.`)
      : (delta > 0 ? `You seem ${word} more energized when you have ${tag}.` : `Your mood tends to dip ${word} when you have ${tag}.`);

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
  if (recent.length < 4) return [];

  const tagCounts = new Map<string, number>();
  for (const e of recent) {
    for (const t of e.keywordTags!) {
      const norm = normalizeTag(t);
      if (SCHEDULE_TAGS.has(norm) || SOCIAL_TAGS.has(norm)) continue;
      tagCounts.set(norm, (tagCounts.get(norm) ?? 0) + 1);
    }
  }

  const tips: CorrelationTip[] = [];
  for (const [tag, count] of tagCounts) {
    const ratio = count / recent.length;
    if (ratio >= 0.4 && count >= 3) {
      tips.push({
        tag,
        withTagAvg: 0,
        withoutTagAvg: 0,
        dayCount: count,
        category: 'recurring',
        message: `${tag.charAt(0).toUpperCase() + tag.slice(1)} has come up in ${count} of your last ${recent.length} sessions — it's clearly on your mind.`,
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

  const moodHistory = [...prior, ...recent3].reverse();

  return [{
    tag: 'mood trend',
    withTagAvg: round1(recentAvg),
    withoutTagAvg: round1(priorAvg),
    dayCount: recent3.length + prior.length,
    category: 'trend',
    moodHistory,
    message: delta > 0
      ? 'Your mood has been trending upward recently.'
      : 'Your mood has been dipping a bit recently — take care of yourself.',
  }];
}

const OBSERVATION_SKIP = new Set([
  ...SCHEDULE_TAGS, ...SOCIAL_TAGS,
  'light day', 'quiet day', 'reflective', 'self expression',
  'low energy',
]);

function computeObservationalStats(days: Map<string, DaySignal>): CorrelationTip[] {
  const totalDays = days.size;
  if (totalDays < TIPS_MIN_DAYS) return [];

  const tagDayCount = new Map<string, number>();
  for (const [, day] of days) {
    const allTags = new Set<string>();
    for (const t of day.tags) allTags.add(t);
    for (const t of day.keywordTags) allTags.add(t);

    for (const t of allTags) {
      if (OBSERVATION_SKIP.has(t)) continue;
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
      totalDays,
      category: 'observation',
      message,
    });
  }

  return tips.slice(0, 3);
}

function computeEmotionPatterns(entries: JournalEntry[]): CorrelationTip[] {
  const withEmotion = entries.filter(e => e.emotionTag);
  if (withEmotion.length < 5) return [];

  const emotionCounts = new Map<string, number>();
  for (const e of withEmotion) {
    emotionCounts.set(e.emotionTag!, (emotionCounts.get(e.emotionTag!) ?? 0) + 1);
  }

  const tips: CorrelationTip[] = [];

  let topEmotion = '';
  let topCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > topCount) { topEmotion = emotion; topCount = count; }
  }

  if (topCount >= 3) {
    const ratio = topCount / withEmotion.length;
    const msg = ratio >= 0.5
      ? `${topEmotion.charAt(0).toUpperCase() + topEmotion.slice(1)} is your most common feeling — ${topCount} of your last ${withEmotion.length} sessions.`
      : `You've felt ${topEmotion} in ${topCount} of your last ${withEmotion.length} sessions.`;

    tips.push({
      tag: topEmotion,
      withTagAvg: round1(ratio),
      withoutTagAvg: 0,
      dayCount: topCount,
      category: 'emotion',
      message: msg,
    });
  }

  const emotionActivityPairs = new Map<string, Map<string, number>>();
  for (const e of withEmotion) {
    if (!e.activityTags || e.activityTags.length === 0) continue;
    const emotion = e.emotionTag!;
    if (!emotionActivityPairs.has(emotion)) emotionActivityPairs.set(emotion, new Map());
    const actMap = emotionActivityPairs.get(emotion)!;
    for (const act of e.activityTags) {
      actMap.set(act, (actMap.get(act) ?? 0) + 1);
    }
  }

  for (const [emotion, actMap] of emotionActivityPairs) {
    if (emotion === topEmotion && tips.length > 0) continue;
    let bestAct = '';
    let bestCount = 0;
    for (const [act, count] of actMap) {
      if (count > bestCount) { bestAct = act; bestCount = count; }
    }
    if (bestCount >= 3) {
      tips.push({
        tag: `${emotion}+${bestAct}`,
        withTagAvg: bestCount,
        withoutTagAvg: 0,
        dayCount: bestCount,
        category: 'emotion',
        message: `You tend to feel ${emotion} most often on days with ${bestAct}.`,
      });
    }
  }

  return tips.slice(0, 2);
}

function computeDayOfWeekTips(entries: JournalEntry[]): CorrelationTip[] {
  const withMood = entries.filter(e => e.moodScore !== null);
  if (withMood.length < 7) return [];

  const byDow: { sum: number; count: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const e of withMood) {
    const dow = (new Date(e.createdAt).getDay() + 6) % 7; // 0=Mon, 6=Sun
    byDow[dow].sum += e.moodScore!;
    byDow[dow].count += 1;
  }

  const overallAvg = avg(withMood.map(e => e.moodScore!));

  let bestDow = -1, bestDelta = 0;
  let worstDow = -1, worstDelta = 0;

  for (let i = 0; i < 7; i++) {
    if (byDow[i].count < 3) continue;
    const dayAvg = byDow[i].sum / byDow[i].count;
    const delta = dayAvg - overallAvg;
    if (delta > bestDelta) { bestDow = i; bestDelta = delta; }
    if (delta < worstDelta) { worstDow = i; worstDelta = delta; }
  }

  const tips: CorrelationTip[] = [];

  if (bestDow >= 0 && bestDelta >= MIN_MOOD_DELTA) {
    const dayAvg = byDow[bestDow].sum / byDow[bestDow].count;
    tips.push({
      tag: DAY_NAMES[bestDow],
      withTagAvg: round1(dayAvg),
      withoutTagAvg: round1(overallAvg),
      dayCount: byDow[bestDow].count,
      category: 'dayofweek',
      message: `${DAY_NAMES[bestDow]}s tend to be your best days.`,
    });
  }

  if (worstDow >= 0 && Math.abs(worstDelta) >= MIN_MOOD_DELTA && tips.length === 0) {
    const dayAvg = byDow[worstDow].sum / byDow[worstDow].count;
    tips.push({
      tag: DAY_NAMES[worstDow],
      withTagAvg: round1(dayAvg),
      withoutTagAvg: round1(overallAvg),
      dayCount: byDow[worstDow].count,
      category: 'dayofweek',
      message: `${DAY_NAMES[worstDow]}s tend to be your toughest days.`,
    });
  }

  return tips;
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
  tips.push(...computeEmotionPatterns(entries));
  tips.push(...computeDayOfWeekTips(entries));

  return diverseTopN(tips, MAX_TIPS);
}
