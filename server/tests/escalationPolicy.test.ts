import { describe, expect, it } from 'vitest';
import { PRIORITY_RANK } from '../src/config/constants.js';
import { canEscalate, escalatePriority, shouldEscalate, TOP_PRIORITY } from '../src/escalation/escalationPolicy.js';
import { PRIORITIES, type Priority, type TicketStatus } from '../src/models/ticket.js';
import { HOUR, MINUTE, NOW } from './helpers/time.js';

const ticket = (priority: Priority, deadlineIn: number, status: TicketStatus = 'OPEN') => ({
  priority,
  status,
  slaDeadline: NOW + deadlineIn,
});

describe('escalatePriority — one step up the chain', () => {
  it('raises NORMAL to HIGH', () => {
    expect(escalatePriority('NORMAL')).toBe('HIGH');
  });

  it('raises HIGH to URGENT', () => {
    expect(escalatePriority('HIGH')).toBe('URGENT');
  });

  it('keeps URGENT at URGENT', () => {
    expect(escalatePriority('URGENT')).toBe('URGENT');
  });

  it('raises LOW to NORMAL', () => {
    expect(escalatePriority('LOW')).toBe('NORMAL');
  });

  it('never skips a level: NORMAL becomes HIGH, not URGENT', () => {
    expect(escalatePriority('NORMAL')).not.toBe('URGENT');
  });

  it.each(PRIORITIES.filter((priority) => priority !== TOP_PRIORITY))(
    'moves %s exactly one rank up',
    (priority) => {
      expect(PRIORITY_RANK[escalatePriority(priority)] - PRIORITY_RANK[priority]).toBe(1);
    },
  );

  it('walks the full chain one call at a time', () => {
    const chain: Priority[] = ['LOW'];
    for (let step = 0; step < 4; step += 1) {
      chain.push(escalatePriority(chain[chain.length - 1] as Priority));
    }
    expect(chain).toEqual(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'URGENT']);
  });

  it('treats URGENT, and only URGENT, as terminal', () => {
    expect(PRIORITIES.filter((priority) => !canEscalate(priority))).toEqual([TOP_PRIORITY]);
    expect(PRIORITY_RANK[TOP_PRIORITY]).toBe(Math.max(...Object.values(PRIORITY_RANK)));
  });
});

describe('shouldEscalate — SLA breach', () => {
  it('does not escalate a normal ticket that is still on time', () => {
    expect(shouldEscalate(ticket('NORMAL', HOUR), NOW)).toBe(false);
  });

  it('does not escalate at exactly the SLA deadline', () => {
    expect(shouldEscalate(ticket('NORMAL', 0), NOW)).toBe(false);
  });

  it('escalates one millisecond after the SLA deadline', () => {
    expect(shouldEscalate(ticket('NORMAL', 0), NOW + 1)).toBe(true);
  });

  it('escalates a severely overdue ticket (the run then moves it one level only)', () => {
    expect(shouldEscalate(ticket('NORMAL', -30 * HOUR), NOW)).toBe(true);
    expect(escalatePriority('NORMAL')).toBe('HIGH');
  });

  it('does not escalate an overdue ticket that is already URGENT', () => {
    expect(shouldEscalate(ticket('URGENT', -MINUTE), NOW)).toBe(false);
  });
});

describe('shouldEscalate — status', () => {
  it('escalates overdue OPEN tickets', () => {
    expect(shouldEscalate(ticket('NORMAL', -MINUTE, 'OPEN'), NOW)).toBe(true);
  });

  it('escalates overdue IN_PROGRESS tickets', () => {
    expect(shouldEscalate(ticket('HIGH', -MINUTE, 'IN_PROGRESS'), NOW)).toBe(true);
  });

  it('never escalates RESOLVED tickets, however overdue', () => {
    expect(shouldEscalate(ticket('NORMAL', -100 * HOUR, 'RESOLVED'), NOW)).toBe(false);
  });
});
