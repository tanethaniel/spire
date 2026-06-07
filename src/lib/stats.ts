export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentStreak(entryDayKeys: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  if (!entryDayKeys.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (entryDayKeys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const MILESTONES: [number, string][] = [
  [100, '100 days of reflection — extraordinary'],
  [60, '60-day streak — this is who you are now'],
  [30, 'A full month of reflection — incredible'],
  [14, 'Two weeks strong — the habit is real'],
  [7, 'One week in — patterns are now unlocked!'],
  [3, 'Three days in a row — off to a great start'],
];

export function getStreakMilestone(streak: number): string | null {
  for (const [threshold, message] of MILESTONES) {
    if (streak === threshold) return message;
  }
  return null;
}

export function avgSessionDuration(entries: { durationMs: number | null }[]): string {
  const durations = entries
    .map(e => e.durationMs)
    .filter((d): d is number => d !== null && d > 0);
  if (durations.length === 0) return '—';
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  return String(Math.round(avgMs / 60000));
}
