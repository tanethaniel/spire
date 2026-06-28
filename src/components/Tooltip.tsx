import { useCallback, useState } from 'react';

// Tracks whether a guide chip has been seen. localStorage is an instant,
// per-device cache; the optional server-backed args make it durable across
// cache clears (iOS PWAs evict localStorage), so chips stay dismissed.
export function useTooltipSeen(
  key: string,
  serverSeen?: string[],
  onServerMark?: (key: string) => void,
): [boolean, () => void] {
  const storageKey = `tooltip_seen_${key}`;
  const [localSeen, setLocalSeen] = useState(() => localStorage.getItem(storageKey) === '1');
  const seen = localSeen || (serverSeen?.includes(key) ?? false);
  const markSeen = useCallback(() => {
    localStorage.setItem(storageKey, '1');
    setLocalSeen(true);
    onServerMark?.(key);
  }, [storageKey, key, onServerMark]);
  return [seen, markSeen];
}

interface TooltipProps {
  visible: boolean;
  onDismiss: () => void;
  text: string | React.ReactNode;
  style?: React.CSSProperties;
}

export function Tooltip({ visible, onDismiss, text, style }: TooltipProps) {
  if (!visible) return null;

  return (
    <div style={{ ...styles.wrapper, ...style }} onClick={onDismiss}>
      <div style={styles.card}>
        <div style={styles.text}>{text}</div>
        <div style={styles.hint}>Tap to dismiss</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    zIndex: 50,
    animation: 'fadeIn 0.3s ease',
    cursor: 'pointer',
  },
  card: {
    background: 'rgba(40,45,50,0.85)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: '14px 18px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  text: {
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.5,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 6,
  },
};
