import { useCallback, useEffect, useRef, useState } from 'react';

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

  // --- Mouse drag via window listeners (prevents mouseLeave cutting the drag short) ---
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!activeRef.current || lockedRef.current) return;
    const dx = Math.max(0, e.clientX - startXRef.current);
    setDragX(dx);

    if (dx >= LOCK_THRESHOLD) {
      lockedRef.current = true;
      setDragX(0);
      onLock();
    }
  }, [onLock]);

  const handleMouseUp = useCallback(() => {
    if (!activeRef.current) return;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    if (lockedRef.current) return;
    activeRef.current = false;
    setDragX(0);
    onStop();
  }, [onStop, handleMouseMove]);

  // Clean up window listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

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

    // For mouse: attach move/up to window so drag works outside the button
    if (!('touches' in e)) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
  }, [disabled, onStart, handleMouseMove, handleMouseUp]);

  // Touch-specific handlers (touch events track globally by default)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!activeRef.current || lockedRef.current) return;
    const dx = Math.max(0, e.touches[0].clientX - startXRef.current);
    setDragX(dx);

    if (dx >= LOCK_THRESHOLD) {
      lockedRef.current = true;
      setDragX(0);
      onLock();
    }
  }, [onLock]);

  const handleTouchEnd = useCallback(() => {
    if (!activeRef.current) return;
    if (lockedRef.current) return;
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
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleDown}
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
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
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
    width: 96,
    height: 96,
  },
  button: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'rgba(107,191,168,0.25)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1.5px solid rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
    position: 'relative',
    zIndex: 1,
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    touchAction: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 8px 32px rgba(107,191,168,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
  },
  locked: {
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: 'none',
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  recordingState: {
    background: 'rgba(200,90,74,0.15)',
    border: '2px solid var(--error)',
    boxShadow: '0 8px 32px rgba(200,90,74,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
  },
  lockedRecording: {
    background: 'rgba(200,90,74,0.1)',
    border: '2px solid var(--error)',
    cursor: 'pointer',
    boxShadow: '0 8px 32px rgba(200,90,74,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
  },
  micIcon: {
    fontSize: 34,
    lineHeight: 1,
  },
  stopIcon: {
    width: 24,
    height: 24,
    background: 'var(--error)',
    borderRadius: 5,
  },
  lockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    fontSize: 14,
    background: 'rgba(255,255,255,0.3)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '50%',
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 104,
    height: 104,
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
