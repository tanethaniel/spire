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
