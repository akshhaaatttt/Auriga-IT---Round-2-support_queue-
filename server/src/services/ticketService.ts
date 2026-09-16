import { randomUUID } from 'node:crypto';
import { calculateSlaDeadline } from '../domain/sla.js';
import type { Clock } from '../models/clock.js';
import { NotFoundError, ValidationError } from '../models/errors.js';
import type { Ticket } from '../models/ticket.js';
import type { PaginatedTickets, QueueMeta, TicketDto } from '../models/ticketDto.js';
import type { AgentRepository } from '../repositories/agentRepository.js';
import type {
  TicketChanges,
  TicketCounts,
  TicketFilters,
  TicketRepository,
  TicketWithAgent,
} from '../repositories/ticketRepository.js';
import { isOverdue } from '../sorting/priorityQueue.js';
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from '../validation/ticketSchemas.js';

export interface QueueSummary {
  counts: TicketCounts;
  meta: QueueMeta;
}

export const toIso = (timestamp: number): string => new Date(timestamp).toISOString();

function toDto(ticket: TicketWithAgent, now: number): TicketDto {
  return {
    ...ticket,
    createdAt: toIso(ticket.createdAt),
    updatedAt: toIso(ticket.updatedAt),
    slaDeadline: toIso(ticket.slaDeadline),
    lastEscalatedAt: ticket.lastEscalatedAt === null ? null : toIso(ticket.lastEscalatedAt),
    isOverdue: isOverdue(ticket, now),
  };
}

export class TicketService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly agents: AgentRepository,
    private readonly clock: Clock,
  ) {}

  listQueue(query: ListTicketsQuery): PaginatedTickets {
    const now = this.clock();
    const filters: TicketFilters = {
      search: query.search,
      overdue: query.overdue,
      assignedTo: query.assignedTo,
      statuses: query.status,
    };
    const total = this.tickets.count(filters, now);
    const offset = (query.page - 1) * query.limit;
    const page = this.tickets.findQueuePage(filters, now, query.limit, offset);

    return {
      tickets: page.map((ticket) => toDto(ticket, now)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      meta: this.buildMeta({ ...filters, overdue: undefined }, now),
    };
  }

  getSummary(): QueueSummary {
    const now = this.clock();
    return { counts: this.tickets.countByState({}, now), meta: this.buildMeta({}, now) };
  }

  getTicket(id: string): TicketDto {
    return toDto(this.requireTicket(id), this.clock());
  }

  createTicket(input: CreateTicketInput): TicketDto {
    this.assertAgentExists(input.assignedAgentId);
    const now = this.clock();
    const ticket: Ticket = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
      slaDeadline: calculateSlaDeadline(now, input.priority),
      escalationCount: 0,
      lastEscalatedAt: null,
    };
    this.tickets.insert(ticket);
    return this.getTicket(ticket.id);
  }

  updateTicket(id: string, input: UpdateTicketInput): TicketDto {
    const existing = this.requireTicket(id);
    if (input.assignedAgentId !== undefined) this.assertAgentExists(input.assignedAgentId);

    const changes: TicketChanges = { ...input };
    if (input.priority !== undefined && input.priority !== existing.priority) {
      // An agent re-classifying a ticket resets its SLA promise to match the new priority, measured
      // from when the customer reported it. (Automated escalation deliberately does not; see EscalationService.)
      changes.slaDeadline = calculateSlaDeadline(existing.createdAt, input.priority);
    }

    if (!this.tickets.update(id, changes, this.clock())) throw new NotFoundError('Ticket', id);
    return this.getTicket(id);
  }

  deleteTicket(id: string): void {
    if (!this.tickets.delete(id)) throw new NotFoundError('Ticket', id);
  }

  private buildMeta(filters: TicketFilters, now: number): QueueMeta {
    const nextDeadline = this.tickets.findNextDeadline(filters, now);
    return {
      serverTime: toIso(now),
      // Overdue is strictly `now > deadline`, so the order changes 1ms after the deadline.
      nextQueueChangeAt: nextDeadline === null ? null : toIso(nextDeadline + 1),
    };
  }

  private requireTicket(id: string): TicketWithAgent {
    const ticket = this.tickets.findById(id);
    if (!ticket) throw new NotFoundError('Ticket', id);
    return ticket;
  }

  private assertAgentExists(agentId: string | null): void {
    if (agentId !== null && !this.agents.exists(agentId)) {
      throw new ValidationError([{ field: 'assignedAgentId', message: `Agent '${agentId}' does not exist` }]);
    }
  }
}
