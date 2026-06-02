interface CalendarConsentProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function CalendarConsent({ onAccept, onDecline }: CalendarConsentProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
        <div style={styles.title}>Before you share your calendar</div>

        <div style={styles.body}>
          <p style={styles.para}>
            You're about to upload a screenshot of your calendar. Here's exactly what happens:
          </p>
          <ul style={styles.list}>
            <li>Your screenshot is sent to <strong style={styles.strong}>Claude AI</strong> to extract today's event names and times</li>
            <li>The screenshot itself is <strong style={styles.strong}>not stored</strong> anywhere</li>
            <li>The extracted event names are <strong style={styles.strong}>saved with this journal entry</strong> to provide context</li>
            <li>Only you can see your journal entries</li>
          </ul>
          <p style={styles.para}>
            If your calendar has sensitive appointments (health, therapy, confidential meetings), consider skipping this step.
          </p>
        </div>

        <button style={styles.acceptBtn} onClick={onAccept}>
          Continue — choose screenshot
        </button>
        <button style={styles.declineBtn} onClick={onDecline}>
          Skip calendar
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,10,15,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 24,
    padding: 28,
    maxWidth: 380,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  body: {
    marginBottom: 20,
  },
  para: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: 10,
    margin: '0 0 10px',
  },
  list: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.8,
    paddingLeft: 18,
    margin: '0 0 10px',
  },
  strong: {
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  acceptBtn: {
    width: '100%',
    padding: '14px 16px',
    background: 'var(--accent-primary)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 10,
    cursor: 'pointer',
  },
  declineBtn: {
    width: '100%',
    padding: '12px 16px',
    background: 'none',
    color: 'var(--text-ghost)',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
  },
};
