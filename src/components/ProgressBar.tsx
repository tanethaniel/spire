import { QUESTIONS } from '../types/session';

interface ProgressBarProps {
  currentQuestion: number;
  onBack: () => void;
}

export function ProgressBar({ currentQuestion, onBack }: ProgressBarProps) {
  const total = QUESTIONS.length;
  const pct = ((Math.min(currentQuestion, total - 1) + 1) / total) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.back}>‹ Back</button>
        <span style={styles.label}>Question {Math.min(currentQuestion + 1, total)} of {total}</span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${pct}%` }} />
      </div>
      <div style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.dot,
              ...(i < currentQuestion ? styles.dotDone : {}),
              ...(i === currentQuestion ? styles.dotActive : {}),
            }}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px 24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 14,
    padding: '4px 0',
  },
  label: {
    fontSize: 13,
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  track: {
    width: '100%',
    height: 2,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    background: 'var(--accent-primary)',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  },
  dots: {
    display: 'flex',
    gap: 6,
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    transition: 'all 0.2s',
  },
  dotDone: {
    background: 'var(--accent-primary)',
  },
  dotActive: {
    background: 'var(--accent-primary)',
    width: 18,
    borderRadius: 3,
  },
};
