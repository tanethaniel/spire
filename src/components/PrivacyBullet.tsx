import { useState } from 'react';

interface PrivacyBulletProps {
  icon: string;
  title: string;
  detail: string;
}

export function PrivacyBullet({ icon, title, detail }: PrivacyBulletProps) {
  const [open, setOpen] = useState(false);

  return (
    <button style={styles.bullet} onClick={() => setOpen(!open)}>
      <div style={styles.header}>
        <span style={styles.icon}>{icon}</span>
        <span style={styles.title}>{title}</span>
        <span style={{
          ...styles.chevron,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ›
        </span>
      </div>
      <div style={{
        ...styles.detail,
        maxHeight: open ? 120 : 0,
        opacity: open ? 1 : 0,
        marginTop: open ? 8 : 0,
      }}>
        {detail}
      </div>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bullet: {
    width: '100%',
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderTop: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 14,
    padding: '14px 16px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    fontSize: 18,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  chevron: {
    fontSize: 20,
    color: 'var(--text-ghost)',
    transition: 'transform 0.2s',
    flexShrink: 0,
  },
  detail: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    paddingLeft: 28,
    overflow: 'hidden',
    transition: 'max-height 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease',
  },
};
