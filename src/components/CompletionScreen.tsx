import { useEffect, useState } from 'react';

interface CompletionScreenProps {
  streak: number;
  onComplete: () => void;
}

export function CompletionScreen({ streak, onComplete }: CompletionScreenProps) {
  const [phase, setPhase] = useState<'glow' | 'logged' | 'text'>('glow');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logged'), 400);
    const t2 = setTimeout(() => setPhase('text'), 1000);
    const t3 = setTimeout(onComplete, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div style={styles.page}>
      <div style={{
        ...styles.glowOrb,
        opacity: phase !== 'glow' ? 1 : 0.4,
        transform: phase !== 'glow' ? 'scale(1)' : 'scale(0.6)',
      }} />

      <div style={{
        ...styles.center,
        opacity: phase === 'glow' ? 0 : 1,
        transform: phase === 'glow' ? 'scale(0.8)' : 'scale(1)',
      }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.95)" />
          <path
            d="M15 24.5L21 30.5L33 18.5"
            stroke="var(--accent-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={styles.loggedText}>Logged</div>
      </div>

      <div style={{
        ...styles.subtitle,
        opacity: phase === 'text' ? 1 : 0,
        transform: phase === 'text' ? 'translateY(0)' : 'translateY(8px)',
      }}>
        <div style={styles.subtitleText}>View today's entry in Receipts</div>
        {streak > 0 && (
          <div style={styles.streakText}>
            Day <span style={{ color: 'var(--accent-primary)' }}>{streak}</span>
          </div>
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(107,191,168,0.35) 0%, rgba(107,191,168,0.12) 40%, rgba(107,191,168,0.03) 65%, transparent 80%)',
    filter: 'blur(20px)',
    transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    zIndex: 1,
    transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
  },
  loggedText: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: -0.5,
    color: 'var(--text-primary)',
  },
  subtitle: {
    position: 'absolute',
    bottom: 120,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
  },
  subtitleText: {
    fontSize: 15,
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  streakText: {
    fontSize: 13,
    color: 'var(--text-ghost)',
  },
};
