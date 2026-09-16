import type { Agent, TicketUpdate } from '../types/api';
import { PRIORITY_LABELS } from './labels';

/** A short, specific confirmation for a ticket update, e.g. "Ticket resolved". */
export function describeTicketChange(changes: TicketUpdate, agents: readonly Agent[]): string {
  const fields = Object.keys(changes);
  if (fields.length !== 1) return 'Ticket updated';

  if (changes.status === 'RESOLVED') return 'Ticket resolved';
  if (changes.status === 'IN_PROGRESS') return 'Marked as in progress';
  if (changes.status === 'OPEN') return 'Ticket reopened';
  if (changes.priority) return `Priority changed to ${PRIORITY_LABELS[changes.priority]}`;
  if (changes.assignedAgentId === null) return 'Ticket unassigned';
  if (changes.assignedAgentId) {
    const agent = agents.find((candidate) => candidate.id === changes.assignedAgentId);
    return agent ? `Assigned to ${agent.name}` : 'Ticket reassigned';
  }
  return 'Ticket updated';
}
