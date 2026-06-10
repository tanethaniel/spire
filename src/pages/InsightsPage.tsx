import { useState } from 'react';
import type { JournalEntry, PatternNote } from '../types/session';
import { EMOTION_FACE } from '../types/session';
import type { EmotionTag } from '../types/session';
import { distinctEntryDays } from '../lib/correlations';
import { dayKey, currentStreak, avgSessionDuration } from '../lib/stats';
import { PatternNoteCard } from '../components/PatternNoteCard';
import { PatternDetailSheet } from '../components/PatternDetailSheet';
import { ArchiveToast } from '../components/ArchiveToast';

interface InsightsPageProps {
  entries: JournalEntry[];
  loading: boolean;
  onOpenProfile: () => void;
  avatarUrl: string | null;
  userName: string;
  mbti: string | null;
  interpretationEnabled: boolean;
  patterns: PatternNote[];
  archivedPatterns: PatternNote[];
  savedCount: number;
  patternsLoading: boolean;
  archivedToasts: string[];
  onDismissToast: (index: number) => void;
  onResetPatterns: () => void;
  onPatternFeedback: (id: string, feedback: 'true' | 'kind_of' | 'not_really') => void;
  onPatternSave: (id: string) => void;
  onPatternArchive: (id: string) => void;
}

const HEATMAP_WEEKS = 5;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MIN_ENTRIES_FOR_PATTERNS = 7;
const MIN_DAYS_FOR_PATTERNS = 5;
const MAX_SAVED = 20;

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


export function InsightsPage({
  entries, loading, onOpenProfile, avatarUrl, userName,
  interpretationEnabled, patterns, archivedPatterns, savedCount, patternsLoading,
  archivedToasts, onDismissToast,
  onResetPatterns, onPatternFeedback, onPatternSave, onPatternArchive,
}: InsightsPageProps) {
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('completeness');
  const [selectedPattern, setSelectedPattern] = useState<PatternNote | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const answered = entries.filter(e => e.transcripts.some(Boolean));
  const entryDayKeys = new Set(answered.map(e => dayKey(new Date(e.createdAt))));

  const completenessByDay = new Map<string, number>();
  for (const e of answered) {
    const k = dayKey(new Date(e.createdAt));
    const score = e.transcripts.filter(Boolean).length;
    completenessByDay.set(k, Math.max(completenessByDay.get(k) ?? 0, score));
  }

  const moodByDay = new Map<string, { sum: number; count: number; emotion: EmotionTag | null }>();
  for (const e of answered) {
    const k = dayKey(new Date(e.createdAt));
    const cur = moodByDay.get(k) ?? { sum: 0, count: 0, emotion: null };
    if (e.moodScore !== null && e.moodScore !== undefined) {
      cur.sum += e.moodScore;
      cur.count += 1;
    }
    if (e.emotionTag && !cur.emotion) cur.emotion = e.emotionTag;
    moodByDay.set(k, cur);
  }

  const streak = currentStreak(entryDayKeys);
  const totalDays = distinctEntryDays(answered);
  const totalEntries = answered.length;
  const avgDuration = avgSessionDuration(answered);

  const mainPatterns = patterns.filter(p => p.confidence !== 'early_signal' && p.status !== 'saved');
  const earlySignals = patterns.filter(p => p.confidence === 'early_signal' && p.status !== 'saved');
  const savedPatterns = patterns.filter(p => p.status === 'saved');

  const saveDisabled = savedCount >= MAX_SAVED;
  const patternsUnlocked = totalEntries >= MIN_ENTRIES_FOR_PATTERNS && totalDays >= MIN_DAYS_FOR_PATTERNS;
  const unlockProgress = Math.min(100, ((totalEntries / MIN_ENTRIES_FOR_PATTERNS + totalDays / MIN_DAYS_FOR_PATTERNS) / 2) * 100);

  // Determine if the selected pattern is from archived
  const selectedIsArchived = selectedPattern ? archivedPatterns.some(p => p.id === selectedPattern.id) : false;

  // Build heatmap cells aligned to Monday start.
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const endOffset = 6 - todayDow; // pad to fill the last week row
  const totalCells = HEATMAP_WEEKS * 7;
  const startOffset = totalCells - 1 - endOffset;

  const cells: { key: string; has: boolean; completeness: number; mood: number | null; emotion: EmotionTag | null; isToday: boolean }[] = [];
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
      mood: moodData && moodData.count > 0 ? Math.round(moodData.sum / moodData.count) : null,
      emotion: moodData?.emotion ?? null,
      isToday: k === todayKey,
    });
  }

  const openDetail = (p: PatternNote) => {
    setSelectedPattern(p);
    setDetailOpen(true);
  };

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
                if (calendarMode === 'mood' && c.emotion) {
                  return (
                    <div
                      key={c.key}
                      title={`${c.key} · ${c.emotion}`}
                      style={{
                        ...styles.cell,
                        background: 'transparent',
                        opacity: 1,
                        transition: 'opacity 0.3s',
                        ...(c.isToday ? { boxShadow: 'inset 0 0 0 1.5px var(--accent-primary)' } : {}),
                      }}
                    >
                      <img
                        src={EMOTION_FACE[c.emotion]}
                        alt={c.emotion}
                        style={styles.moodFace}
                      />
                    </div>
                  );
                }

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
                : 'Last 5 weeks · Mood'}
            </div>

            {/* Patterns */}
            <div style={{ ...styles.sectionLabel, marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Patterns</span>
              {interpretationEnabled && patterns.length > 0 && (
                <button
                  style={styles.headerAction}
                  onClick={onResetPatterns}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Archive toasts */}
            {archivedToasts.map((title, i) => (
              <ArchiveToast
                key={`toast-${i}`}
                title={title}
                onDismiss={() => onDismissToast(i)}
                onViewArchive={() => {
                  onDismissToast(i);
                  setArchivedOpen(true);
                }}
              />
            ))}

            {!interpretationEnabled ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockIcon}>✦</div>
                <div style={styles.lockTitle}>Patterns are paused</div>
                <div style={styles.lockSub}>
                  Toggle interpret mode on in your profile to view patterns.
                </div>
              </div>
            ) : patternsLoading ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockTitle}>Loading patterns…</div>
              </div>
            ) : !patternsUnlocked ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockIcon}>✦</div>
                <div style={styles.lockTitle}>Patterns unlock soon</div>
                <div style={styles.lockSub}>
                  Spire needs {MIN_ENTRIES_FOR_PATTERNS} entries across {MIN_DAYS_FOR_PATTERNS} days to spot patterns in your journal.
                </div>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width: `${unlockProgress}%` }} />
                </div>
                <div style={styles.progressText}>
                  {totalEntries} of {MIN_ENTRIES_FOR_PATTERNS} entries · {totalDays} of {MIN_DAYS_FOR_PATTERNS} days
                </div>
              </div>
            ) : patterns.length === 0 && archivedPatterns.length === 0 ? (
              <div style={styles.lockedCard}>
                <div style={styles.lockTitle}>No patterns yet</div>
                <div style={styles.lockSub}>
                  Patterns are generated automatically after each session. Keep reflecting and Spire will surface connections as they emerge.
                </div>
              </div>
            ) : (
              <>
                {/* Main patterns (strong + emerging, active) */}
                {mainPatterns.map(p => (
                  <PatternNoteCard
                    key={p.id}
                    pattern={p}
                    onSave={onPatternSave}
                    onArchive={onPatternArchive}
                    onOpen={() => openDetail(p)}
                    saveDisabled={saveDisabled}
                  />
                ))}

                {/* Things to watch (early_signal, active) */}
                {earlySignals.length > 0 && (
                  <>
                    <div style={{ ...styles.sectionLabel, marginTop: 20 }}>Things to watch</div>
                    {earlySignals.map(p => (
                      <PatternNoteCard
                        key={p.id}
                        pattern={p}
                        onSave={onPatternSave}
                        onArchive={onPatternArchive}
                        onOpen={() => openDetail(p)}
                        saveDisabled={saveDisabled}
                      />
                    ))}
                  </>
                )}

                {/* Saved (collapsible) */}
                {savedPatterns.length > 0 && (
                  <>
                    <button style={styles.collapsibleHeader} onClick={() => setSavedOpen(o => !o)}>
                      <span>Saved ({savedCount}/{MAX_SAVED})</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: savedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {savedOpen && savedPatterns.map(p => (
                      <PatternNoteCard
                        key={p.id}
                        pattern={p}
                        onSave={onPatternSave}
                        onArchive={onPatternArchive}
                        onOpen={() => openDetail(p)}
                      />
                    ))}
                  </>
                )}

                {/* Archived (collapsible, read-only) */}
                {archivedPatterns.length > 0 && (
                  <>
                    <button style={styles.collapsibleHeader} onClick={() => setArchivedOpen(o => !o)}>
                      <span>Archived</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: archivedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {archivedOpen && archivedPatterns.map(p => (
                      <PatternNoteCard
                        key={p.id}
                        pattern={p}
                        onSave={onPatternSave}
                        onOpen={() => openDetail(p)}
                        isArchived
                        saveDisabled={saveDisabled}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {detailOpen && selectedPattern && (
              <PatternDetailSheet
                pattern={selectedPattern}
                open={detailOpen}
                onClose={() => { setDetailOpen(false); setSelectedPattern(null); }}
                onFeedback={onPatternFeedback}
                onSave={onPatternSave}
                onArchive={selectedIsArchived ? undefined : onPatternArchive}
                saveDisabled={saveDisabled}
                isArchived={selectedIsArchived}
              />
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
  cell: {
    aspectRatio: '1', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  moodFace: { width: '90%', height: '90%', objectFit: 'cover' as const, borderRadius: '50%' },
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
  headerAction: {
    background: 'none', border: 'none', padding: 0,
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  },
  progressTrack: {
    height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', overflow: 'hidden',
  },
  progressFill: { height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s' },
  progressText: { fontSize: 12, color: 'var(--text-ghost)', marginTop: 8 },
  collapsibleHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '12px 0',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
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
