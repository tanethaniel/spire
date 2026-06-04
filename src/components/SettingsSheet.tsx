import { supabase } from '../lib/supabase';

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

        <button
          style={styles.signOut}
          onClick={() => {
            localStorage.removeItem('google_provider_token');
            supabase.auth.signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.25)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    background: 'rgba(255,255,255,0.75)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTop: '1px solid rgba(255,255,255,0.5)',
    padding: '12px 24px 32px',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'rgba(0,0,0,0.12)',
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
    background: 'rgba(0,0,0,0.12)',
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
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  knobOn: {
    transform: 'translateX(22px)',
  },
  note: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    background: 'rgba(255,255,255,0.45)',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 20,
  },
  done: {
    width: '100%',
    padding: 16,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(212,145,122,0.25)',
  },
  signOut: {
    width: '100%',
    padding: 14,
    background: 'none',
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginTop: 8,
    cursor: 'pointer',
  },
};
