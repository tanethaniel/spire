import type { CorrelationTip } from '../types/session';

interface MbtiDimensions {
  energy: 'E' | 'I';
  info: 'S' | 'N';
  decision: 'T' | 'F';
  lifestyle: 'J' | 'P';
}

function parseMbti(mbti: string): MbtiDimensions | null {
  if (mbti.length !== 4) return null;
  const u = mbti.toUpperCase();
  if (!'EI'.includes(u[0]) || !'SN'.includes(u[1]) || !'TF'.includes(u[2]) || !'JP'.includes(u[3])) return null;
  return {
    energy: u[0] as 'E' | 'I',
    info: u[1] as 'S' | 'N',
    decision: u[2] as 'T' | 'F',
    lifestyle: u[3] as 'J' | 'P',
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function flavorActivity(tip: CorrelationTip, dim: MbtiDimensions): string {
  const positive = tip.withTagAvg > tip.withoutTagAvg;
  const { tag, dayCount } = tip;

  if (dim.info === 'S' && dim.decision === 'T') {
    return positive
      ? `On the ${dayCount} days with ${tag}, your mood averaged noticeably higher.`
      : `On ${tag} days, your mood tracked measurably lower than other days.`;
  }
  if (dim.info === 'S') {
    return positive
      ? `Days with ${tag} seem to lift your spirits noticeably.`
      : `Days involving ${tag} seem to weigh on you a bit.`;
  }
  if (dim.info === 'N' && dim.decision === 'F') {
    return positive
      ? `${cap(tag)} seems to be something that genuinely nourishes you.`
      : `${cap(tag)} seems to drain your energy — be gentle with yourself around it.`;
  }
  // N + T
  return positive
    ? `There's a pattern here — ${tag} days consistently correlate with higher mood.`
    : `There's a notable dip pattern around ${tag} — worth examining why.`;
}

function flavorSchedule(tip: CorrelationTip, dim: MbtiDimensions): string {
  const positive = tip.withTagAvg > tip.withoutTagAvg;
  const { tag } = tip;

  if (dim.lifestyle === 'J') {
    return positive
      ? `Your ${tag} days show a clear positive pattern — structure seems to serve you well.`
      : `Your data suggests ${tag} days may need better planning or boundaries.`;
  }
  // P
  return positive
    ? `${cap(tag)} days seem to bring out your best — even when they break routine.`
    : `${cap(tag)} days seem to box you in a bit — you might need more breathing room.`;
}

function flavorSocial(tip: CorrelationTip, dim: MbtiDimensions): string {
  const positive = tip.withTagAvg > tip.withoutTagAvg;
  const { tag } = tip;

  if (dim.energy === 'E') {
    return positive
      ? `No surprise — ${tag} clearly charges your batteries.`
      : `Unusually, ${tag} seems to drain rather than energize you.`;
  }
  // I
  return positive
    ? `Even so, ${tag} brings a noticeable mood lift for you.`
    : `${cap(tag)} may be using more of your social energy than you realize.`;
}

function flavorRecurring(tip: CorrelationTip, dim: MbtiDimensions): string {
  const { tag, dayCount } = tip;
  const recent = Math.round(dayCount / 0.6);

  if (dim.info === 'S') {
    return `${cap(tag)} appeared in ${dayCount} of your last ${recent} sessions — a concrete trend.`;
  }
  return `${cap(tag)} keeps surfacing — your mind may be working through something here.`;
}

function flavorTrend(tip: CorrelationTip, dim: MbtiDimensions): string {
  const upward = tip.withTagAvg > tip.withoutTagAvg;

  if (dim.decision === 'T') {
    return upward
      ? 'Your recent mood scores are measurably higher than your prior baseline.'
      : 'Your recent scores show a downward shift from your baseline.';
  }
  // F
  return upward
    ? "Something's been going right lately — your mood is on the rise."
    : "You've been carrying a heavier load lately — be kind to yourself.";
}

const FLAVOR_FNS: Record<string, (tip: CorrelationTip, dim: MbtiDimensions) => string> = {
  activity: flavorActivity,
  schedule: flavorSchedule,
  social: flavorSocial,
  recurring: flavorRecurring,
  trend: flavorTrend,
};

export function applyMbtiFlavor(tips: CorrelationTip[], mbti: string): CorrelationTip[] {
  const dim = parseMbti(mbti);
  if (!dim) return tips;

  return tips.map(tip => {
    const fn = FLAVOR_FNS[tip.category ?? 'activity'];
    return fn ? { ...tip, message: fn(tip, dim) } : tip;
  });
}
