export type AppView = 'home' | 'history' | 'insights';

interface BottomNavProps {
  view: AppView;
  onChange: (view: AppView) => void;
  showInsights: boolean; // hidden in Log mode
}

const ITEMS: { view: AppView; label: string; icon: string }[] = [
  { view: 'home', label: 'Reflect', icon: '◉' },
  { view: 'insights', label: 'Review', icon: '✦' },
  { view: 'history', label: 'Receipts', icon: '☰' },
];

export function BottomNav({ view, onChange, showInsights }: BottomNavProps) {
  const items = ITEMS.filter(i => i.view !== 'insights' || showInsights);

  return (
    <nav style={styles.nav}>
      {items.map(item => {
        const active = view === item.view;
        return (
          <button
            key={item.view}
            onClick={() => onChange(item.view)}
            style={{ ...styles.item, ...(active ? styles.itemActive : {}) }}
          >
            <span style={styles.icon}>{item.icon}</span>
            <span style={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.22)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    padding: '8px 12px',
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    background: 'none',
    border: 'none',
    padding: '6px 18px',
    minHeight: 44,
    color: 'var(--text-muted)',
    transition: 'color 0.15s',
  },
  itemActive: {
    color: 'var(--text-primary)',
  },
  icon: {
    fontSize: 18,
    lineHeight: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
};
