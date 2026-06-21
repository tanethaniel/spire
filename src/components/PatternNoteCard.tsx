import React from 'react';
import type { PatternNote, PatternConfidence } from '../types/session';

interface PatternNoteCardProps {
  pattern: PatternNote;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss?: (id: string) => void;
  saveDisabled?: boolean;
}

const CONFIDENCE_STYLE: Record<PatternConfidence, React.CSSProperties> = {
  early_signal: { background: 'transparent', border: '1.5px solid var(--text-ghost)', width: 7, height: 7 },
  emerging_pattern: { background: 'linear-gradient(135deg, var(--accent-primary) 50%, transparent 50%)', border: '1.5px solid var(--accent-primary)', width: 7, height: 7 },
  strong_pattern: { background: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', width: 7, height: 7 },
};

export function PatternNoteCard({ pattern, onOpen, onSave, onDismiss, saveDisabled }: PatternNoteCardProps) {
  const isDimmed = pattern.slotState === 'dimmed';
  const isSaved = pattern.slotState === 'saved';

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 12,
        ...(isDimmed ? { opacity: 0.5, filter: 'grayscale(0.3)' } : {}),
      }}
      onClick={() => onOpen(pattern.id)}
    >
      {/* Top row: confidence + actions */}
      <div style={styles.topRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ ...styles.confidenceDot, ...CONFIDENCE_STYLE[pattern.confidence], borderRadius: '50%' }} />
          {pattern.hasNewEvidence && <div style={styles.updatedDot} />}
          {isDimmed && <span style={styles.fadingLabel}>Fading</span>}
        </div>
        <div style={styles.topActions} onClick={e => e.stopPropagation()}>
          <button
            style={{
              ...styles.iconBtn,
              ...(isSaved ? { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } : {}),
              ...(saveDisabled && !isSaved ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
            }}
            onClick={() => {
              if (saveDisabled && !isSaved) return;
              onSave(pattern.id);
            }}
            aria-label={isSaved ? 'Unsave' : 'Save'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {onDismiss && (
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
          )}
        </div>
      </div>

      {/* Title */}
      <div style={styles.title}>{pattern.title}</div>

      {/* Note — clamped */}
      <div style={styles.note}>{pattern.previewNote || pattern.note}</div>

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
  confidenceDot: {
    flexShrink: 0,
    display: 'inline-block',
  },
  updatedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    flexShrink: 0,
  },
  fadingLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-ghost)',
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
