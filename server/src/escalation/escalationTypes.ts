import type { Priority } from '../models/ticket.js';

export interface EscalatedTicket {
  ticketId: string;
  from: Priority;
  to: Priority;
}

export interface FailedEscalation {
  ticketId: string;
  message: string;
}

export interface EscalationRunResult {
  /** The single instant every decision in this run was evaluated against. */
  ranAt: number;
  /** Overdue, unresolved, below-URGENT tickets found at the start of the run. */
  candidates: number;
  escalated: EscalatedTicket[];
  /** Candidates left alone because they changed concurrently (resolved, re-prioritised, …). */
  unchanged: string[];
  failed: FailedEscalation[];
}

export interface EscalationRunResultDto extends Omit<EscalationRunResult, 'ranAt'> {
  ranAt: string;
}

export type EscalationLogger = Pick<Console, 'info' | 'error'>;
