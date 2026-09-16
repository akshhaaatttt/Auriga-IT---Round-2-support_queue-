import type { TicketRepository } from '../repositories/ticketRepository.js';
import { escalatePriority, shouldEscalate, TOP_PRIORITY } from './escalationPolicy.js';
import type { EscalationLogger, EscalationRunResult } from './escalationTypes.js';

const LOG_PREFIX = '[Escalation]';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Applies one escalation "run": every eligible ticket moves up exactly one priority level.
 * Used by both the scheduler and the manual trigger endpoint.
 */
export class EscalationService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly logger: EscalationLogger = console,
  ) {}

  run(now: number): EscalationRunResult {
    const ranAt = new Date(now).toISOString();
    this.logger.info(`${LOG_PREFIX} Run started at ${ranAt}`);

    // Escalation changes priority only; the stored SLA deadline (the original promise) is kept,
    // so "overdue by" stays continuous and the ticket remains eligible on later runs.
    // One immediate transaction: the candidate snapshot and every write are serialised against
    // other writers, and each ticket is visited once, so a run can only move it one level.
    const result = this.tickets.runExclusive(() => this.escalateCandidates(now));

    this.logger.info(
      `${LOG_PREFIX} Run completed: candidates=${result.candidates} escalated=${result.escalated.length} ` +
        `unchanged=${result.unchanged.length} failed=${result.failed.length}`,
    );
    return result;
  }

  private escalateCandidates(now: number): EscalationRunResult {
    const candidates = this.tickets.findEscalationCandidates(now, TOP_PRIORITY);
    const result: EscalationRunResult = { ranAt: now, candidates: candidates.length, escalated: [], unchanged: [], failed: [] };

    for (const ticket of candidates) {
      if (!shouldEscalate(ticket, now)) {
        result.unchanged.push(ticket.id);
        continue;
      }

      const from = ticket.priority;
      const to = escalatePriority(from);
      try {
        if (this.tickets.applyEscalation({ id: ticket.id, from, to, at: now })) {
          result.escalated.push({ ticketId: ticket.id, from, to });
          this.logger.info(`${LOG_PREFIX} Ticket ${ticket.id}: ${from} → ${to}`);
        } else {
          result.unchanged.push(ticket.id);
        }
      } catch (error) {
        result.failed.push({ ticketId: ticket.id, message: errorMessage(error) });
        this.logger.error(`${LOG_PREFIX} Ticket ${ticket.id}: escalation failed`, error);
      }
    }
    return result;
  }
}
