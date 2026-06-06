import type { JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';
import { computeCorrelations, distinctEntryDays, tipsUnlocked } from '../lib/correlations';
import { applyMbtiFlavor } from '../lib/mbtiMessaging';
import { dayKey, currentStreak } from '../lib/stats';

interface InsightsPageProps {
  entries: JournalEntry[];
  loading: boolean;
  onOpenProfile: () => void;
  avatarUrl: string | null;
  userName: string;
  mbti: string | null;
}

const HEATMAP_WEEKS = 5;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// 6 shades: 1/6 answered = warm yellow → 6/6 = deep green
const COMPLETENESS_COLOR: Record<number, string> = {
  1: '#E8C840',
  2: '#C8D040',
  3: '#98C84C',
  4: '#68B858',
  5: '#40A848',
  6: '#2E8B3E',
};


export function InsightsPage({ entries, loading, onOpenProfile, avatarUrl, userName, mbti }: InsightsPageProps) {
  const answered = entries.filter(e => e.transcripts.some(Boolean));
  const entryDayKeys = new Set(answered.map(e => dayKey(new Date(e.createdAt))));

  // Best completeness score per day (how many of 6 questions were answered).
  const completenessByDay = new Map<string, number>();
  for (const e of answered) {
    const k = dayKey(new Date(e.createdAt));
    const score = e.transcripts.filter(Boolean).length;
    completenessByDay.set(k, Math.max(completenessByDay.get(k) ?? 0, score));
  }

  const streak = currentStreak(entryDayKeys);
  const totalDays = distinctEntryDays(answered);
  const unlocked = tipsUnlocked(answered);
  const rawTips = unlocked ? computeCorrelations(answered) : [];
  const tips = mbti ? applyMbtiFlavor(rawTips, mbti) : rawTips;

  // Build heatmap cells aligned to Monday start.
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const endOffset = 6 - todayDow; // pad to fill the last week row
  const totalCells = HEATMAP_WEEKS * 7;
  const startOffset = totalCells - 1 - endOffset;

  const cells: { key: string; has: boolean; completeness: number }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date();
    d.setDate(d.getDate() - startOffset + i);
    const k = dayKey(d);
    cells.push({
      key: k,
      has: entryDayKeys.has(k),
      completeness: completenessByDay.get(k) ?? 0,
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Review</div>
        <button style={styles.avatarBtn} onClick={onOpenProfile} aria-label="Profile">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={styles.avatarImg} />
          ) : (
            <span style={styles.avatarInitial}>{(userName || '?').charAt(0).toUpperCase()}</span>
          )}
        </button>
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
                <div style={styles.statNum}>{answered.length}</div>
                <div style={styles.statLabel}>total sessions</div>
              </div>
            </div>

            <div style={styles.heatmap}>
              {DAY_LABELS.map((label, i) => (
                <div key={`lbl-${i}`} style={styles.dayLabel}>{label}</div>
              ))}
              {cells.map(c => (
                <div
                  key={c.key}
                  title={c.key}
                  style={{
                    ...styles.cell,
                    background: c.has
                      ? COMPLETENESS_COLOR[c.completeness] ?? 'rgba(255,255,255,0.2)'
                      : 'rgba(255,255,255,0.2)',
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
                <div key={`${tip.category}-${tip.tag}`} style={styles.tipCard}>
                  <div style={styles.tipGradient} />
                  <div style={styles.tipMessage}>{tip.message}</div>
                  <div style={styles.tipMeta}>
                    {tip.category === 'recurring'
                      ? `Mentioned in ${tip.dayCount} recent sessions`
                      : tip.category === 'trend'
                      ? `Over the last ${tip.dayCount} days`
                      : `Across ${tip.dayCount} days with "${tip.tag}"`}
                  </div>
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
  avatarBtn: {
    background: 'none', border: 'none', padding: 0,
    minHeight: 44, minWidth: 44,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  avatarImg: {
    width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' as const,
    border: '1.5px solid rgba(255,255,255,0.4)',
  },
  avatarInitial: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'var(--accent-primary)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700, border: '1.5px solid rgba(255,255,255,0.4)',
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
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14, padding: '14px 8px', textAlign: 'center',
    boxShadow: 'var(--glass-shadow)',
  },
  statNum: { fontSize: 26, fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  heatmap: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5,
  },
  dayLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-ghost)',
    textAlign: 'center', paddingBottom: 4,
  },
  cell: { aspectRatio: '1', borderRadius: 6 },
  heatmapLegend: { fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 },
  lockedCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16, padding: 20, textAlign: 'center',
    boxShadow: 'var(--glass-shadow)',
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
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(107,191,168,0.2)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16, padding: 18, marginBottom: 10,
    boxShadow: 'var(--glass-shadow)',
  },
  tipGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))',
  },
  tipMessage: { fontSize: 16, lineHeight: 1.5, color: 'var(--text-secondary)' },
  tipMeta: { fontSize: 12, color: 'var(--text-ghost)', marginTop: 8 },
};
