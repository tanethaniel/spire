import React from 'react';
import { captureException } from '../lib/posthog';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    captureException(error, { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.icon}>!</div>
            <div style={styles.title}>Something went wrong</div>
            <div style={styles.body}>
              The app ran into an unexpected error. Your data is safe — tap below to reload.
            </div>
            <button style={styles.button} onClick={() => window.location.reload()}>
              Reload Spire
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg-base, #F2F0E6)',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    textAlign: 'center',
    padding: '32px 24px',
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 20,
    boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(212,117,106,0.15)',
    color: '#D4756A',
    fontSize: 24,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1A2026',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#6B7580',
    lineHeight: 1.5,
    marginBottom: 24,
  },
  button: {
    width: '100%',
    padding: '14px 0',
    background: 'var(--accent-primary, #6BBFA8)',
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
