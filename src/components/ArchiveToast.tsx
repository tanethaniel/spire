import { useEffect } from 'react';

interface ArchiveToastProps {
  title: string;
  onDismiss: () => void;
  onViewArchive: () => void;
}

export function ArchiveToast({ title, onDismiss, onViewArchive }: ArchiveToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={styles.toast}>
      <div style={styles.text}>
        <span style={styles.title}>"{title}"</span> has been archived.
      </div>
      <button style={styles.link} onClick={onViewArchive}>
        View in archive
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 14px',
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    boxShadow: 'var(--glass-shadow)',
    marginBottom: 10,
    animation: 'slideUp 0.3s ease-out',
  },
  text: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  link: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    padding: 0,
    flexShrink: 0,
  },
};
