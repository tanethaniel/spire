import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.content}>
        <div style={styles.wordmark}>spire<span style={{ color: 'var(--accent-primary)' }}>.</span></div>
        <p style={styles.tagline}>Voice-first daily reflection</p>

        {sent ? (
          <div style={styles.sentCard}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              We sent a magic link to <strong style={{ color: 'var(--text-secondary)' }}>{email}</strong>.
              Click it to sign in.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={styles.input}
              autoFocus
            />
            {error && (
              <div style={{ fontSize: 13, color: 'var(--error)', marginTop: -8 }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
            <p style={styles.privacy}>No password needed. Just you and your reflections.</p>
          </form>
        )}
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
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  input: {
    width: '100%',
    padding: '16px 18px',
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1.5px solid var(--border-glass)',
    borderRadius: 14,
    color: 'var(--text-primary)',
    fontSize: 16,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  button: {
    width: '100%',
    padding: 18,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.2,
    transition: 'all 0.15s',
  },
  privacy: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    marginTop: 4,
  },
  sentCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 20,
    padding: 32,
  },
};
