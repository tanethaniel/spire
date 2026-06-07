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
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div style={styles.handle} />

        {/* Close button */}
        <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={styles.section}>
          <div style={styles.badge}>
            {pattern.confidence === 'early_signal' && <span style={styles.badgeDot} />}
            {CONFIDENCE_LABELS[pattern.confidence]}
          </div>
          <div style={styles.title}>{pattern.title}</div>
          {pattern.evidenceSummary && (
            <div style={styles.evidenceSummary}>{pattern.evidenceSummary}</div>
          )}
        </div>

        <div style={styles.divider} />

        {/* Reflective Note */}
        <div style={styles.section}>
          <div style={styles.noteText}>{pattern.note}</div>
        </div>

        {/* Goal Connection */}
        {pattern.goalConnection && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.sectionLabel}>YOUR GOAL</div>
              <div style={styles.goalText}>{pattern.goalConnection}</div>
            </div>
          </>
        )}

        {/* Personality Framing */}
        {pattern.personalityFraming && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.sectionLabel}>PERSONALITY LENS</div>
              <div style={styles.personalityText}>{pattern.personalityFraming}</div>
            </div>
          </>
        )}

        {/* Evidence */}
        {pattern.supportingQuotes && pattern.supportingQuotes.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.sectionLabel}>EVIDENCE</div>
              {pattern.supportingQuotes.map((q, i) => (
                <div key={i} style={styles.quoteCard}>
                  <div style={styles.quoteText}>{q.quote}</div>
                  <div style={styles.quoteDate}>{formatQuoteDate(q.date)}</div>
                </div>
              ))}
              {pattern.relatedCalendarContext && Object.keys(pattern.relatedCalendarContext).length > 0 && (
                <div style={styles.calendarContext}>
                  {Object.entries(pattern.relatedCalendarContext).map(([key, value]) => (
                    <div key={key} style={styles.calendarRow}>
                      <span style={styles.calendarKey}>{key}:</span>{' '}
                      <span style={styles.calendarValue}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Reflection Prompt */}
        {pattern.reflectionPrompt && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.promptCard}>
                <div style={styles.sectionLabel}>REFLECT</div>
                <div style={styles.promptText}>{pattern.reflectionPrompt}</div>
              </div>
            </div>
          </>
        )}

        {/* Suggested Experiment */}
        {pattern.suggestedExperiment && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.glassCard}>
                <div style={styles.sectionLabel}>TRY THIS</div>
                <div style={styles.experimentText}>{pattern.suggestedExperiment}</div>
              </div>
            </div>
          </>
        )}

        {/* If-Then Plan */}
        {pattern.suggestedIfThenPlan && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <div style={styles.glassCard}>
                <div style={styles.sectionLabel}>IF-THEN PLAN</div>
                <div style={styles.experimentText}>{pattern.suggestedIfThenPlan.fullText}</div>
              </div>
            </div>
          </>
        )}

        <div style={styles.divider} />

        {/* Feedback */}
        <div style={styles.section}>
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

        {/* Action buttons */}
        <div style={styles.actionSection}>
          {pattern.status !== 'saved' && (
            <button style={styles.saveBtn} onClick={() => onSave(pattern.id)}>
              Save Pattern
            </button>
          )}
          <button style={styles.dismissBtn} onClick={() => onDismiss(pattern.id)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 60,
    animation: 'fadeIn 0.2s ease-out',
  },
  sheet: {
    position: 'relative',
    width: '100%',
    maxWidth: 430,
    maxHeight: '85vh',
    overflowY: 'auto' as const,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: '20px 20px 0 0',
    boxShadow: 'var(--glass-shadow-lg)',
    padding: '12px 24px 32px',
    animation: 'slideUp 0.3s ease-out',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'rgba(0,0,0,0.12)',
    margin: '0 auto 16px',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid var(--border-glass)',
    borderRadius: 10,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 0,
  },
  section: {
    padding: '12px 0',
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.15)',
  },
  // Header
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
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.3,
    letterSpacing: -0.3,
    marginBottom: 6,
    paddingRight: 32,
  },
  evidenceSummary: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    lineHeight: 1.5,
  },
  // Note
  noteText: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.7,
  },
  // Goal
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-ghost)',
    marginBottom: 8,
  },
  goalText: {
    fontSize: 14,
    color: 'var(--accent-primary)',
    lineHeight: 1.5,
  },
  // Personality
  personalityText: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  // Evidence quotes
  quoteCard: {
    borderLeft: '2px solid var(--accent-primary)',
    paddingLeft: 12,
    marginBottom: 12,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic' as const,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  quoteDate: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    marginTop: 4,
  },
  calendarContext: {
    marginTop: 12,
    padding: '10px 12px',
    background: 'var(--bg-elevated)',
    borderRadius: 10,
  },
  calendarRow: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  calendarKey: {
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  calendarValue: {
    color: 'var(--text-secondary)',
  },
  // Reflection prompt card
  promptCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderLeft: '2px solid var(--accent-primary)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  promptText: {
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  // Glass card (experiment, if-then)
  glassCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  experimentText: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
  // Feedback
  feedbackLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 10,
  },
  feedbackRow: {
    display: 'flex',
    gap: 8,
  },
  feedbackBtn: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'transparent',
    border: '1px solid var(--border-glass)',
    borderRadius: 14,
    padding: '10px 20px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  feedbackBtnActive: {
    background: 'var(--accent-primary)',
    color: '#fff',
    borderColor: 'var(--accent-primary)',
  },
  // Action buttons
  actionSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    paddingTop: 12,
  },
  saveBtn: {
    width: '100%',
    padding: 14,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  dismissBtn: {
    width: '100%',
    padding: 14,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};
