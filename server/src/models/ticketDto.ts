import type { Priority, TicketStatus } from './ticket.js';

/** Wire format: timestamps as ISO-8601 strings, plus request-time derived state. */
export interface TicketDto {
  id: string;
  customerName: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  createdAt: string;
  updatedAt: string;
  slaDeadline: string;
  escalationCount: number;
  lastEscalatedAt: string | null;
  isOverdue: boolean;
}

export interface QueueMeta {
  /** The instant the ordering was evaluated at; clients use it to correct clock skew. */
  serverTime: string;
  /** When the ordering will next change purely because time passed (an SLA breach). */
  nextQueueChangeAt: string | null;
}

export interface PaginatedTickets {
  tickets: TicketDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta: QueueMeta;
}
