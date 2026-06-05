import { useState } from 'react';
import type { JournalEntry } from '../types/session';

interface HistoryPageProps {
  entries: JournalEntry[];
  loading: boolean;
  error: boolean;
  interpretationEnabled: boolean;
  onOpenSettings: () => void;
}

const Q_LABELS = ['Context', 'Emotions', 'Memory', 'Learning', 'Self', 'Anything else'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function HistoryPage({ entries, loading, error, interpretationEnabled, onOpenSettings }: HistoryPageProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>History</div>
        <button style={styles.gear} onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>

      <div style={styles.body}>
        {loading ? (
          <div style={styles.empty}>Loading your reflections…</div>
        ) : error ? (
          <div style={styles.empty}>Couldn't load your history. Check your connection.</div>
        ) : entries.filter(e => e.transcripts.some(Boolean)).length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>☰</div>
            <div style={styles.emptyTitle}>No reflections yet</div>
            <div style={styles.emptySub}>Your past entries will appear here once you complete your first session.</div>
          </div>
        ) : (
          entries.filter(e => e.transcripts.some(Boolean)).map(entry => {
            const isOpen = expanded === entry.id;
            const answered = entry.transcripts.filter(Boolean).length;
            return (
              <div key={entry.id} style={styles.card}>
                <div style={styles.cardHead} onClick={() => setExpanded(isOpen ? null : entry.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.date}>
                      {formatDate(entry.createdAt)}
                    </div>
                    <div style={styles.meta}>{answered} of 6 answered</div>
                    {interpretationEnabled && entry.themes && entry.themes.length > 0 && (
                      <div style={styles.themes}>
                        {entry.themes.map((t, i) => (
                          <span key={i} style={styles.themeChip}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(180deg)' : 'none' }}>∨</span>
                </div>

                {isOpen && (
                  <div style={styles.cardBody}>
                    {interpretationEnabled && entry.insight && (
                      <div style={styles.insight}>✦ {entry.insight}</div>
                    )}
                    {entry.transcripts.map((t, i) =>
                      t ? (
                        <div key={i} style={styles.answer}>
                          <div style={styles.answerLabel}>Q{i + 1} · {Q_LABELS[i]}</div>
                          <div style={styles.answerText}>{t}</div>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%', maxWidth: 430, minHeight: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px 12px',
  },
  title: { fontSize: 26, fontWeight: 700, letterSpacing: -0.5 },
  gear: {
    background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)',
    minHeight: 44, minWidth: 44,
  },
  body: { flex: 1, overflowY: 'auto', padding: '0 24px 24px' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: '64px 16px', gap: 8,
    color: 'var(--text-ghost)', fontSize: 14,
  },
  emptyIcon: { fontSize: 32, color: 'var(--text-ghost)', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)' },
  emptySub: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 280 },
  card: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 16, marginBottom: 10, overflow: 'hidden',
  },
  cardHead: { display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' },
  date: { fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  themes: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  themeChip: {
    fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.35)',
    border: '1px solid var(--border-glass)', borderRadius: 12, padding: '3px 9px',
  },
  chevron: { fontSize: 14, color: 'var(--text-ghost)', transition: 'transform 0.2s', marginLeft: 8 },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.2)' },
  insight: {
    fontSize: 14, fontStyle: 'italic', color: 'var(--accent-primary)',
    paddingTop: 12, marginBottom: 4, lineHeight: 1.5,
  },
  answer: { paddingTop: 12 },
  answerLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--accent-primary)',
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
  },
  answerText: { fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 },
};
