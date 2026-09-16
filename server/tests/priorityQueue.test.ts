import { describe, expect, it } from 'vitest';
import {
  QueueTier,
  calculatePriorityScore,
  compareTickets,
  getOverdueMs,
  getQueueTier,
  getRemainingSlaMs,
  isOverdue,
  sortTickets,
} from '../src/sorting/priorityQueue.js';
import type { Priority, QueueTicket, TicketStatus } from '../src/models/ticket.js';
import { ids, makeTicket } from './helpers/ticketFactory.js';
import { createRandom, pick, shuffle } from './helpers/random.js';
import { HOUR, MINUTE, NOW } from './helpers/time.js';

describe('isOverdue', () => {
  it('is not overdue before the deadline', () => {
    expect(isOverdue(makeTicket({ id: 'a', deadlineIn: MINUTE }), NOW)).toBe(false);
  });

  it('is NOT overdue at exactly the SLA deadline', () => {
    const ticket = makeTicket({ id: 'a', deadlineIn: 0 });
    expect(isOverdue(ticket, NOW)).toBe(false);
    expect(getQueueTier(ticket, NOW)).toBe(QueueTier.OnTime);
  });

  it('becomes overdue one millisecond after the SLA deadline', () => {
    const ticket = makeTicket({ id: 'a', deadlineIn: 0 });
    expect(isOverdue(ticket, NOW + 1)).toBe(true);
    expect(getOverdueMs(ticket, NOW + 1)).toBe(1);
    expect(getQueueTier(ticket, NOW + 1)).toBe(QueueTier.Overdue);
  });

  it('never treats a resolved ticket as overdue, even long after its deadline', () => {
    const ticket = makeTicket({ id: 'a', status: 'RESOLVED', deadlineIn: -10 * HOUR });
    expect(isOverdue(ticket, NOW)).toBe(false);
    expect(getOverdueMs(ticket, NOW)).toBe(0);
  });

  it('treats in-progress tickets past their deadline as overdue', () => {
    const ticket = makeTicket({ id: 'a', status: 'IN_PROGRESS', deadlineIn: -MINUTE });
    expect(isOverdue(ticket, NOW)).toBe(true);
  });
});

describe('time measurements', () => {
  it('reports overdue duration as a positive number of milliseconds', () => {
    expect(getOverdueMs(makeTicket({ id: 'a', deadlineIn: -2 * HOUR }), NOW)).toBe(2 * HOUR);
  });

  it('reports zero overdue duration for tickets that are on time', () => {
    expect(getOverdueMs(makeTicket({ id: 'a', deadlineIn: HOUR }), NOW)).toBe(0);
  });

  it('reports remaining SLA time relative to the evaluation time', () => {
    const ticket = makeTicket({ id: 'a', deadlineIn: 90 * MINUTE });
    expect(getRemainingSlaMs(ticket, NOW)).toBe(90 * MINUTE);
    expect(getRemainingSlaMs(ticket, NOW + HOUR)).toBe(30 * MINUTE);
  });
});

describe('sortTickets — non-overdue tickets', () => {
  it('orders by priority: urgent, then normal, then low', () => {
    const low = makeTicket({ id: 'low', priority: 'LOW' });
    const normal = makeTicket({ id: 'normal', priority: 'NORMAL' });
    const urgent = makeTicket({ id: 'urgent', priority: 'URGENT' });

    expect(ids(sortTickets([low, normal, urgent], NOW))).toEqual(['urgent', 'normal', 'low']);
  });

  it('puts the urgent ticket closest to its deadline first', () => {
    const dueLater = makeTicket({ id: 'due-later', priority: 'URGENT', deadlineIn: 90 * MINUTE });
    const dueSoon = makeTicket({ id: 'due-soon', priority: 'URGENT', deadlineIn: 15 * MINUTE });

    expect(ids(sortTickets([dueLater, dueSoon], NOW))).toEqual(['due-soon', 'due-later']);
  });

  it('keeps an urgent ticket with plenty of time ahead of a normal ticket that is due sooner', () => {
    const urgentWithTime = makeTicket({ id: 'urgent', priority: 'URGENT', deadlineIn: 2 * HOUR });
    const normalDueSoon = makeTicket({ id: 'normal', priority: 'NORMAL', deadlineIn: MINUTE });

    expect(ids(sortTickets([normalDueSoon, urgentWithTime], NOW))).toEqual(['urgent', 'normal']);
  });

  it('treats a ticket at exactly its deadline as on time, ranked by priority', () => {
    const normalAtDeadline = makeTicket({ id: 'normal-at-deadline', priority: 'NORMAL', deadlineIn: 0 });
    const urgent = makeTicket({ id: 'urgent', priority: 'URGENT', deadlineIn: HOUR });

    expect(ids(sortTickets([normalAtDeadline, urgent], NOW))).toEqual(['urgent', 'normal-at-deadline']);
  });

  it('breaks full ties with the oldest ticket first', () => {
    const newer = makeTicket({ id: 'newer', createdAgo: 10 * MINUTE });
    const older = makeTicket({ id: 'older', createdAgo: 3 * HOUR });

    expect(ids(sortTickets([newer, older], NOW))).toEqual(['older', 'newer']);
  });
});

describe('sortTickets — overdue tickets', () => {
  it('puts an overdue normal ticket ahead of an urgent ticket that is still on time', () => {
    const urgentOnTime = makeTicket({ id: 'A', priority: 'URGENT', deadlineIn: 30 * MINUTE });
    const normalOverdue = makeTicket({ id: 'B', priority: 'NORMAL', deadlineIn: -10 * MINUTE });

    expect(ids(sortTickets([urgentOnTime, normalOverdue], NOW))).toEqual(['B', 'A']);
  });

  it('puts even an overdue low ticket ahead of every on-time ticket', () => {
    const lowOverdue = makeTicket({ id: 'low-overdue', priority: 'LOW', deadlineIn: -1 });
    const urgentDueNow = makeTicket({ id: 'urgent-due-now', priority: 'URGENT', deadlineIn: 0 });

    expect(ids(sortTickets([urgentDueNow, lowOverdue], NOW))).toEqual(['low-overdue', 'urgent-due-now']);
  });

  it('puts the most overdue ticket first', () => {
    const slightlyOverdue = makeTicket({ id: 'A', deadlineIn: -30 * MINUTE });
    const badlyOverdue = makeTicket({ id: 'B', deadlineIn: -2 * HOUR });

    expect(ids(sortTickets([slightlyOverdue, badlyOverdue], NOW))).toEqual(['B', 'A']);
  });

  it('ranks overdue duration above priority', () => {
    const urgentSlightlyOverdue = makeTicket({ id: 'urgent', priority: 'URGENT', deadlineIn: -5 * MINUTE });
    const lowBadlyOverdue = makeTicket({ id: 'low', priority: 'LOW', deadlineIn: -5 * HOUR });

    expect(ids(sortTickets([urgentSlightlyOverdue, lowBadlyOverdue], NOW))).toEqual(['low', 'urgent']);
  });

  it('uses priority when two tickets are overdue by the same amount', () => {
    const normal = makeTicket({ id: 'normal', priority: 'NORMAL', deadlineIn: -HOUR });
    const urgent = makeTicket({ id: 'urgent', priority: 'URGENT', deadlineIn: -HOUR });
    const low = makeTicket({ id: 'low', priority: 'LOW', deadlineIn: -HOUR });

    expect(ids(sortTickets([normal, low, urgent], NOW))).toEqual(['urgent', 'normal', 'low']);
  });

  it('uses the oldest creation time when overdue duration and priority are equal', () => {
    const newer = makeTicket({ id: 'newer', deadlineIn: -HOUR, createdAgo: 25 * HOUR });
    const older = makeTicket({ id: 'older', deadlineIn: -HOUR, createdAgo: 40 * HOUR });

    expect(ids(sortTickets([newer, older], NOW))).toEqual(['older', 'newer']);
  });
});

describe('sortTickets — resolved tickets', () => {
  it('sinks resolved tickets below every unresolved ticket', () => {
    const resolvedUrgent = makeTicket({ id: 'resolved', priority: 'URGENT', status: 'RESOLVED', deadlineIn: -HOUR });
    const openLow = makeTicket({ id: 'open-low', priority: 'LOW', deadlineIn: 20 * HOUR });

    expect(ids(sortTickets([resolvedUrgent, openLow], NOW))).toEqual(['open-low', 'resolved']);
  });

  it('orders resolved tickets among themselves by priority', () => {
    const resolvedLow = makeTicket({ id: 'low', priority: 'LOW', status: 'RESOLVED' });
    const resolvedUrgent = makeTicket({ id: 'urgent', priority: 'URGENT', status: 'RESOLVED' });

    expect(ids(sortTickets([resolvedLow, resolvedUrgent], NOW))).toEqual(['urgent', 'low']);
  });
});

describe('sortTickets — dynamic time', () => {
  it('moves a ticket to the front once its deadline passes, with no change to the ticket itself', () => {
    const urgent = makeTicket({ id: 'urgent', priority: 'URGENT', deadlineIn: HOUR });
    const low = makeTicket({ id: 'low', priority: 'LOW', deadlineIn: 30 * MINUTE });
    const tickets = [urgent, low];

    expect(ids(sortTickets(tickets, NOW))).toEqual(['urgent', 'low']);
    expect(ids(sortTickets(tickets, NOW + 30 * MINUTE))).toEqual(['urgent', 'low']);
    expect(ids(sortTickets(tickets, NOW + 30 * MINUTE + 1))).toEqual(['low', 'urgent']);
  });

  it('reorders overdue tickets by how long each has been overdue at the evaluation time', () => {
    const breachedEarlier = makeTicket({ id: 'earlier', priority: 'LOW', deadlineIn: 10 * MINUTE });
    const breachedLater = makeTicket({ id: 'later', priority: 'URGENT', deadlineIn: 20 * MINUTE });

    expect(ids(sortTickets([breachedLater, breachedEarlier], NOW + HOUR))).toEqual(['earlier', 'later']);
  });
});

describe('sortTickets — general properties', () => {
  it('returns an empty array for no tickets', () => {
    expect(sortTickets([], NOW)).toEqual([]);
  });

  it('returns a single ticket unchanged', () => {
    const ticket = makeTicket({ id: 'only' });
    expect(sortTickets([ticket], NOW)).toEqual([ticket]);
  });

  it('does not mutate the input array', () => {
    const input = [makeTicket({ id: 'low', priority: 'LOW' }), makeTicket({ id: 'urgent', priority: 'URGENT' })];
    const snapshot = [...input];
    sortTickets(input, NOW);
    expect(input).toEqual(snapshot);
  });

  it('falls back to id order for tickets identical in every ranking field', () => {
    const b = makeTicket({ id: 'b' });
    const a = makeTicket({ id: 'a' });
    expect(ids(sortTickets([b, a], NOW))).toEqual(['a', 'b']);
    expect(compareTickets(a, a, NOW)).toBe(0);
  });

  it('orders the documented demo scenario exactly', () => {
    const tickets = [
      makeTicket({ id: 'low', priority: 'LOW', deadlineIn: 20 * HOUR }),
      makeTicket({ id: 'normal-due-later', priority: 'NORMAL', deadlineIn: 20 * HOUR }),
      makeTicket({ id: 'urgent-due-later', priority: 'URGENT', deadlineIn: 100 * MINUTE }),
      makeTicket({ id: 'resolved', priority: 'URGENT', status: 'RESOLVED', deadlineIn: -HOUR }),
      makeTicket({ id: 'slightly-overdue-urgent', priority: 'URGENT', deadlineIn: -10 * MINUTE }),
      makeTicket({ id: 'normal-due-soon', priority: 'NORMAL', deadlineIn: 20 * MINUTE }),
      makeTicket({ id: 'severely-overdue-normal', priority: 'NORMAL', deadlineIn: -6 * HOUR }),
      makeTicket({ id: 'urgent-due-soon', priority: 'URGENT', deadlineIn: 10 * MINUTE }),
    ];

    expect(ids(sortTickets(tickets, NOW))).toEqual([
      'severely-overdue-normal',
      'slightly-overdue-urgent',
      'urgent-due-soon',
      'urgent-due-later',
      'normal-due-soon',
      'normal-due-later',
      'low',
      'resolved',
    ]);
  });

  describe('large collections', () => {
    const PRIORITY_VALUES: readonly Priority[] = ['URGENT', 'NORMAL', 'LOW'];
    const STATUS_VALUES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

    function generateTickets(count: number, seed: number): QueueTicket[] {
      const random = createRandom(seed);
      return Array.from({ length: count }, (_, index) =>
        makeTicket({
          id: `t-${String(index).padStart(5, '0')}`,
          priority: pick(random, PRIORITY_VALUES),
          status: pick(random, STATUS_VALUES),
          // Coarse buckets on purpose so that many tickets tie on one or more keys.
          deadlineIn: Math.round((random() - 0.5) * 12) * 30 * MINUTE,
          createdAgo: Math.round(random() * 10) * HOUR,
        }),
      );
    }

    const tickets = generateTickets(5000, 42);
    const sorted = sortTickets(tickets, NOW);

    it('keeps every ticket exactly once', () => {
      expect(sorted).toHaveLength(tickets.length);
      expect(new Set(ids(sorted)).size).toBe(tickets.length);
    });

    it('produces a sequence in which every adjacent pair is correctly ordered', () => {
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1] as QueueTicket;
        const current = sorted[index] as QueueTicket;
        expect(compareTickets(previous, current, NOW)).toBeLessThan(0);
      }
    });

    it('produces the same order regardless of input order', () => {
      const reversed = sortTickets([...tickets].reverse(), NOW);
      const shuffled = sortTickets(shuffle(createRandom(7), tickets), NOW);
      expect(ids(reversed)).toEqual(ids(sorted));
      expect(ids(shuffled)).toEqual(ids(sorted));
    });

    it('groups tiers contiguously: overdue, then on time, then resolved', () => {
      const tiers = sorted.map((ticket) => calculatePriorityScore(ticket, NOW)[0]);
      const tierChanges = tiers.filter((tier, index) => index > 0 && tier !== tiers[index - 1]);
      expect(tierChanges).toEqual([QueueTier.OnTime, QueueTier.Resolved]);
    });
  });
});
