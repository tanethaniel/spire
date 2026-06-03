export type AppView = 'home' | 'history' | 'insights';

interface BottomNavProps {
  view: AppView;
  onChange: (view: AppView) => void;
  showInsights: boolean; // hidden in Log mode
}

const ITEMS: { view: AppView; label: string; icon: string }[] = [
  { view: 'home', label: 'Reflect', icon: '◉' },
  { view: 'history', label: 'History', icon: '☰' },
  { view: 'insights', label: 'Insights', icon: '✦' },
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
    background: 'var(--bg-surface)',
    borderTop: '1px solid var(--border-subtle)',
    padding: '8px 12px',
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
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
    color: 'var(--text-ghost)',
    transition: 'color 0.15s',
  },
  itemActive: {
    color: 'var(--accent-primary)',
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
