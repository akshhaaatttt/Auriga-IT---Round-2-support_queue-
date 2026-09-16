export const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface Agent {
  id: string;
  name: string;
  email: string;
}

export interface Ticket {
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
  /** Times the server's automated escalation check has raised this ticket's priority. */
  escalationCount: number;
  lastEscalatedAt: string | null;
  isOverdue: boolean;
}

export interface QueueMeta {
  serverTime: string;
  nextQueueChangeAt: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TicketPage {
  tickets: Ticket[];
  pagination: Pagination;
  meta: QueueMeta;
}

export interface TicketCounts {
  total: number;
  active: number;
  overdue: number;
  urgent: number;
  dueSoon: number;
  open: number;
  inProgress: number;
  resolved: number;
}

export interface QueueSummary {
  counts: TicketCounts;
  meta: QueueMeta;
}

export interface TicketQuery {
  search?: string;
  overdue?: boolean;
  assignedTo?: string;
  statuses?: readonly TicketStatus[];
  page: number;
  limit: number;
}

export interface TicketInput {
  customerName: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assignedAgentId: string | null;
}

export type TicketUpdate = Partial<TicketInput>;

export interface FieldIssue {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: FieldIssue[];
  };
}
