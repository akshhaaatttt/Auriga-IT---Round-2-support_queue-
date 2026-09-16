/**
 * Canonical escalation rule, as pure functions.
 *
 * Chain: LOW → NORMAL → HIGH → URGENT. URGENT is terminal. Each call moves exactly one step;
 * nothing here loops, so "at most one level per run" holds by construction.
 */
import type { Priority, QueueTicket } from '../models/ticket.js';
import { isOverdue } from '../sorting/priorityQueue.js';

export const TOP_PRIORITY: Priority = 'URGENT';

const NEXT_PRIORITY: Readonly<Record<Priority, Priority>> = {
  LOW: 'NORMAL',
  NORMAL: 'HIGH',
  HIGH: 'URGENT',
  URGENT: 'URGENT',
};

/** The priority one level above `priority`; URGENT stays URGENT. */
export function escalatePriority(priority: Priority): Priority {
  return NEXT_PRIORITY[priority];
}

export function canEscalate(priority: Priority): boolean {
  return escalatePriority(priority) !== priority;
}

/**
 * A ticket escalates when it has breached its SLA (the same strict `now > slaDeadline`,
 * unresolved rule the queue uses) and its priority can still rise.
 */
export function shouldEscalate(
  ticket: Pick<QueueTicket, 'priority' | 'status' | 'slaDeadline'>,
  now: number,
): boolean {
  return isOverdue(ticket, now) && canEscalate(ticket.priority);
}
