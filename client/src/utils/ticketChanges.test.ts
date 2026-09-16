import { describe, expect, it } from 'vitest';
import type { Agent } from '../types/api';
import { describeTicketChange } from './ticketChanges';

const agents: Agent[] = [{ id: 'a1', name: 'Priya Sharma', email: 'p@example.com' }];

describe('describeTicketChange', () => {
  it.each([
    [{ status: 'RESOLVED' as const }, 'Ticket resolved'],
    [{ status: 'IN_PROGRESS' as const }, 'Marked as in progress'],
    [{ status: 'OPEN' as const }, 'Ticket reopened'],
    [{ priority: 'HIGH' as const }, 'Priority changed to High'],
    [{ assignedAgentId: 'a1' }, 'Assigned to Priya Sharma'],
    [{ assignedAgentId: 'unknown' }, 'Ticket reassigned'],
    [{ assignedAgentId: null }, 'Ticket unassigned'],
    [{ title: 'New title' }, 'Ticket updated'],
    [{ title: 'New title', description: 'More' }, 'Ticket updated'],
  ])('%o → %s', (changes, expected) => {
    expect(describeTicketChange(changes, agents)).toBe(expected);
  });
});
