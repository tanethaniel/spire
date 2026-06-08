import React from 'react';
import type { PatternNote } from '../types/session';

interface PatternNoteCardProps {
  pattern: PatternNote;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
}

const CONFIDENCE_LABELS: Record<PatternNote['confidence'], string> = {
  early_signal: 'Early signal',
  emerging_pattern: 'Emerging',
  strong_pattern: 'Strong pattern',
};

export function PatternNoteCard({ pattern, onOpen, onSave, onDismiss }: PatternNoteCardProps) {
  const firstQuote = pattern.supportingQuotes?.[0] ?? null;

  return (
    <div style={{ ...styles.card, marginBottom: 12 }} onClick={() => onOpen(pattern.id)}>
      {/* Top row: confidence pill + save/dismiss */}
      <div style={styles.topRow}>
        <div style={styles.badge}>
          {pattern.confidence === 'early_signal' && <span style={styles.badgeDot} />}
          {CONFIDENCE_LABELS[pattern.confidence]}
        </div>
        <div style={styles.topActions} onClick={e => e.stopPropagation()}>
          <button
            style={styles.iconBtn}
            onClick={() => onSave(pattern.id)}
            aria-label="Save"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            style={styles.iconBtn}
            onClick={() => onDismiss(pattern.id)}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <div style={styles.title}>{pattern.title}</div>

      {/* Note — clamped */}
      <div style={styles.note}>{pattern.note}</div>

      {/* First quote preview */}
      {firstQuote && (
        <div style={styles.quoteBlock}>
          <div style={styles.quoteText}>"{firstQuote.quote}"</div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16,
    boxShadow: 'var(--glass-shadow)',
    padding: '14px 16px',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-ghost)',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: '3px 8px',
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--text-ghost)',
    flexShrink: 0,
  },
  topActions: {
    display: 'flex',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.3,
    marginBottom: 6,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    letterSpacing: -0.2,
  },
  note: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginBottom: 10,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  quoteBlock: {
    borderLeft: '2px solid var(--accent-primary)',
    paddingLeft: 10,
  },
  quoteText: {
    fontSize: 12,
    fontStyle: 'italic' as const,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  iconBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--border-glass)',
    borderRadius: 8,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    padding: 0,
  },
};
