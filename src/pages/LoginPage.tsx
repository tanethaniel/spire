import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.events.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.content}>
        <div style={styles.wordmark}>spire<span style={{ color: 'var(--accent-primary)' }}>.</span></div>
        <p style={styles.tagline}>Voice-first daily reflection</p>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={styles.googleBtn}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.02 24.02 0 0 0 0 21.56l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--error)', marginTop: 12 }}>{error}</div>
        )}

        <p style={styles.privacy}>
          Sign in to connect your calendar and start reflecting.
          <br />
          Your journal entries are private — only you can see them.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    textAlign: 'center' as const,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: 'var(--text-muted)',
    marginBottom: 40,
  },
  googleBtn: {
    width: '100%',
    padding: 16,
    background: 'rgba(255,255,255,0.25)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderTop: '1px solid rgba(255,255,255,0.4)',
    boxShadow: 'var(--glass-shadow-lg)',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  privacy: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    marginTop: 20,
    lineHeight: 1.6,
  },
};
