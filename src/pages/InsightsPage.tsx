import { useState } from 'react';
import type { JournalEntry } from '../types/session';
import { TIPS_MIN_DAYS } from '../types/session';
import { computeCorrelations, distinctEntryDays, tipsUnlocked } from '../lib/correlations';
import { applyMbtiFlavor } from '../lib/mbtiMessaging';
import { dayKey, currentStreak, avgSessionDuration } from '../lib/stats';

interface InsightsPageProps {
  entries: JournalEntry[];
  loading: boolean;
  onOpenProfile: () => void;
  avatarUrl: string | null;
  userName: string;
  mbti: string | null;
  interpretationEnabled: boolean;
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

const MOOD_COLOR: Record<number, string> = {
  [-2]: '#D4756A',
  [-1]: '#D4A574',
  [0]: '#B8B8B8',
  [1]: '#98C84C',
  [2]: '#6BBFA8',
};

type CalendarMode = 'completeness' | 'mood';


export function InsightsPage({ entries, loading, onOpenProfile, avatarUrl, userName, mbti, interpretationEnabled }: InsightsPageProps) {
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('completeness');
  const answered = entries.filter(e => e.transcripts.some(Boolean));
  const entryDayKeys = new Set(answered.map(e => dayKey(new Date(e.createdAt))));

  // Best completeness score per day (how many of 6 questions were answered).
  const completenessByDay = new Map<string, number>();
  for (const e of answered) {
    const k = dayKey(new Date(e.createdAt));
    const score = e.transcripts.filter(Boolean).length;
    completenessByDay.set(k, Math.max(completenessByDay.get(k) ?? 0, score));
  }

  // Average mood per day for mood calendar view
  const moodByDay = new Map<string, { sum: number; count: number }>();
  for (const e of answered) {
    if (e.moodScore === null || e.moodScore === undefined) continue;
    const k = dayKey(new Date(e.createdAt));
    const cur = moodByDay.get(k) ?? { sum: 0, count: 0 };
    cur.sum += e.moodScore;
    cur.count += 1;
    moodByDay.set(k, cur);
  }

  const streak = currentStreak(entryDayKeys);
  const totalDays = distinctEntryDays(answered);
  const avgDuration = avgSessionDuration(answered);
  const unlocked = tipsUnlocked(answered);
  const rawTips = unlocked ? computeCorrelations(answered) : [];
  const tips = mbti ? applyMbtiFlavor(rawTips, mbti) : rawTips;

  // Build heatmap cells aligned to Monday start.
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const endOffset = 6 - todayDow; // pad to fill the last week row
  const totalCells = HEATMAP_WEEKS * 7;
  const startOffset = totalCells - 1 - endOffset;

  const cells: { key: string; has: boolean; completeness: number; mood: number | null; isToday: boolean }[] = [];
  const todayKey = dayKey(today);
  for (let i = 0; i < totalCells; i++) {
    const d = new Date();
    d.setDate(d.getDate() - startOffset + i);
    const k = dayKey(d);
    const moodData = moodByDay.get(k);
    cells.push({
      key: k,
      has: entryDayKeys.has(k),
      completeness: completenessByDay.get(k) ?? 0,
      mood: moodData ? Math.round(moodData.sum / moodData.count) : null,
      isToday: k === todayKey,
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
                <div style={styles.statNum}>{avgDuration}</div>
                <div style={styles.statLabel}>avg minutes</div>
              </div>
            </div>

            <div style={styles.calendarToggle}>
              <button
                style={{ ...styles.toggleBtn, ...(calendarMode === 'completeness' ? styles.toggleBtnActive : {}) }}
                onClick={() => setCalendarMode('completeness')}
              >Consistency</button>
              <button
                style={{ ...styles.toggleBtn, ...(calendarMode === 'mood' ? styles.toggleBtnActive : {}) }}
                onClick={() => setCalendarMode('mood')}
              >Mood</button>
            </div>

            <div style={styles.heatmap}>
              {DAY_LABELS.map((label, i) => (
                <div key={`lbl-${i}`} style={styles.dayLabel}>{label}</div>
              ))}
              {cells.map(c => {
                let bg: string;
                let cellOpacity: number;
                if (calendarMode === 'completeness') {
                  bg = c.has
                    ? COMPLETENESS_COLOR[c.completeness] ?? 'rgba(255,255,255,0.2)'
                    : 'rgba(255,255,255,0.2)';
                  cellOpacity = c.has ? 1 : 0.5;
                } else {
                  bg = c.mood !== null
                    ? MOOD_COLOR[c.mood] ?? 'rgba(255,255,255,0.2)'
                    : 'rgba(255,255,255,0.2)';
                  cellOpacity = c.mood !== null ? 1 : 0.5;
                }
                return (
                  <div
                    key={c.key}
                    title={c.key}
                    style={{
                      ...styles.cell,
                      background: bg,
                      opacity: cellOpacity,
                      transition: 'background 0.3s, opacity 0.3s',
                      ...(c.isToday ? { boxShadow: 'inset 0 0 0 1.5px var(--accent-primary)' } : {}),
                    }}
                  />
                );
              })}
            </div>
            <div style={styles.heatmapLegend}>
              {calendarMode === 'completeness'
                ? 'Last 5 weeks'
                : (
                  <span style={styles.moodLegend}>
                    Last 5 weeks · Mood
                    <span style={styles.legendDots}>
                      {[-2, -1, 0, 1, 2].map(m => (
                        <span key={m} style={{ ...styles.legendDot, background: MOOD_COLOR[m] }} />
                      ))}
                    </span>
                  </span>
                )}
            </div>

            {/* Patterns */}
            <div style={{ ...styles.sectionLabel, marginTop: 28 }}>Patterns</div>
            {!interpretationEnabled ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockIcon}>✦</div>
                <div style={styles.lockTitle}>Patterns are paused</div>
                <div style={styles.lockSub}>
                  Toggle interpret mode on in your profile to view patterns.
                </div>
              </div>
            ) : !unlocked ? (
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
              tips.map((tip, i) => (
                <div
                  key={`${tip.category}-${tip.tag}`}
                  style={{
                    ...styles.tipCard,
                    animation: 'slideUp 0.4s ease-out both',
                    animationDelay: `${i * 0.08}s`,
                  }}
                >
                  <div style={styles.tipGradient} />
                  <div style={styles.tipMessage}>{tip.message}</div>

                  {/* Activity / Schedule / Social — comparison bars */}
                  {(tip.category === 'activity' || tip.category === 'schedule' || tip.category === 'social') && (
                    <div style={styles.barsWrap}>
                      <div style={styles.barRow}>
                        <span style={styles.barLabel}>With {tip.tag}</span>
                        <div style={styles.barTrack}>
                          <div style={{ ...styles.barFillWith, width: `${((tip.withTagAvg + 2) / 4) * 100}%` }} />
                        </div>
                        <span style={styles.barValue}>{tip.withTagAvg > 0 ? '+' : ''}{tip.withTagAvg}</span>
                      </div>
                      <div style={styles.barRow}>
                        <span style={styles.barLabel}>Without</span>
                        <div style={styles.barTrack}>
                          <div style={{ ...styles.barFillWithout, width: `${((tip.withoutTagAvg + 2) / 4) * 100}%` }} />
                        </div>
                        <span style={styles.barValue}>{tip.withoutTagAvg > 0 ? '+' : ''}{tip.withoutTagAvg}</span>
                      </div>
                    </div>
                  )}

                  {/* Observation — frequency dots */}
                  {tip.category === 'observation' && tip.totalDays && (
                    <div style={styles.dotsWrap}>
                      {Array.from({ length: tip.totalDays }, (_, j) => (
                        <span
                          key={j}
                          style={{
                            ...styles.dot,
                            background: j < tip.dayCount
                              ? 'var(--accent-primary)'
                              : 'rgba(255,255,255,0.25)',
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Trend — sparkline */}
                  {tip.category === 'trend' && tip.moodHistory && tip.moodHistory.length > 1 && (
                    <svg viewBox="0 0 200 40" style={styles.sparkSvg}>
                      <defs>
                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="20" x2="200" y2="20" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3" />
                      <polyline
                        fill="none"
                        stroke="var(--accent-primary)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={tip.moodHistory
                          .map((m, j) => {
                            const x = (j / (tip.moodHistory!.length - 1)) * 200;
                            const y = 40 - ((m + 2) / 4) * 40;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                      />
                      <polygon
                        fill="url(#sparkGrad)"
                        points={[
                          ...tip.moodHistory.map((m, j) => {
                            const x = (j / (tip.moodHistory!.length - 1)) * 200;
                            const y = 40 - ((m + 2) / 4) * 40;
                            return `${x},${y}`;
                          }),
                          `200,40`,
                          `0,40`,
                        ].join(' ')}
                      />
                    </svg>
                  )}

                  {/* Recurring — tag chip with count */}
                  {tip.category === 'recurring' && (
                    <div style={styles.chipWrap}>
                      <span style={styles.chip}>
                        {tip.tag}
                        <span style={styles.chipBadge}>{tip.dayCount}</span>
                      </span>
                    </div>
                  )}

                  <div style={styles.tipMeta}>
                    {tip.category === 'observation'
                      ? `${tip.dayCount} of your last ${tip.totalDays ?? tip.dayCount} days`
                      : tip.category === 'recurring'
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
  calendarToggle: {
    display: 'flex', gap: 4, marginBottom: 12,
    background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 3,
  },
  toggleBtn: {
    flex: 1, padding: '6px 0', border: 'none', borderRadius: 8,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
  },
  toggleBtnActive: {
    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  heatmap: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5,
  },
  dayLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-ghost)',
    textAlign: 'center', paddingBottom: 4,
  },
  cell: { aspectRatio: '1', borderRadius: 6 },
  heatmapLegend: { fontSize: 11, color: 'var(--text-ghost)', marginTop: 8 },
  moodLegend: { display: 'flex', alignItems: 'center', gap: 6 },
  legendDots: { display: 'flex', gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
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

  barsWrap: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  barRow: { display: 'flex', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 11, color: 'var(--text-muted)', width: 70, flexShrink: 0 },
  barTrack: {
    flex: 1, height: 8, borderRadius: 4,
    background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
  },
  barFillWith: {
    height: '100%', borderRadius: 4,
    background: 'var(--accent-primary)', transition: 'width 0.4s ease-out',
  },
  barFillWithout: {
    height: '100%', borderRadius: 4,
    background: 'rgba(255,255,255,0.3)', transition: 'width 0.4s ease-out',
  },
  barValue: { fontSize: 11, color: 'var(--text-ghost)', width: 28, textAlign: 'right' as const },

  dotsWrap: { marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },

  sparkSvg: { width: '100%', height: 40, marginTop: 12 },

  chipWrap: { marginTop: 12 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 12px', borderRadius: 20,
    background: 'rgba(107,191,168,0.15)',
    border: '1px solid rgba(107,191,168,0.3)',
    fontSize: 13, color: 'var(--text-secondary)',
  },
  chipBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, borderRadius: '50%',
    background: 'var(--accent-primary)', color: '#fff',
    fontSize: 10, fontWeight: 700,
  },
};
