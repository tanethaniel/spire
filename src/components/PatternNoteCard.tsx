import React, { useState } from 'react';
import type { PatternNote } from '../types/session';

interface PatternNoteCardProps {
  pattern: PatternNote;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
  onFeedback: (id: string, feedback: 'true' | 'kind_of' | 'not_really') => void;
}

const CONFIDENCE_LABELS: Record<PatternNote['confidence'], string> = {
  early_signal: 'Early signal',
  emerging_pattern: 'Emerging',
  strong_pattern: 'Strong pattern',
};

function formatQuoteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PatternNoteCard({ pattern, onOpen, onSave, onDismiss, onFeedback }: PatternNoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const firstQuote = pattern.supportingQuotes?.[0] ?? null;

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  const stopAndCall = (e: React.MouseEvent, fn: () => void) => {
    e.stopPropagation();
    fn();
  };

  const feedbackOptions: { value: 'true' | 'kind_of' | 'not_really'; label: string }[] = [
    { value: 'true', label: 'Yes' },
    { value: 'kind_of', label: 'Kind of' },
    { value: 'not_really', label: 'Not really' },
  ];

  return (
    <div style={{ ...styles.card, marginBottom: 12 }} onClick={toggleExpand}>
      {/* Confidence badge */}
      <div style={styles.badge}>
        {pattern.confidence === 'early_signal' && <span style={styles.badgeDot} />}
        {CONFIDENCE_LABELS[pattern.confidence]}
      </div>

      {/* Title */}
      <div style={expanded ? styles.titleExpanded : styles.title}>{pattern.title}</div>

      {/* Note */}
      <div style={expanded ? styles.noteExpanded : styles.note}>{pattern.note}</div>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* All quotes */}
          {pattern.supportingQuotes && pattern.supportingQuotes.length > 0 && (
            <div style={styles.quotesSection}>
              {pattern.supportingQuotes.map((q, i) => (
                <div key={i} style={styles.quoteBlock}>
                  <div style={styles.quoteText}>"{q.quote}"</div>
                  <div style={styles.quoteDate}>{formatQuoteDate(q.date)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Goal connection */}
          {pattern.goalConnection && (
            <div style={styles.goalConnection}>{pattern.goalConnection}</div>
          )}

          {/* Personality framing / suggestion */}
          {pattern.personalityFraming && (
            <div style={styles.personalityFraming}>{pattern.personalityFraming}</div>
          )}

          {/* Suggested experiment */}
          {pattern.suggestedExperiment && (
            <div style={styles.experimentBlock}>
              <div style={styles.experimentLabel}>Try this week</div>
              <div style={styles.experimentText}>{pattern.suggestedExperiment}</div>
            </div>
          )}

          {/* Reflection prompt */}
          {pattern.reflectionPrompt && (
            <div style={styles.reflectionPrompt}>{pattern.reflectionPrompt}</div>
          )}

          {/* View full details link */}
          <button
            style={styles.detailsLink}
            onClick={e => stopAndCall(e, () => onOpen(pattern.id))}
          >
            View full details
          </button>
        </>
      )}

      {/* Collapsed: show first quote preview */}
      {!expanded && firstQuote && (
        <div style={styles.quoteBlock}>
          <div style={styles.quoteText}>"{firstQuote.quote}"</div>
          <div style={styles.quoteDate}>{formatQuoteDate(firstQuote.date)}</div>
        </div>
      )}

      {!expanded && pattern.goalConnection && (
        <div style={styles.goalConnectionCollapsed}>{pattern.goalConnection}</div>
      )}

      {/* Expand/collapse hint */}
      <div style={styles.expandHint}>
        {expanded ? 'Tap to collapse' : 'Tap to read more'}
      </div>

      {/* Action row */}
      <div style={styles.actionRow} onClick={e => e.stopPropagation()}>
        <div style={styles.actionLeft}>
          <span style={styles.actionLabel}>Does this feel true?</span>
          <div style={styles.feedbackRow}>
            {feedbackOptions.map(opt => (
              <button
                key={opt.value}
                style={{
                  ...styles.feedbackBtn,
                  ...(pattern.userFeedback === opt.value ? styles.feedbackBtnActive : {}),
                }}
                onClick={e => stopAndCall(e, () => onFeedback(pattern.id, opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.actionRight}>
          <button
            style={styles.iconBtn}
            onClick={e => stopAndCall(e, () => onSave(pattern.id))}
            aria-label="Save"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            style={styles.iconBtn}
            onClick={e => stopAndCall(e, () => onDismiss(pattern.id))}
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
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
    padding: '16px 18px',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
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
    marginBottom: 10,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--text-ghost)',
    flexShrink: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.3,
    marginBottom: 8,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    letterSpacing: -0.2,
  },
  titleExpanded: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.3,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  note: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: 12,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  noteExpanded: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: 12,
  },
  quotesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 14,
  },
  quoteBlock: {
    borderLeft: '2px solid var(--accent-primary)',
    paddingLeft: 12,
    marginBottom: 12,
  },
  quoteText: {
    fontSize: 13,
    fontStyle: 'italic' as const,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  quoteDate: {
    fontSize: 11,
    color: 'var(--text-ghost)',
    marginTop: 4,
  },
  goalConnection: {
    fontSize: 13,
    color: 'var(--accent-primary)',
    fontStyle: 'italic' as const,
    marginBottom: 14,
    lineHeight: 1.5,
  },
  goalConnectionCollapsed: {
    fontSize: 13,
    color: 'var(--accent-primary)',
    fontStyle: 'italic' as const,
    marginBottom: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  personalityFraming: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginBottom: 14,
    padding: '10px 12px',
    background: 'rgba(107,191,168,0.08)',
    borderRadius: 10,
    border: '1px solid rgba(107,191,168,0.15)',
  },
  experimentBlock: {
    marginBottom: 14,
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
  },
  experimentLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--accent-primary)',
    marginBottom: 4,
  },
  experimentText: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  reflectionPrompt: {
    fontSize: 13,
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
    lineHeight: 1.5,
    marginBottom: 14,
  },
  detailsLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    cursor: 'pointer',
    marginBottom: 8,
  },
  expandHint: {
    fontSize: 11,
    color: 'var(--text-ghost)',
    textAlign: 'center' as const,
    marginBottom: 10,
    letterSpacing: '0.02em',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    borderTop: '1px solid rgba(255,255,255,0.15)',
    paddingTop: 12,
    marginTop: 2,
  },
  actionLeft: {
    flex: 1,
    minWidth: 0,
  },
  actionLabel: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    display: 'block',
    marginBottom: 6,
  },
  feedbackRow: {
    display: 'flex',
    gap: 6,
  },
  feedbackBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'transparent',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  feedbackBtnActive: {
    background: 'var(--accent-primary)',
    color: '#fff',
    border: '1px solid var(--accent-primary)',
  },
  actionRight: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--border-glass)',
    borderRadius: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    padding: 0,
  },
};
