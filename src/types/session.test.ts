import { describe, it, expect } from 'vitest';
import { getQ1WithContext } from './session';
import type { CalendarEvent } from './session';

function ev(title: string, time = '9:00 AM–10:00 AM'): CalendarEvent {
  return { title, time };
}

describe('getQ1WithContext', () => {
  it('returns default question when no events', () => {
    const result = getQ1WithContext(null);
    expect(result.question).toBe('What did you do today?');
  });

  it('returns default question for empty array', () => {
    const result = getQ1WithContext([]);
    expect(result.question).toBe('What did you do today?');
  });

  // Light days (1-2 events) — should use category labels
  it('uses category label for single meeting event', () => {
    const result = getQ1WithContext([ev('Team standup')]);
    expect(result.question).toContain('meeting');
    expect(result.question).toContain('how did it go');
  });

  it('uses category label for single gym event', () => {
    const result = getQ1WithContext([ev('Gym session')]);
    expect(result.question).toContain('wellness');
  });

  it('combines two category labels for 2 events', () => {
    const result = getQ1WithContext([ev('Gym'), ev('Coffee with Sam')]);
    expect(result.question).toContain('and');
  });

  it('handles 2 uncategorized events without saying busy', () => {
    const result = getQ1WithContext([ev('NYC Tech Week'), ev('Presentation prep')]);
    expect(result.question.toLowerCase()).not.toContain('busy');
    expect(result.question.toLowerCase()).not.toContain('packed');
  });

  // Full days (5-7 events)
  it('says full day for 5 events with 5+ hours', () => {
    const events = [
      ev('Meeting 1', '9:00 AM–10:00 AM'),
      ev('Meeting 2', '10:00 AM–11:00 AM'),
      ev('Meeting 3', '11:00 AM–12:00 PM'),
      ev('Meeting 4', '1:00 PM–2:00 PM'),
      ev('Meeting 5', '2:00 PM–3:00 PM'),
    ];
    const result = getQ1WithContext(events);
    expect(result.question.toLowerCase()).toContain('full');
  });

  // Packed days (8+ events)
  it('says packed for 8+ events', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      ev(`Event ${i}`, `${9 + i}:00 AM–${10 + i}:00 AM`));
    const result = getQ1WithContext(events);
    expect(result.question.toLowerCase()).toContain('packed');
  });

  // Always has a subPrompt
  it('always returns a subPrompt', () => {
    expect(getQ1WithContext(null).subPrompt).toBeTruthy();
    expect(getQ1WithContext([ev('Gym')]).subPrompt).toBeTruthy();
  });
});
