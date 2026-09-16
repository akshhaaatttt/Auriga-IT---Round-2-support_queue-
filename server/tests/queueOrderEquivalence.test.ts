import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openDatabase, type DatabaseConnection } from '../src/db/database.js';
import { calculateSlaDeadline } from '../src/domain/sla.js';
import type { Priority, Ticket, TicketStatus } from '../src/models/ticket.js';
import { TicketRepository, type TicketFilters } from '../src/repositories/ticketRepository.js';
import { sortTickets } from '../src/sorting/priorityQueue.js';
import { createRandom, pick } from './helpers/random.js';
import { HOUR, MINUTE, NOW } from './helpers/time.js';

/**
 * The SQL ORDER BY is a second implementation of the canonical TypeScript comparator.
 * These tests pin the two together: any divergence fails here.
 */
const PRIORITIES: readonly Priority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
const STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
const TICKET_COUNT = 1500;

function generateTickets(seed: number): Ticket[] {
  const random = createRandom(seed);
  return Array.from({ length: TICKET_COUNT }, (_, index) => {
    const priority = pick(random, PRIORITIES);
    // Coarse creation buckets force many exact ties on deadline and creation time.
    const createdAt = NOW - Math.round(random() * 60) * 30 * MINUTE;
    // Some tickets carry a deadline from an older SLA policy, so createdAt tie-breaks are reachable.
    const legacyShift = random() < 0.2 ? Math.round(random() * 4) * HOUR : 0;
    return {
      id: `ticket-${String(Math.floor(random() * 1e9)).padStart(9, '0')}-${index}`,
      customerName: `Customer ${index % 17}`,
      title: `Issue ${index}`,
      description: '',
      priority,
      status: pick(random, STATUSES),
      assignedAgentId: null,
      createdAt,
      updatedAt: createdAt,
      slaDeadline: calculateSlaDeadline(createdAt, priority) + legacyShift,
      escalationCount: 0,
      lastEscalatedAt: null,
    };
  });
}

describe('SQL queue ordering matches the TypeScript comparator', () => {
  let db: DatabaseConnection;
  let repository: TicketRepository;
  const tickets = generateTickets(2026);

  beforeAll(() => {
    db = openDatabase(IN_MEMORY_DATABASE);
    repository = new TicketRepository(db);
    db.transaction(() => tickets.forEach((ticket) => repository.insert(ticket)))();
  });

  afterAll(() => db.close());

  const evaluationTimes = {
    'the reference time': NOW,
    'exactly on a shared deadline boundary': NOW - 30 * MINUTE + 2 * HOUR,
    'one millisecond after that boundary': NOW - 30 * MINUTE + 2 * HOUR + 1,
    'a day later': NOW + 24 * HOUR,
    'far in the past (nothing overdue)': NOW - 1000 * HOUR,
  };

  for (const [label, now] of Object.entries(evaluationTimes)) {
    it(`produces identical order at ${label}`, () => {
      const fromSql = repository.findQueuePage({}, now, TICKET_COUNT, 0).map((ticket) => ticket.id);
      const fromTypeScript = sortTickets(tickets, now).map((ticket) => ticket.id);
      expect(fromSql).toEqual(fromTypeScript);
    });
  }

  it('produces identical order for filtered subsets', () => {
    const filters: TicketFilters = { statuses: ['OPEN', 'IN_PROGRESS'], search: 'customer 3' };
    const expected = sortTickets(
      tickets.filter((ticket) => ticket.status !== 'RESOLVED' && ticket.customerName.toLowerCase().includes('customer 3')),
      NOW,
    ).map((ticket) => ticket.id);

    expect(repository.findQueuePage(filters, NOW, TICKET_COUNT, 0).map((ticket) => ticket.id)).toEqual(expected);
  });

  it('pages through the queue without gaps or duplicates', () => {
    const pageSize = 37;
    const paged: string[] = [];
    for (let offset = 0; offset < TICKET_COUNT; offset += pageSize) {
      paged.push(...repository.findQueuePage({}, NOW, pageSize, offset).map((ticket) => ticket.id));
    }
    expect(paged).toEqual(sortTickets(tickets, NOW).map((ticket) => ticket.id));
  });

  it('counts overdue tickets exactly as isOverdue does', () => {
    const expected = tickets.filter((ticket) => ticket.status !== 'RESOLVED' && NOW > ticket.slaDeadline).length;
    expect(repository.count({ overdue: true }, NOW)).toBe(expected);
    expect(repository.count({ overdue: false }, NOW)).toBe(TICKET_COUNT - expected);
  });
});
