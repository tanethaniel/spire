import { useEffect, useState } from 'react';
import type { QuestionRound } from '../types/session';

interface ResultPageProps {
  rounds: QuestionRound[];
  themes: string[] | null;
  insight: string | null;
  startedAt: string | null;
  completedAt: string | null;
  onDone: () => void;
}

const THEME_COLORS = ['var(--accent-primary)', 'var(--accent-blue)', 'var(--accent-purple)'];
const Q_LABELS = ['Context', 'Emotions', 'Memory', 'Learning', 'Self', 'Anything else'];

export function ResultPage({ rounds, themes, insight, startedAt, completedAt, onDone }: ResultPageProps) {
  const [phase, setPhase] = useState<'analyzing' | 'content'>('analyzing');
  const [visibleThemes, setVisibleThemes] = useState(0);
  const [insightVisible, setInsightVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const duration = startedAt && completedAt
    ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('content'), 1800);
    const t2 = setTimeout(() => setVisibleThemes(1), 2400);
    const t3 = setTimeout(() => setVisibleThemes(2), 2600);
    const t4 = setTimeout(() => setVisibleThemes(3), 2800);
    const t5 = setTimeout(() => setInsightVisible(true), 3200);
    const t6 = setTimeout(() => setCtaVisible(true), 3600);
    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.resultLabel}>Session complete</div>
        <div style={styles.resultTitle}>Today's reflection</div>
        <div style={styles.resultMeta}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {duration > 0 && ` · ${minutes}m ${seconds}s`}
        </div>
      </div>

      {phase === 'analyzing' && (
        <div style={styles.analyzing}>
          <div style={styles.spinner} />
          <div style={styles.analyzingText}>Reading your reflection…</div>
        </div>
      )}

      <div style={{
        ...styles.content,
        opacity: phase === 'content' ? 1 : 0,
        transform: phase === 'content' ? 'translateY(0)' : 'translateY(8px)',
      }}>
        {/* Themes */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            Themes surfaced
            {themes && themes.length > 0 && (
              <span style={styles.newBadge}>NEW</span>
            )}
          </div>
          <div style={styles.themesRow}>
            {themes ? themes.map((theme, i) => (
              <div
                key={i}
                style={{
                  ...styles.themeChip,
                  opacity: i < visibleThemes ? 1 : 0,
                  transform: i < visibleThemes ? 'translateY(0)' : 'translateY(6px)',
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: THEME_COLORS[i % THEME_COLORS.length],
                }} />
                {theme}
              </div>
            )) : (
              <div style={{ fontSize: 13, color: 'var(--text-ghost)' }}>Themes unavailable</div>
            )}
          </div>
        </div>

        {/* Insight */}
        {insight && (
          <div style={{
            ...styles.insightCard,
            opacity: insightVisible ? 1 : 0,
            transition: 'opacity 0.5s',
          }}>
            <div style={styles.insightGradient} />
            <div style={styles.insightLabel}>✦ Spire noticed</div>
            <div style={styles.insightText}>{insight}</div>
          </div>
        )}

        {/* Transcripts */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Your answers</div>
          {rounds.map((round, i) => {
            if (round.status === 'skipped' && !round.transcript) return null;
            const expanded = expandedQ === i;
            return (
              <div key={i} style={styles.transcriptCard}>
                <div
                  style={styles.transcriptHeader}
                  onClick={() => setExpandedQ(expanded ? null : i)}
                >
                  <div>
                    <div style={styles.qLabel}>Q{i + 1} · {Q_LABELS[i]}</div>
                    <div style={styles.qPreview}>
                      {round.transcript
                        ? round.transcript.slice(0, 60) + (round.transcript.length > 60 ? '…' : '')
                        : '(skipped)'}
                    </div>
                  </div>
                  <span style={{
                    ...styles.chevron,
                    transform: expanded ? 'rotate(180deg)' : 'none',
                  }}>∨</span>
                </div>
                {expanded && round.transcript && (
                  <div style={styles.transcriptBody}>
                    <p style={styles.transcriptText}>{round.transcript}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        ...styles.bottomArea,
        opacity: ctaVisible ? 1 : 0,
        transition: 'opacity 0.5s',
      }}>
        <button style={styles.doneBtn} onClick={onDone}>
          Done for today ✓
        </button>
        <div style={styles.streakNote}>
          Day <span style={{ color: 'var(--accent-primary)' }}>1</span> — come back tomorrow to see patterns
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
  },
  header: {
    padding: '20px 24px 16px',
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
  resultTitle: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  resultMeta: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  analyzing: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '40px 24px',
  },
  spinner: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    border: '2px solid #1A1A26',
    borderTopColor: 'var(--accent-primary)',
    animation: 'spin 1s linear infinite',
  },
  analyzingText: {
    fontSize: 15,
    color: 'var(--text-ghost)',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 24px',
    transition: 'opacity 0.5s, transform 0.5s',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  newBadge: {
    background: 'rgba(200,169,122,0.13)',
    color: 'var(--accent-primary)',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 10,
    letterSpacing: '0.05em',
  },
  themesRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  themeChip: {
    background: 'var(--bg-elevated)',
    border: '1.5px solid var(--border-subtle)',
    borderRadius: 20,
    padding: '8px 14px',
    fontSize: 14,
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.3s, transform 0.3s',
  },
  insightCard: {
    background: 'linear-gradient(135deg, var(--bg-elevated) 0%, #1A1426 100%)',
    border: '1px solid rgba(200,169,122,0.13)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  insightGradient: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-purple))',
  },
  insightLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--accent-primary)',
    marginBottom: 10,
  },
  insightText: {
    fontSize: 16,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
    fontStyle: 'italic',
  },
  transcriptCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  transcriptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    cursor: 'pointer',
  },
  qLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  qPreview: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 260,
    marginTop: 2,
  },
  chevron: {
    fontSize: 14,
    color: 'var(--text-ghost)',
    transition: 'transform 0.2s',
  },
  transcriptBody: {
    padding: '0 16px 14px',
    borderTop: '1px solid var(--border-subtle)',
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    paddingTop: 12,
  },
  bottomArea: {
    padding: '16px 24px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  doneBtn: {
    width: '100%',
    padding: 18,
    background: 'var(--accent-primary)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.15s',
  },
  streakNote: {
    textAlign: 'center' as const,
    fontSize: 13,
    color: 'var(--text-ghost)',
  },
};
