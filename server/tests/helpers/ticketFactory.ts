import type { Priority, QueueTicket, TicketStatus } from '../../src/models/ticket.js';
import { HOUR, NOW } from './time.js';

interface TicketOverrides {
  id: string;
  priority?: Priority;
  status?: TicketStatus;
  /** Deadline relative to NOW; negative means already past. */
  deadlineIn?: number;
  /** Creation time relative to NOW; should be negative. */
  createdAgo?: number;
}

export function makeTicket({
  id,
  priority = 'NORMAL',
  status = 'OPEN',
  deadlineIn = HOUR,
  createdAgo = HOUR,
}: TicketOverrides): QueueTicket {
  return {
    id,
    priority,
    status,
    slaDeadline: NOW + deadlineIn,
    createdAt: NOW - createdAgo,
  };
}

export function ids(tickets: readonly QueueTicket[]): string[] {
  return tickets.map((ticket) => ticket.id);
}
