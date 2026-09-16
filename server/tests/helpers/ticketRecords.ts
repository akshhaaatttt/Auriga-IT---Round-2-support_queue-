import { getSlaResponseMs } from '../../src/domain/sla.js';
import type { Priority, Ticket, TicketStatus } from '../../src/models/ticket.js';
import { HOUR, NOW } from './time.js';

interface RecordOverrides {
  id: string;
  priority?: Priority;
  status?: TicketStatus;
  /** Deadline relative to NOW; negative means already breached. */
  deadlineIn?: number;
  createdAt?: number;
}

/** A complete, insertable ticket row with a deadline chosen relative to NOW. */
export function makeTicketRecord({
  id,
  priority = 'NORMAL',
  status = 'OPEN',
  deadlineIn = HOUR,
  createdAt,
}: RecordOverrides): Ticket {
  const slaDeadline = NOW + deadlineIn;
  // Consistent with the SLA policy unless a test needs a specific creation time.
  const created = createdAt ?? slaDeadline - getSlaResponseMs(priority);
  return {
    id,
    customerName: `Customer ${id}`,
    title: `Ticket ${id}`,
    description: '',
    priority,
    status,
    assignedAgentId: null,
    createdAt: created,
    updatedAt: created,
    slaDeadline,
    escalationCount: 0,
    lastEscalatedAt: null,
  };
}
