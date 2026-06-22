import React from 'react';
import type { PatternNote, PatternConfidence } from '../types/session';

interface PatternNoteCardProps {
  pattern: PatternNote;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss?: (id: string) => void;
  saveDisabled?: boolean;
}

const CONFIDENCE_DOT_COUNT: Record<PatternConfidence, number> = {
  early_signal: 1,
  emerging_pattern: 2,
  strong_pattern: 3,
};

function ConfidenceDots({ confidence }: { confidence: PatternConfidence }) {
  const count = CONFIDENCE_DOT_COUNT[confidence];
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: i < count ? 'var(--accent-primary)' : 'var(--border-glass)',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}

function UpdatedBadge() {
  return (
    <span style={styles.updatedBadge}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </span>
  );
}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ConfidenceDots confidence={pattern.confidence} />
          {pattern.hasNewEvidence && <UpdatedBadge />}
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
  updatedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--accent-primary)',
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
