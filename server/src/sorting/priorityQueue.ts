/**
 * Canonical specification of queue ordering.
 *
 * Every function here is pure: the evaluation time is always passed in explicitly, so the
 * same inputs always produce the same order. The SQL ORDER BY in
 * repositories/queueOrderSql.ts is a scalable re-implementation of this module and is
 * verified against it by tests/queueOrderEquivalence.test.ts.
 *
 * Ordering, evaluated at `now`:
 *   Tier 0  overdue, unresolved   -> overdue duration DESC, priority DESC, createdAt ASC
 *   Tier 1  on time, unresolved   -> priority DESC, remaining SLA ASC, createdAt ASC
 *   Tier 2  resolved              -> same keys as tier 1 (no longer competes for attention)
 *   Final tie-breaker: id ASC (binary string comparison, identical to SQLite's default)
 */
import { PRIORITY_RANK } from '../config/constants.js';
import type { QueueTicket } from '../models/ticket.js';

export const QueueTier = {
  Overdue: 0,
  OnTime: 1,
  Resolved: 2,
} as const;
export type QueueTier = (typeof QueueTier)[keyof typeof QueueTier];

/**
 * Lexicographic sort key; smaller sorts first. It is a tuple rather than a single number
 * so that no component can overflow into, or be outweighed by, another.
 */
export type PriorityScore = readonly [tier: QueueTier, first: number, second: number, createdAt: number];

type TimedTicket = Pick<QueueTicket, 'status' | 'slaDeadline'>;

/** Overdue means strictly past the deadline. At exactly the deadline a ticket is still on time. */
export function isOverdue(ticket: TimedTicket, now: number): boolean {
  return ticket.status !== 'RESOLVED' && now > ticket.slaDeadline;
}

/** How long the SLA has been breached for; 0 when the ticket is not overdue. */
export function getOverdueMs(ticket: TimedTicket, now: number): number {
  return isOverdue(ticket, now) ? now - ticket.slaDeadline : 0;
}

/** Time left until the SLA deadline; negative once the deadline has passed. */
export function getRemainingSlaMs(ticket: Pick<QueueTicket, 'slaDeadline'>, now: number): number {
  return ticket.slaDeadline - now;
}

export function getQueueTier(ticket: TimedTicket, now: number): QueueTier {
  if (ticket.status === 'RESOLVED') return QueueTier.Resolved;
  return isOverdue(ticket, now) ? QueueTier.Overdue : QueueTier.OnTime;
}

export function calculatePriorityScore(ticket: QueueTicket, now: number): PriorityScore {
  const tier = getQueueTier(ticket, now);
  const priorityDesc = -PRIORITY_RANK[ticket.priority];

  if (tier === QueueTier.Overdue) {
    return [tier, -getOverdueMs(ticket, now), priorityDesc, ticket.createdAt];
  }
  return [tier, priorityDesc, getRemainingSlaMs(ticket, now), ticket.createdAt];
}

function compareScores(a: PriorityScore, b: PriorityScore): number {
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Negative when `a` is more pressing than `b` at time `now`. */
export function compareTickets(a: QueueTicket, b: QueueTicket, now: number): number {
  const byScore = compareScores(calculatePriorityScore(a, now), calculatePriorityScore(b, now));
  return byScore !== 0 ? byScore : compareIds(a.id, b.id);
}

/** Returns a new array in queue order; the input is never mutated. */
export function sortTickets<T extends QueueTicket>(tickets: readonly T[], now: number): T[] {
  return [...tickets].sort((a, b) => compareTickets(a, b, now));
}
