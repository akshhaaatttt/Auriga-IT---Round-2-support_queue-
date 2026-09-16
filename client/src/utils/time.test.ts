import { describe, expect, it } from 'vitest';
import { formatDuration, getSlaStatus, isTicketOverdue } from './time';

const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ticketDue = (offsetMs: number, status: 'OPEN' | 'RESOLVED' = 'OPEN') => ({
  status,
  slaDeadline: new Date(NOW + offsetMs).toISOString(),
});

describe('formatDuration', () => {
  it.each([
    [0, '<1m'],
    [59_999, '<1m'],
    [MINUTE, '1m'],
    [31 * MINUTE, '31m'],
    [2 * HOUR, '2h'],
    [2 * HOUR + 14 * MINUTE, '2h 14m'],
    [8 * HOUR + 42 * MINUTE + 59_999, '8h 42m'],
    [26 * HOUR, '1d 2h'],
    [48 * HOUR + 5 * MINUTE, '2d'],
    [-(2 * HOUR + 14 * MINUTE), '2h 14m'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('getSlaStatus', () => {
  it('describes overdue tickets without a negative countdown', () => {
    expect(getSlaStatus(ticketDue(-(2 * HOUR + 14 * MINUTE)), NOW)).toEqual({
      state: 'overdue',
      label: 'Overdue by 2h 14m',
    });
  });

  it('is not overdue at exactly the deadline', () => {
    expect(isTicketOverdue(ticketDue(0), NOW)).toBe(false);
    expect(getSlaStatus(ticketDue(0), NOW).state).toBe('due-soon');
    expect(isTicketOverdue(ticketDue(0), NOW + 1)).toBe(true);
  });

  it('flags tickets due within 30 minutes', () => {
    expect(getSlaStatus(ticketDue(31 * MINUTE), NOW)).toEqual({ state: 'on-track', label: 'Due in 31m' });
    expect(getSlaStatus(ticketDue(30 * MINUTE), NOW).state).toBe('due-soon');
  });

  it('never reports resolved tickets as overdue', () => {
    expect(getSlaStatus(ticketDue(-HOUR, 'RESOLVED'), NOW).state).toBe('resolved');
  });
});
