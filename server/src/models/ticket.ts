export const PRIORITIES = ['URGENT', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Domain representation of a ticket. All timestamps are epoch milliseconds so that
 * comparisons are exact integer comparisons, identical in TypeScript and SQLite.
 */
export interface Ticket {
  id: string;
  customerName: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assignedAgentId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Fixed at creation (createdAt + SLA(priority)); only recomputed when priority changes. */
  slaDeadline: number;
}

/** The subset of ticket fields the priority queue needs. */
export type QueueTicket = Pick<Ticket, 'id' | 'priority' | 'status' | 'createdAt' | 'slaDeadline'>;

export interface Agent {
  id: string;
  name: string;
  email: string;
}
