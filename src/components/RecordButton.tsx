import { useCallback, useRef, useState } from 'react';

interface RecordButtonProps {
  disabled: boolean;
  recording: boolean;
  locked: boolean;
  onStart: () => void;
  onStop: () => void;
  onLock: () => void;
}

const LOCK_THRESHOLD = 60; // px to drag right to lock

export function RecordButton({ disabled, recording, locked, onStart, onStop, onLock }: RecordButtonProps) {
  const [dragX, setDragX] = useState(0);
  const activeRef = useRef(false);
  const startXRef = useRef(0);
  const lockedRef = useRef(false);

  const lockProgress = Math.min(dragX / LOCK_THRESHOLD, 1);
  const isLocking = dragX > 10;

  const handleDown = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    if (activeRef.current) return;
    activeRef.current = true;
    lockedRef.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    startXRef.current = clientX;
    setDragX(0);
    onStart();
  }, [disabled, onStart]);

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!activeRef.current || lockedRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const dx = Math.max(0, clientX - startXRef.current);
    setDragX(dx);

    if (dx >= LOCK_THRESHOLD) {
      lockedRef.current = true;
      setDragX(0);
      onLock();
    }
  }, [onLock]);

  const handleUp = useCallback(() => {
    if (!activeRef.current) return;
    if (lockedRef.current) return; // locked — don't stop
    activeRef.current = false;
    setDragX(0);
    onStop();
  }, [onStop]);

  // When locked, tapping stops
  const handleLockedTap = useCallback(() => {
    if (locked) {
      activeRef.current = false;
      lockedRef.current = false;
      setDragX(0);
      onStop();
    }
  }, [locked, onStop]);

  return (
    <div style={styles.outer}>
      {/* Lock hint */}
      <div style={{
        ...styles.lockHint,
        opacity: isLocking && !locked ? lockProgress : 0,
      }}>
        <div style={{
          ...styles.lockTrack,
          width: 80 + lockProgress * 60,
        }}>
          <span style={{ fontSize: 12, color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
            → slide to lock
          </span>
        </div>
      </div>

      <div style={styles.wrapper}>
        {/* Ripple rings when recording */}
        {recording && (
          <>
            <div style={{ ...styles.ripple, animationDelay: '0s' }} />
            <div style={{ ...styles.ripple, animationDelay: '0.6s' }} />
          </>
        )}

        {locked ? (
          // Locked state — tap to stop
          <button
            style={{ ...styles.button, ...styles.lockedRecording }}
            onClick={handleLockedTap}
            aria-label="Tap to stop recording"
          >
            <div style={styles.stopIcon} />
            <div style={styles.lockBadge}>🔒</div>
          </button>
        ) : (
          <button
            style={{
              ...styles.button,
              ...(disabled ? styles.locked : {}),
              ...(recording ? styles.recordingState : {}),
              transform: `translateX(${Math.min(dragX * 0.4, 24)}px)`,
            }}
            onTouchStart={handleDown}
            onTouchMove={handleMove}
            onTouchEnd={handleUp}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
            disabled={disabled}
            aria-label={recording ? 'Release to stop' : 'Hold to record'}
            aria-pressed={recording}
          >
            {recording ? (
              <div style={styles.stopIcon} />
            ) : (
              <span style={styles.micIcon}>🎙</span>
            )}
          </button>
        )}
      </div>

      {recording && !locked && (
        <div style={styles.hint}>
          {isLocking ? 'Keep sliding to lock →' : 'Slide → to lock hands-free'}
        </div>
      )}
      {locked && (
        <div style={{ ...styles.hint, color: 'var(--accent-primary)' }}>
          Locked — tap to stop
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    position: 'relative',
  },
  lockHint: {
    position: 'absolute',
    top: -32,
    display: 'flex',
    alignItems: 'center',
    transition: 'opacity 0.15s',
  },
  lockTrack: {
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 20,
    padding: '4px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'width 0.1s ease',
  },
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
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
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    position: 'relative',
    zIndex: 1,
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    touchAction: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 4px 20px rgba(107,191,168,0.3)',
  },
  locked: {
    background: 'rgba(255,255,255,0.3)',
    boxShadow: 'none',
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  recordingState: {
    background: 'rgba(200,90,74,0.15)',
    border: '2px solid var(--error)',
    boxShadow: '0 4px 20px rgba(200,90,74,0.25)',
  },
  lockedRecording: {
    background: 'rgba(200,90,74,0.1)',
    border: '2px solid var(--error)',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(200,90,74,0.25)',
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
  lockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    fontSize: 14,
    background: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: '50%',
    border: '1.5px solid rgba(200,90,74,0.2)',
    animation: 'ripple 2s ease-out infinite',
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    letterSpacing: '0.02em',
    textAlign: 'center' as const,
  },
};
