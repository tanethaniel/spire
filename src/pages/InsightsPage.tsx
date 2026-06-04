import type { JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';
import { computeCorrelations, distinctEntryDays, tipsUnlocked } from '../lib/correlations';

interface InsightsPageProps {
  entries: JournalEntry[];
  loading: boolean;
  onOpenSettings: () => void;
}

const HEATMAP_DAYS = 35; // last 5 weeks
const MOOD_COLOR: Record<number, string> = {
  [-2]: '#C88A7A', [-1]: '#CCAA88', 0: 'rgba(255,255,255,0.35)', 1: '#B8C498', 2: 'var(--accent-primary)',
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Current consecutive-day streak ending today (or yesterday, so a missed
// "today" before the evening session doesn't zero the streak).
function currentStreak(entryDayKeys: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  // Allow today to be empty without breaking the streak.
  if (!entryDayKeys.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (entryDayKeys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function InsightsPage({ entries, loading, onOpenSettings }: InsightsPageProps) {
  const entryDayKeys = new Set(entries.map(e => dayKey(new Date(e.createdAt))));

  // Average mood per day for the heatmap coloring.
  const moodByDay = new Map<string, { sum: number; count: number }>();
  for (const e of entries) {
    if (e.moodScore === null) continue;
    const k = dayKey(new Date(e.createdAt));
    const cur = moodByDay.get(k) ?? { sum: 0, count: 0 };
    cur.sum += e.moodScore; cur.count += 1;
    moodByDay.set(k, cur);
  }

  const streak = currentStreak(entryDayKeys);
  const totalDays = distinctEntryDays(entries);
  const unlocked = tipsUnlocked(entries);
  const tips = unlocked ? computeCorrelations(entries) : [];

  // Build heatmap cells oldest → newest.
  const cells: { key: string; has: boolean; mood: number | null }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const m = moodByDay.get(k);
    cells.push({ key: k, has: entryDayKeys.has(k), mood: m ? Math.round(m.sum / m.count) : null });
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Insights</div>
        <button style={styles.gear} onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>

      <div style={styles.body}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : (
          <>
            {/* Consistency */}
            <div style={styles.sectionLabel}>Consistency</div>
            <div style={styles.statsRow}>
              <div style={styles.stat}>
                <div style={styles.statNum}>{streak}</div>
                <div style={styles.statLabel}>day streak</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statNum}>{totalDays}</div>
                <div style={styles.statLabel}>days reflected</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statNum}>{entries.length}</div>
                <div style={styles.statLabel}>total sessions</div>
              </div>
            </div>

            <div style={styles.heatmap}>
              {cells.map(c => (
                <div
                  key={c.key}
                  title={c.key}
                  style={{
                    ...styles.cell,
                    background: !c.has
                      ? 'rgba(255,255,255,0.2)'
                      : c.mood !== null
                      ? MOOD_COLOR[c.mood]
                      : 'var(--accent-primary)',
                    opacity: c.has ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
            <div style={styles.heatmapLegend}>Last 5 weeks</div>

            {/* Patterns */}
            <div style={{ ...styles.sectionLabel, marginTop: 28 }}>Patterns</div>
            {!unlocked ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockIcon}>✦</div>
                <div style={styles.lockTitle}>Patterns unlock soon</div>
                <div style={styles.lockSub}>
                  Spire needs about a week of reflections to spot patterns like
                  "better moods on gym days."
                </div>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width: `${Math.min(100, (totalDays / TIPS_MIN_DAYS) * 100)}%` }} />
                </div>
                <div style={styles.progressText}>{totalDays} of {TIPS_MIN_DAYS} days</div>
              </div>
            ) : tips.length === 0 ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockTitle}>No clear patterns yet</div>
                <div style={styles.lockSub}>
                  Nothing stands out strongly so far. Keep reflecting and Spire will
                  surface connections as they emerge.
                </div>
              </div>
            ) : (
              tips.map(tip => (
                <div key={tip.tag} style={styles.tipCard}>
                  <div style={styles.tipGradient} />
                  <div style={styles.tipMessage}>{tip.message}</div>
                  <div style={styles.tipMeta}>Across {tip.dayCount} days with "{tip.tag}"</div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%', maxWidth: 430, minHeight: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px 12px',
  },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.5 },
  gear: {
    background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)',
    minHeight: 44, minWidth: 44,
  },
  body: { flex: 1, overflowY: 'auto', padding: '0 24px 24px' },
  empty: { textAlign: 'center', padding: '64px 16px', color: 'var(--text-ghost)', fontSize: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--text-muted)', marginBottom: 12,
  },
  statsRow: { display: 'flex', gap: 10, marginBottom: 20 },
  stat: {
    flex: 1, background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 14, padding: '14px 8px', textAlign: 'center',
  },
  statNum: { fontSize: 26, fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  heatmap: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5,
  },
  cell: { aspectRatio: '1', borderRadius: 6 },
  heatmapLegend: { fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 },
  lockedCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 16, padding: 20, textAlign: 'center',
  },
  lockIcon: { fontSize: 24, color: 'var(--accent-primary)', marginBottom: 8 },
  lockTitle: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  lockSub: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 },
  progressTrack: {
    height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  progressFill: { height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s' },
  progressText: { fontSize: 12, color: 'var(--text-ghost)', marginTop: 8 },
  tipCard: {
    position: 'relative', overflow: 'hidden',
    background: 'rgba(255,255,255,0.35)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(212,145,122,0.25)', borderRadius: 16,
    padding: 18, marginBottom: 10,
  },
  tipGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))',
  },
  tipMessage: { fontSize: 16, lineHeight: 1.5, color: 'var(--text-secondary)' },
  tipMeta: { fontSize: 12, color: 'var(--text-ghost)', marginTop: 8 },
};
