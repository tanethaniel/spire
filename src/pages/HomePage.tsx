import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '../types/session';
import { fetchCalendarEvents } from '../lib/api';

interface HomePageProps {
  onStart: (events: CalendarEvent[] | null) => void;
  onOpenSettings: () => void;
}

const TOPICS = [
  { icon: '💼', label: 'Work', hint: 'Career, projects, colleagues' },
  { icon: '🤝', label: 'People', hint: 'Friends, family, relationships' },
  { icon: '🌿', label: 'Mind & body', hint: 'Health, energy, mood' },
  { icon: '💭', label: 'On my mind', hint: 'Anything else' },
];

export function HomePage({ onStart, onOpenSettings }: HomePageProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const events = await fetchCalendarEvents();
        if (!cancelled) {
          setCalendarEvents(events.length > 0 ? events : null);
          setCalendarError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCalendarError(err instanceof Error ? err.message : 'calendar_unavailable');
          setCalendarEvents(null);
        }
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
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
        <button style={styles.gear} onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>

      <div style={styles.greeting}>
        <div style={styles.greetingTime}>{getDayName()} {getTimeGreeting()}</div>
        <div style={styles.greetingText}>What's been on your mind today?</div>
      </div>

      <div style={styles.sectionLabel}>Today's context</div>

      {calendarLoading ? (
        <div style={styles.calendarZone}>
          <div style={styles.calIcon}>📅</div>
          <div>
            <div style={styles.calTitle}>Loading today's calendar…</div>
            <div style={styles.calSub}>Fetching your Google Calendar</div>
          </div>
        </div>
      ) : calendarEvents ? (
        <div style={styles.eventsCard}>
          <div style={styles.eventsHeader}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 13, color: 'var(--accent-primary)' }}>
              {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''} today
            </span>
          </div>
          {calendarEvents.map((ev, i) => (
            <div key={i} style={styles.eventItem}>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 48 }}>{ev.time}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{ev.title}</span>
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
          onClick={() => onStart(calendarEvents)}
        >
          <span>▶</span> Start reflecting
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px 8px',
  },
  wordmark: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  gear: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: 'var(--text-muted)',
    minHeight: 44,
    minWidth: 44,
  },
  greeting: {
    padding: '8px 24px 24px',
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    padding: '0 24px',
    marginBottom: 12,
  },
  calendarZone: {
    margin: '0 24px 16px',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  calIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.4)',
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
  eventsCard: {
    margin: '0 24px 16px',
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  eventsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '0 24px 20px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(255,255,255,0.4)',
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
    marginBottom: 32,
  },
  pill: {
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1.5px solid var(--border-glass)',
    borderRadius: 14,
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  },
  pillSelected: {
    borderColor: 'var(--accent-primary)',
    background: 'rgba(212,145,122,0.12)',
  },
  ctaArea: {
    padding: '0 24px',
    marginTop: 'auto',
    paddingBottom: 40,
  },
  ctaButton: {
    width: '100%',
    padding: 18,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.15s',
    boxShadow: '0 4px 16px rgba(212,145,122,0.25)',
  },
};
