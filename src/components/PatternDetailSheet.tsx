import React from 'react';
import type { PatternNote } from '../types/session';

interface PatternDetailSheetProps {
  pattern: PatternNote | null;
  open: boolean;
  onClose: () => void;
  onFeedback: (id: string, feedback: 'true' | 'kind_of' | 'not_really') => void;
  onSave: (id: string) => void;
  onDismiss: (id: string) => void;
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

export function PatternDetailSheet({ pattern, open, onClose, onFeedback, onSave, onDismiss }: PatternDetailSheetProps) {
  if (!open || !pattern) return null;

  const feedbackOptions: { value: 'true' | 'kind_of' | 'not_really'; label: string }[] = [
    { value: 'true', label: 'Yes' },
    { value: 'kind_of', label: 'Kind of' },
    { value: 'not_really', label: 'Not really' },
  ];

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.popup} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Top row: confidence pill + save/dismiss */}
        <div style={styles.topRow}>
          <div style={styles.badge}>
            {pattern.confidence === 'early_signal' && <span style={styles.badgeDot} />}
            {CONFIDENCE_LABELS[pattern.confidence]}
          </div>
          <div style={styles.topActions}>
            {pattern.status !== 'saved' && (
              <button style={styles.actionChip} onClick={() => onSave(pattern.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                Save
              </button>
            )}
            <button style={styles.actionChip} onClick={() => onDismiss(pattern.id)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Dismiss
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={styles.title}>{pattern.title}</div>

        {/* Note */}
        <div style={styles.noteText}>{pattern.note}</div>

        {/* Evidence quotes */}
        {pattern.supportingQuotes && pattern.supportingQuotes.length > 0 && (
          <div style={styles.quotesSection}>
            {pattern.supportingQuotes.map((q, i) => (
              <div key={i} style={styles.quoteCard}>
                <div style={styles.quoteText}>"{q.quote}"</div>
                <div style={styles.quoteDate}>{formatQuoteDate(q.date)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Personality framing box (with reflection prompt merged in) */}
        {(pattern.personalityFraming || pattern.reflectionPrompt) && (
          <div style={styles.personalityBox}>
            {pattern.personalityFraming && (
              <>
                <div style={styles.sectionLabel}>
                  {pattern.personalityFraming.toLowerCase().includes('mbti') || pattern.personalityFraming.toLowerCase().includes('as an')
                    ? 'PERSONALITY LENS'
                    : 'INSIGHT'}
                </div>
                <div style={styles.personalityText}>{pattern.personalityFraming}</div>
              </>
            )}
            {pattern.reflectionPrompt && (
              <div style={{
                ...styles.reflectionPrompt,
                ...(pattern.personalityFraming ? { marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(107,191,168,0.12)' } : {}),
              }}>
                {pattern.reflectionPrompt}
              </div>
            )}
          </div>
        )}

        {/* Suggested experiment */}
        {pattern.suggestedExperiment && (
          <div style={styles.experimentBox}>
            <div style={styles.sectionLabel}>TRY THIS</div>
            <div style={styles.experimentText}>{pattern.suggestedExperiment}</div>
          </div>
        )}

        {/* Feedback */}
        <div style={styles.feedbackSection}>
          <div style={styles.feedbackLabel}>Does this feel true?</div>
          <div style={styles.feedbackRow}>
            {feedbackOptions.map(opt => (
              <button
                key={opt.value}
                style={{
                  ...styles.feedbackBtn,
                  ...(pattern.userFeedback === opt.value ? styles.feedbackBtnActive : {}),
                }}
                onClick={() => onFeedback(pattern.id, opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    padding: 20,
    animation: 'fadeIn 0.2s ease-out',
  },
  popup: {
    position: 'relative',
    width: '100%',
    maxWidth: 390,
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 20,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.2)',
    padding: '20px 20px 16px',
    animation: 'scaleIn 0.2s ease-out',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 8,
    color: '#6B7580',
    cursor: 'pointer',
    padding: 0,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingRight: 36,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#6B7580',
    background: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    padding: '3px 8px',
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#8A9298',
    flexShrink: 0,
  },
  topActions: {
    display: 'flex',
    gap: 6,
  },
  actionChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: '#6B7580',
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: '4px 10px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1A2026',
    lineHeight: 1.3,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  noteText: {
    fontSize: 14,
    color: '#3A4248',
    lineHeight: 1.6,
    marginBottom: 14,
  },
  quotesSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 14,
  },
  quoteCard: {
    borderLeft: '2px solid var(--accent-primary)',
    paddingLeft: 12,
  },
  quoteText: {
    fontSize: 13,
    fontStyle: 'italic' as const,
    color: '#5A6268',
    lineHeight: 1.5,
  },
  quoteDate: {
    fontSize: 11,
    color: '#8A9298',
    marginTop: 3,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#8A9298',
    marginBottom: 6,
  },
  personalityBox: {
    padding: '12px 14px',
    background: 'rgba(107,191,168,0.1)',
    borderRadius: 12,
    border: '1px solid rgba(107,191,168,0.2)',
    marginBottom: 12,
  },
  personalityText: {
    fontSize: 13,
    color: '#3A4248',
    lineHeight: 1.5,
  },
  reflectionPrompt: {
    fontSize: 13,
    color: '#5A6268',
    fontStyle: 'italic' as const,
    lineHeight: 1.5,
  },
  experimentBox: {
    padding: '12px 14px',
    background: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 12,
  },
  experimentText: {
    fontSize: 13,
    color: '#3A4248',
    lineHeight: 1.5,
  },
  feedbackSection: {
    borderTop: '1px solid rgba(0,0,0,0.08)',
    paddingTop: 12,
    marginTop: 4,
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1A2026',
    marginBottom: 8,
  },
  feedbackRow: {
    display: 'flex',
    gap: 6,
  },
  feedbackBtn: {
    fontSize: 13,
    fontWeight: 500,
    color: '#6B7580',
    background: 'transparent',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: '8px 16px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  feedbackBtnActive: {
    background: 'var(--accent-primary)',
    color: '#fff',
    borderColor: 'var(--accent-primary)',
  },
};
