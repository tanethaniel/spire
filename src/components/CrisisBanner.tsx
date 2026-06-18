import React, { useState } from 'react';

interface CrisisBannerProps {
  onDismiss?: () => void;
}

export function CrisisBanner({ onDismiss }: CrisisBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.header}>
        <div style={styles.icon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        <div style={styles.title}>Support is available</div>
        {onDismiss && (
          <button
            style={styles.dismissBtn}
            onClick={() => { setDismissed(true); onDismiss(); }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <div style={styles.body}>
        If you're going through a difficult time, you don't have to face it alone.
      </div>
      <div style={styles.resources}>
        <a href="tel:988" style={styles.resourceLink}>
          <span style={styles.resourceName}>988 Suicide &amp; Crisis Lifeline</span>
          <span style={styles.resourceAction}>Call or text 988</span>
        </a>
        <a href="sms:741741&body=HELLO" style={styles.resourceLink}>
          <span style={styles.resourceName}>Crisis Text Line</span>
          <span style={styles.resourceAction}>Text HELLO to 741741</span>
        </a>
      </div>
      <div style={styles.footer}>
        Spire is a reflection tool, not a substitute for professional support.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(212,117,106,0.25)',
    borderRadius: 16,
    padding: '16px 18px',
    marginBottom: 16,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  icon: {
    color: '#D4756A',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1A2026',
    flex: 1,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    padding: 4,
    color: '#8A9298',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  body: {
    fontSize: 13,
    color: '#5A6268',
    lineHeight: 1.5,
    marginBottom: 12,
  },
  resources: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    marginBottom: 12,
  },
  resourceLink: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'rgba(212,117,106,0.08)',
    borderRadius: 12,
    textDecoration: 'none',
    color: 'inherit',
  },
  resourceName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1A2026',
  },
  resourceAction: {
    fontSize: 12,
    fontWeight: 600,
    color: '#D4756A',
  },
  footer: {
    fontSize: 11,
    color: '#8A9298',
    lineHeight: 1.4,
  },
};
