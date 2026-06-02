interface MicPermissionProps {
  status: 'denied' | 'prompt' | 'unknown';
  onRequest: () => void;
}

export function MicPermission({ status, onRequest }: MicPermissionProps) {
  const isDenied = status === 'denied';

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎙</div>
        <div style={styles.title}>
          {isDenied ? 'Microphone blocked' : 'Spire needs your microphone'}
        </div>
        <div style={styles.body}>
          {isDenied ? (
            <>
              Your browser is blocking microphone access. To fix this:
              <ol style={{ textAlign: 'left', paddingLeft: 20, marginTop: 12, lineHeight: 1.8 }}>
                <li>Tap the lock icon in your browser's address bar</li>
                <li>Find "Microphone" and change it to "Allow"</li>
                <li>Refresh the page</li>
              </ol>
            </>
          ) : (
            <>
              Spire is voice-only. Your recordings are sent to{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>OpenAI Whisper</strong>{' '}
              for transcription, then immediately deleted from our servers. Your transcript is stored privately as your journal entry — only you can see it.
            </>
          )}
        </div>
        {!isDenied && (
          <button style={styles.button} onClick={onRequest}>
            Allow microphone
          </button>
        )}
        <div style={styles.privacy}>Audio is never stored on our servers.</div>
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
    padding: 32,
    maxWidth: 380,
    width: '100%',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: 24,
  },
  button: {
    width: '100%',
    padding: 16,
    background: 'var(--accent-primary)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 16,
  },
  privacy: {
    fontSize: 12,
    color: 'var(--text-ghost)',
  },
};
