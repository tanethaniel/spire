interface SettingsSheetProps {
  interpretationEnabled: boolean;
  onToggle: (next: boolean) => void;
  onClose: () => void;
}

// A simple bottom sheet holding the one setting that matters today: whether
// Spire interprets entries or acts as a plain voice log.
export function SettingsSheet({ interpretationEnabled, onToggle, onClose }: SettingsSheetProps) {
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.handle} />
        <div style={styles.title}>Settings</div>

        <div style={styles.row}>
          <div style={styles.rowText}>
            <div style={styles.rowLabel}>Interpret my reflections</div>
            <div style={styles.rowSub}>
              {interpretationEnabled
                ? 'On — Spire finds themes, insights, and patterns in your words.'
                : 'Off — Log mode. Your words are transcribed and saved, but never analyzed.'}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={interpretationEnabled}
            onClick={() => onToggle(!interpretationEnabled)}
            style={{
              ...styles.toggle,
              ...(interpretationEnabled ? styles.toggleOn : {}),
            }}
          >
            <span style={{
              ...styles.knob,
              ...(interpretationEnabled ? styles.knobOn : {}),
            }} />
          </button>
        </div>

        <div style={styles.note}>
          {interpretationEnabled
            ? 'Turning this off stops Spire from sending your transcripts to any analysis model and hides themes, insights, and tips everywhere.'
            : 'Your voice is still transcribed to text so you can read it back. Nothing is sent for interpretation while Log mode is on.'}
        </div>

        <button style={styles.done} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    background: 'var(--bg-elevated)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTop: '1px solid var(--border-subtle)',
    padding: '12px 24px 32px',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--border-subtle)',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 4,
  },
  rowSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.45,
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    border: 'none',
    background: '#2A2A38',
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
    cursor: 'pointer',
  },
  toggleOn: {
    background: 'var(--accent-primary)',
  },
  knob: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
  },
  knobOn: {
    transform: 'translateX(22px)',
  },
  note: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    lineHeight: 1.5,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 20,
  },
  done: {
    width: '100%',
    padding: 16,
    background: 'var(--accent-primary)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
  },
};
