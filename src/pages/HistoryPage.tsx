import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { JournalEntry } from '../types/session';

interface HistoryPageProps {
  entries: JournalEntry[];
  loading: boolean;
  error: boolean;
  interpretationEnabled: boolean;
  visible: boolean;
  onOpenSettings: () => void;
  onDeleteEntry: (id: string) => void;
}

const Q_LABELS = ['Context', 'Emotions', 'Memory', 'Learning', 'Self', 'Anything else'];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBREVS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function matchesDateSearch(entry: JournalEntry, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const d = new Date(entry.createdAt);

  const dayName = DAY_NAMES[d.getDay()];
  if (dayName.startsWith(q) || q === dayName.slice(0, 3)) return true;

  const monthName = MONTH_NAMES[d.getMonth()];
  const monthAbbrev = MONTH_ABBREVS[d.getMonth()];
  const dayNum = d.getDate().toString();

  // "june 2", "jun 5", "5"
  const parts = q.split(/\s+/);
  if (parts.length === 2) {
    const [p1, p2] = parts;
    if ((monthName.startsWith(p1) || monthAbbrev === p1) && dayNum === p2) return true;
  }
  if (parts.length === 1) {
    if (monthName.startsWith(q) || monthAbbrev === q) return true;
    if (q === dayNum && q.length <= 2) return true;
  }

  return false;
}

function matchesKeyword(entry: JournalEntry, keyword: string): boolean {
  if (!keyword.trim()) return true;
  const kw = keyword.trim().toLowerCase();
  for (const t of entry.transcripts) {
    if (t && t.toLowerCase().includes(kw)) return true;
  }
  if (entry.themes) {
    for (const t of entry.themes) {
      if (t.toLowerCase().includes(kw)) return true;
    }
  }
  return false;
}

function highlightText(text: string, kw: string): ReactNode {
  if (!kw.trim()) return text;
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === kw.toLowerCase()
      ? <strong key={i} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{part}</strong>
      : part
  );
}

export function HistoryPage({ entries, loading, error, interpretationEnabled, visible, onOpenSettings, onDeleteEntry }: HistoryPageProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedQ, setExpandedQ] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [showKeyword, setShowKeyword] = useState(false);

  useEffect(() => {
    if (!visible) {
      setExpanded(new Set());
      setExpandedQ(new Set());
      setConfirmDelete(null);
      setSearch('');
      setKeyword('');
      setShowKeyword(false);
    }
  }, [visible]);

  const answered = useMemo(
    () => entries.filter(e => e.transcripts.some(Boolean)),
    [entries],
  );

  const filtered = useMemo(
    () => answered.filter(e => matchesDateSearch(e, search) && matchesKeyword(e, keyword)),
    [answered, search, keyword],
  );

  const autoExpandKeys = useMemo(() => {
    if (!keyword.trim()) return new Set<string>();
    const keys = new Set<string>();
    const kw = keyword.trim().toLowerCase();
    for (const entry of filtered) {
      entry.transcripts.forEach((t, i) => {
        if (t && t.toLowerCase().includes(kw)) {
          keys.add(`${entry.id}-${i}`);
        }
      });
    }
    return keys;
  }, [filtered, keyword]);

  const isQExpanded = (key: string) => expandedQ.has(key) || autoExpandKeys.has(key);

  const toggleQ = (entryId: string, qIdx: number) => {
    const key = `${entryId}-${qIdx}`;
    setExpandedQ(prev => {
      const next = new Set(prev);
      if (autoExpandKeys.has(key)) {
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Receipts</div>
        <button style={styles.gear} onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>

      <div style={styles.searchRow}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>⌕</span>
          <input
            type="text"
            placeholder="Search by day or date…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          {search && (
            <button style={styles.clearBtn} onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <button
          style={{ ...styles.filterBtn, ...(showKeyword ? styles.filterBtnActive : {}) }}
          onClick={() => { setShowKeyword(!showKeyword); if (showKeyword) setKeyword(''); }}
          aria-label="Filter by keyword"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
      </div>

      {showKeyword && (
        <div style={styles.keywordRow}>
          <input
            type="text"
            placeholder="Filter by keyword…"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            style={styles.keywordInput}
            autoFocus
          />
          {keyword && (
            <button style={styles.clearBtn} onClick={() => setKeyword('')}>✕</button>
          )}
        </div>
      )}

      <div style={styles.body}>
        {loading ? (
          <div style={styles.empty}>Loading your reflections…</div>
        ) : error ? (
          <div style={styles.empty}>Couldn't load your history. Check your connection.</div>
        ) : answered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>☰</div>
            <div style={styles.emptyTitle}>No reflections yet</div>
            <div style={styles.emptySub}>Your past entries will appear here once you complete your first session.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyTitle}>No matches</div>
            <div style={styles.emptySub}>Try a different search or filter.</div>
          </div>
        ) : (
          filtered.map(entry => {
            const isOpen = expanded.has(entry.id);
            const answeredCount = entry.transcripts.filter(Boolean).length;
            return (
              <div key={entry.id} style={styles.card}>
                <div style={styles.cardHead} onClick={() => {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (isOpen) {
                      next.delete(entry.id);
                    } else {
                      next.add(entry.id);
                    }
                    return next;
                  });
                  if (isOpen) {
                    setExpandedQ(prev => {
                      const next = new Set(prev);
                      for (const k of prev) {
                        if (k.startsWith(entry.id)) next.delete(k);
                      }
                      return next;
                    });
                  }
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.date}>{formatDate(entry.createdAt)}</div>
                    <div style={styles.meta}>{answeredCount} of 6 answered</div>
                  </div>
                  <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(180deg)' : 'none' }}>∨</span>
                </div>

                {isOpen && (
                  <div style={styles.cardBody}>
                    {entry.summary && (
                      <div style={styles.summary}>{entry.summary}</div>
                    )}
                    {entry.transcripts.map((t, i) =>
                      t ? (
                        <div key={i} style={styles.qRow}>
                          <div
                            style={styles.qRowHead}
                            onClick={() => toggleQ(entry.id, i)}
                          >
                            <div style={styles.answerLabel}>Q{i + 1} · {Q_LABELS[i]}</div>
                            <span style={{
                              ...styles.qChevron,
                              transform: isQExpanded(`${entry.id}-${i}`) ? 'rotate(180deg)' : 'none',
                            }}>∨</span>
                          </div>
                          {isQExpanded(`${entry.id}-${i}`) && (
                            <div style={styles.answerText}>{highlightText(t, keyword)}</div>
                          )}
                        </div>
                      ) : null,
                    )}
                    <div style={styles.deleteArea}>
                      {confirmDelete === entry.id ? (
                        <div style={styles.confirmRow}>
                          <span style={styles.confirmText}>Delete this entry?</span>
                          <button
                            style={styles.confirmYes}
                            onClick={() => {
                              onDeleteEntry(entry.id);
                              setConfirmDelete(null);
                              setExpanded(prev => { const next = new Set(prev); next.delete(entry.id); return next; });
                            }}
                          >
                            Delete
                          </button>
                          <button
                            style={styles.confirmNo}
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          style={styles.deleteBtn}
                          onClick={() => setConfirmDelete(entry.id)}
                        >
                          Delete entry
                        </button>
                      )}
                    </div>
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
  // Search + filter
  searchRow: {
    display: 'flex', gap: 8, padding: '0 24px 8px', alignItems: 'center',
  },
  searchWrap: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12, padding: '0 12px', height: 40,
  },
  searchIcon: {
    fontSize: 16, color: 'var(--text-ghost)', flexShrink: 0,
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: 14, color: 'var(--text-primary)',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'none', border: 'none', fontSize: 14, color: 'var(--text-ghost)',
    cursor: 'pointer', padding: '4px', minHeight: 28, minWidth: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  filterBtn: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-ghost)', cursor: 'pointer',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    color: 'var(--accent-primary)',
    borderColor: 'var(--accent-primary)',
    background: 'rgba(107,191,168,0.12)',
  },
  keywordRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '0 24px 10px',
  },
  keywordInput: {
    flex: 1, background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12, padding: '0 12px', height: 36,
    fontSize: 14, color: 'var(--text-primary)',
    fontFamily: 'inherit', outline: 'none',
  },
  // Body
  body: { flex: 1, overflowY: 'auto', padding: '0 24px 24px' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: '64px 16px', gap: 8,
    color: 'var(--text-ghost)', fontSize: 14,
  },
  emptyIcon: { fontSize: 32, color: 'var(--text-ghost)', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)' },
  emptySub: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 280 },
  // Cards
  card: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16, marginBottom: 10, overflow: 'hidden',
    boxShadow: 'var(--glass-shadow)',
  },
  cardHead: { display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' },
  date: { fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
  meta: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  chevron: { fontSize: 14, color: 'var(--text-ghost)', transition: 'transform 0.2s', marginLeft: 8 },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.2)' },
  summary: {
    fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500,
    paddingTop: 12, marginBottom: 4, lineHeight: 1.5,
  },
  // Per-question expand rows
  qRow: {
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  qRowHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', cursor: 'pointer',
  },
  answerLabel: {
    fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  qChevron: {
    fontSize: 12, color: 'var(--text-ghost)', transition: 'transform 0.2s',
  },
  answerText: {
    fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
    paddingBottom: 10,
  },
  // Delete
  deleteArea: {
    paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4,
  },
  deleteBtn: {
    background: 'none', border: 'none', fontSize: 13, color: 'var(--text-ghost)',
    padding: '8px 0', cursor: 'pointer',
  },
  confirmRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  confirmText: {
    fontSize: 13, color: 'var(--text-secondary)', flex: 1,
  },
  confirmYes: {
    background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  confirmNo: {
    background: 'none', border: '1px solid var(--border-glass)', borderRadius: 8,
    padding: '6px 14px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
  },
};
