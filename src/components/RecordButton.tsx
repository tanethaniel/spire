import { useCallback, useRef, useState } from 'react';

interface RecordButtonProps {
  disabled: boolean;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function RecordButton({ disabled, recording, onStart, onStop }: RecordButtonProps) {
  const [pressed, setPressed] = useState(false);
  const activeRef = useRef(false);

  const handleDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    if (activeRef.current) return;
    activeRef.current = true;
    setPressed(true);
    onStart();
  }, [disabled, onStart]);

  const handleUp = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setPressed(false);
    onStop();
  }, [onStop]);

  return (
    <div style={styles.wrapper}>
      {recording && (
        <>
          <div style={{ ...styles.ripple, animationDelay: '0s' }} />
          <div style={{ ...styles.ripple, animationDelay: '0.6s' }} />
          <div style={{ ...styles.ripple, animationDelay: '1.2s' }} />
        </>
      )}
      <button
        style={{
          ...styles.button,
          ...(disabled ? styles.locked : {}),
          ...(recording ? styles.recording : {}),
          ...(pressed && !recording ? styles.pressed : {}),
        }}
        onTouchStart={handleDown}
        onTouchEnd={handleUp}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        disabled={disabled}
        aria-label={recording ? 'Release to stop recording' : 'Hold to record'}
        aria-pressed={recording}
      >
        {recording ? (
          <div style={styles.stopIcon} />
        ) : (
          <span style={styles.micIcon}>🎙</span>
        )}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    position: 'relative',
    zIndex: 1,
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    touchAction: 'none',
  },
  locked: {
    background: '#1A1A26',
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  recording: {
    background: '#2A1A1A',
    border: '2px solid var(--error)',
    boxShadow: '0 0 0 0 rgba(212,117,106,0.2)',
  },
  pressed: {
    transform: 'scale(0.94)',
    background: 'var(--accent-hover)',
    boxShadow: '0 0 0 12px rgba(200,169,122,0.13)',
  },
  micIcon: {
    fontSize: 28,
    lineHeight: 1,
  },
  stopIcon: {
    width: 20,
    height: 20,
    background: 'var(--error)',
    borderRadius: 4,
  },
  ripple: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: '50%',
    border: '1.5px solid rgba(200,169,122,0.13)',
    animation: 'ripple 2s ease-out infinite',
  },
};
