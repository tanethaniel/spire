import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '../types/session';
import { fetchCalendarEvents } from '../lib/api';

interface HomePageProps {
  onStart: (events: CalendarEvent[] | null, targetDate: string | null) => void;
  onOpenProfile: () => void;
  avatarUrl: string | null;
  userName: string;
}

const TOPICS = [
  { icon: '💼', label: 'Work', hint: 'Career, projects, colleagues' },
  { icon: '🤝', label: 'People', hint: 'Friends, family, relationships' },
  { icon: '🌿', label: 'Mind & body', hint: 'Health, energy, mood' },
  { icon: '💭', label: 'On my mind', hint: 'Anything else' },
];

export function HomePage({ onStart, onOpenProfile, avatarUrl, userName }: HomePageProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [yesterdayEvents, setYesterdayEvents] = useState<CalendarEvent[] | null>(null);
  const [yesterdayLoading, setYesterdayLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const attempt = async () => {
      try {
        const events = await fetchCalendarEvents();
        if (!cancelled) {
          setCalendarEvents(events.length > 0 ? events : null);
          setCalendarError(null);
          setCalendarLoading(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'calendar_unavailable';
        if (msg === 'calendar_scope_missing' && retries < 3 && !cancelled) {
          retries++;
          setTimeout(attempt, 500 * retries);
          return;
        }
        console.error('[calendar]', err);
        if (!cancelled) {
          setCalendarError(msg);
          setCalendarEvents(null);
          setCalendarLoading(false);
        }
      }
    };
    attempt();
    return () => { cancelled = true; };
  }, []);

  const handleRetryCalendar = useCallback(() => {
    setCalendarLoading(true);
    setCalendarError(null);
    fetchCalendarEvents()
      .then(events => {
        setCalendarEvents(events.length > 0 ? events : null);
      })
      .catch(() => {
        setCalendarError('calendar_unavailable');
        setCalendarEvents(null);
      })
      .finally(() => setCalendarLoading(false));
  }, []);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const getDayName = () => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.wordmark}>spire<span style={{ color: 'var(--accent-primary)' }}>.</span></div>
        <button style={styles.avatarBtn} onClick={onOpenProfile} aria-label="Profile">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" style={styles.avatarImg} />
          ) : (
            <span style={styles.avatarInitial}>{(userName || '?').charAt(0).toUpperCase()}</span>
          )}
        </button>
      </div>

      <div style={styles.greeting}>
        <div style={styles.greetingTime}>{getDayName()} {getTimeGreeting()}</div>
        <div style={styles.greetingText}>What's been on your mind today?</div>
      </div>

      <div style={styles.calendarSection}>
        <div style={styles.calendarHeader}>
          <span style={styles.sectionLabel}>Today's schedule</span>
          {calendarEvents && (
            <span style={styles.eventCount}>
              {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {calendarLoading ? (
          <div style={styles.calendarZone}>
            <div style={styles.calIcon}>📅</div>
            <div>
              <div style={styles.calTitle}>Loading today's calendar…</div>
              <div style={styles.calSub}>Fetching your Google Calendar</div>
            </div>
          </div>
        ) : calendarEvents ? (
          <div style={styles.eventsScroll}>
            {calendarEvents.map((ev, i) => (
              <div key={i} style={styles.eventBlock}>
                <div style={styles.eventBlockLeft} />
                <div style={styles.eventBlockContent}>
                  <div style={styles.eventBlockTitle}>{ev.title}</div>
                  <div style={styles.eventBlockTime}>{ev.time}</div>
                </div>
              </div>
            ))}
          </div>
        ) : calendarError ? (
          <div style={styles.calendarZone} onClick={handleRetryCalendar}>
            <div style={styles.calIcon}>📅</div>
            <div>
              <div style={styles.calTitle}>Couldn't load calendar</div>
              <div style={styles.calSub}>Tap to retry</div>
            </div>
          </div>
        ) : (
          <div style={styles.calendarZone}>
            <div style={styles.calIcon}>📅</div>
            <div>
              <div style={styles.calTitle}>No events today</div>
              <div style={styles.calSub}>Your calendar is clear</div>
            </div>
          </div>
        )}
      </div>

      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>or choose a topic</span>
        <div style={styles.dividerLine} />
      </div>

      <div style={styles.promptGrid}>
        {TOPICS.map(t => (
          <button
            key={t.label}
            style={{
              ...styles.pill,
              ...(selectedTopic === t.label ? styles.pillSelected : {}),
            }}
            onClick={() => setSelectedTopic(t.label)}
          >
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{t.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>{t.hint}</span>
          </button>
        ))}
      </div>

      <div style={styles.ctaArea}>
        <button
          style={styles.ctaButton}
          onClick={() => setShowDayPicker(true)}
        >
          <span>▶</span> Start reflecting
        </button>
      </div>

      {showDayPicker && (
        <>
          <div style={styles.overlay} onClick={() => setShowDayPicker(false)} />
          <div style={styles.daySheet}>
            <div style={styles.daySheetHandle} />
            <div style={styles.daySheetTitle}>Which day are you logging?</div>
            <button
              style={styles.dayOption}
              onClick={() => {
                setShowDayPicker(false);
                onStart(calendarEvents, null);
              }}
            >
              <div style={styles.dayOptionIcon}>☀️</div>
              <div>
                <div style={styles.dayOptionLabel}>Today</div>
                <div style={styles.dayOptionSub}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
              </div>
            </button>
            <button
              style={styles.dayOption}
              disabled={yesterdayLoading}
              onClick={() => {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(21, 0, 0, 0);
                const isoDate = yesterday.toISOString();
                if (yesterdayEvents !== null) {
                  setShowDayPicker(false);
                  onStart(yesterdayEvents, isoDate);
                  return;
                }
                setYesterdayLoading(true);
                fetchCalendarEvents(yesterday)
                  .then(events => {
                    setYesterdayEvents(events.length > 0 ? events : null);
                    setShowDayPicker(false);
                    onStart(events.length > 0 ? events : null, isoDate);
                  })
                  .catch(() => {
                    setShowDayPicker(false);
                    onStart(null, isoDate);
                  })
                  .finally(() => setYesterdayLoading(false));
              }}
            >
              <div style={styles.dayOptionIcon}>{yesterdayLoading ? '⏳' : '🌙'}</div>
              <div>
                <div style={styles.dayOptionLabel}>{yesterdayLoading ? 'Loading…' : 'Yesterday'}</div>
                <div style={styles.dayOptionSub}>
                  {(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); })()}
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px 8px',
    flexShrink: 0,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  avatarBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    minHeight: 44,
    minWidth: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  avatarImg: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: '1.5px solid rgba(255,255,255,0.4)',
  },
  avatarInitial: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    border: '1.5px solid rgba(255,255,255,0.4)',
  },
  greeting: {
    padding: '8px 24px 20px',
    flexShrink: 0,
  },
  greetingTime: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: -0.5,
    lineHeight: 1.2,
  },
  calendarSection: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    padding: '0 24px',
    marginBottom: 12,
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
  },
  eventCount: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    fontWeight: 500,
  },
  calendarZone: {
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    boxShadow: 'var(--glass-shadow)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  calIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
  },
  calTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 2,
  },
  calSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  eventsScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingRight: 2,
  },
  eventBlock: {
    display: 'flex',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  eventBlockLeft: {
    width: 4,
    background: 'var(--accent-primary)',
    borderRadius: '4px 0 0 4px',
    flexShrink: 0,
  },
  eventBlockContent: {
    flex: 1,
    padding: '10px 12px',
    minWidth: 0,
  },
  eventBlockTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-primary)',
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  eventBlockTime: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 24px',
    margin: '0 0 16px',
    flexShrink: 0,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(255,255,255,0.25)',
  },
  dividerText: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    letterSpacing: '0.05em',
  },
  promptGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    padding: '0 24px',
    marginBottom: 20,
    flexShrink: 0,
  },
  pill: {
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1.5px solid var(--border-glass)',
    borderTop: '1.5px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    boxShadow: 'var(--glass-shadow)',
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  },
  pillSelected: {
    borderColor: 'var(--accent-primary)',
    background: 'rgba(107,191,168,0.12)',
  },
  ctaArea: {
    padding: '0 24px',
    paddingBottom: 24,
    flexShrink: 0,
  },
  ctaButton: {
    width: '100%',
    padding: 18,
    background: 'rgba(107,191,168,0.35)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.15s',
    boxShadow: '0 8px 32px rgba(107,191,168,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
  },
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  daySheet: {
    position: 'fixed' as const,
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 430,
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: '20px 20px 0 0',
    padding: '12px 24px 40px',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
  },
  daySheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  daySheetTitle: {
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.3,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  dayOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 18px',
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    boxShadow: 'var(--glass-shadow)',
    textAlign: 'left' as const,
    transition: 'all 0.15s',
    cursor: 'pointer',
  },
  dayOptionIcon: {
    fontSize: 24,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    flexShrink: 0,
  },
  dayOptionLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  dayOptionSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
};
