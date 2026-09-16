import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_TICKETS } from '../src/db/seedData.js';
import type { Agent } from '../src/models/ticket.js';
import type { PaginatedTickets, TicketDto } from '../src/models/ticketDto.js';
import type { QueueSummary } from '../src/services/ticketService.js';
import { startTestServer, type TestServer } from './helpers/testServer.js';
import { HOUR, MINUTE, NOW } from './helpers/time.js';

interface ErrorResponse {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
}

const PRIYA = 'agent-priya';
const MARCUS = 'agent-marcus';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

const listTickets = (query = '') => server.json<PaginatedTickets>(`/api/tickets${query}`);

const createTicket = (body: Record<string, unknown>) =>
  server.json<TicketDto>('/api/tickets', { method: 'POST', body: JSON.stringify(body) });

const updateTicket = (id: string, body: Record<string, unknown>) =>
  server.json<TicketDto>(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

const validTicket = {
  customerName: 'Test Customer',
  title: 'Printer is on fire',
  description: 'Literally.',
  priority: 'URGENT',
};

describe('GET /api/tickets', () => {
  it('returns the first page in queue order with pagination metadata', async () => {
    const { status, body } = await listTickets();

    expect(status).toBe(200);
    expect(body.tickets).toHaveLength(20);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: SEED_TICKETS.length,
      totalPages: Math.ceil(SEED_TICKETS.length / 20),
    });
    expect(body.meta.serverTime).toBe(new Date(NOW).toISOString());

    const titles = body.tickets.map((ticket) => ticket.title);
    expect(titles[0]).toBe('VPN disconnects every few minutes for the whole finance team');
    expect(titles.indexOf('Point-of-sale terminals offline at the downtown store')).toBeLessThan(
      titles.indexOf('Shared calendar not syncing to mobile devices'),
    );
  });

  it('lists every overdue ticket before any on-time ticket, and resolved tickets last', async () => {
    const { body } = await listTickets('?limit=100');
    const flags = body.tickets.map((ticket) => (ticket.status === 'RESOLVED' ? 2 : ticket.isOverdue ? 0 : 1));
    expect(flags).toEqual([...flags].sort());
    expect(flags.filter((flag) => flag === 0)).toHaveLength(8);
  });

  it('serves the remaining tickets on the last page', async () => {
    const lastPage = Math.ceil(SEED_TICKETS.length / 20);
    const { body } = await listTickets(`?page=${lastPage}`);
    expect(body.tickets).toHaveLength(SEED_TICKETS.length - (lastPage - 1) * 20);
    expect(body.pagination.page).toBe(lastPage);
  });

  it('returns an empty page beyond the last page', async () => {
    const { status, body } = await listTickets('?page=99');
    expect(status).toBe(200);
    expect(body.tickets).toEqual([]);
  });

  it('filters by overdue state', async () => {
    const { body } = await listTickets('?overdue=true');
    expect(body.pagination.total).toBe(8);
    expect(body.tickets.every((ticket) => ticket.isOverdue)).toBe(true);
  });

  it('filters by assigned agent', async () => {
    const { body } = await listTickets(`?assignedTo=${PRIYA}&limit=100`);
    expect(body.tickets.length).toBeGreaterThan(0);
    expect(body.tickets.every((ticket) => ticket.assignedAgentId === PRIYA)).toBe(true);
    expect(body.tickets[0]?.assignedAgentName).toBe('Priya Sharma');
  });

  it('filters unassigned tickets', async () => {
    const { body } = await listTickets('?assignedTo=unassigned&limit=100');
    expect(body.tickets.length).toBeGreaterThan(0);
    expect(body.tickets.every((ticket) => ticket.assignedAgentId === null)).toBe(true);
  });

  it('filters by one or more statuses', async () => {
    const resolved = await listTickets('?status=RESOLVED');
    expect(resolved.body.tickets.every((ticket) => ticket.status === 'RESOLVED')).toBe(true);
    expect(resolved.body.pagination.total).toBe(8);

    const active = await listTickets('?status=OPEN,IN_PROGRESS&limit=100');
    expect(active.body.pagination.total).toBe(SEED_TICKETS.length - 8);
  });

  it('searches customer name and title case-insensitively', async () => {
    const byCustomer = await listTickets('?search=acme');
    expect(byCustomer.body.tickets.length).toBeGreaterThan(0);
    expect(byCustomer.body.tickets.every((ticket) => ticket.customerName === 'Acme Corporation')).toBe(true);

    const byTitle = await listTickets(`?search=${encodeURIComponent("won't boot")}`);
    expect(byTitle.body.tickets.map((ticket) => ticket.title)).toEqual(["Laptop won't boot before client demo"]);
  });

  it('treats SQL wildcard characters in search as literal text', async () => {
    const { body } = await listTickets(`?search=${encodeURIComponent('%')}`);
    expect(body.pagination.total).toBe(0);
  });

  it('combines filters', async () => {
    const { body } = await listTickets(`?overdue=true&assignedTo=${MARCUS}&search=terminals`);
    expect(body.tickets.map((ticket) => ticket.title)).toEqual([
      'Point-of-sale terminals offline at the downtown store',
    ]);
  });

  it('re-orders the queue as time passes, without any write', async () => {
    const before = await listTickets('?limit=100');
    const nextChange = before.body.meta.nextQueueChangeAt;
    expect(nextChange).not.toBeNull();

    const dueSoon = 'CEO cannot join board call — headset not detected';
    const firstOnTime = before.body.tickets.find((ticket) => !ticket.isOverdue);
    expect(firstOnTime?.title).toBe(dueSoon);

    server.setNow(Date.parse(nextChange as string));
    const after = await listTickets('?limit=100');
    const breached = after.body.tickets.find((ticket) => ticket.title === dueSoon);
    expect(breached?.isOverdue).toBe(true);
    expect(after.body.pagination.total).toBe(before.body.pagination.total);
    expect(after.body.tickets.filter((ticket) => ticket.isOverdue)).toHaveLength(9);
  });

  it('reports the next queue change as 1ms after the earliest pending deadline', async () => {
    const { body } = await listTickets();
    // The earliest pending deadline in the seed data is the headset ticket (created 110 minutes ago, 2h SLA).
    expect(body.meta.nextQueueChangeAt).toBe(new Date(NOW + 10 * MINUTE + 1).toISOString());
  });

  it.each([
    ['page=0', 'page'],
    ['limit=1000', 'limit'],
    ['overdue=maybe', 'overdue'],
    ['status=CLOSED', 'status.0'],
  ])('rejects invalid query %s', async (query, field) => {
    const { status, body } = await server.json<ErrorResponse>(`/api/tickets?${query}`);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.field)).toContain(field);
  });
});

describe('GET /api/tickets/summary', () => {
  it('returns counts across the whole queue', async () => {
    const { status, body } = await server.json<QueueSummary>('/api/tickets/summary');
    expect(status).toBe(200);
    expect(body.counts).toEqual({
      total: 43,
      active: 35,
      overdue: 8,
      urgent: 8,
      dueSoon: 3,
      open: 27,
      inProgress: 8,
      resolved: 8,
    });
  });

  it('counts due-soon tickets inside the 30 minute window, excluding overdue ones', async () => {
    // At NOW + 20m the headset (due at +10m) is overdue; the conference room (+20m) is exactly due,
    // the warehouse printer (+25m) is inside the window, and the ransomware ticket (+45m) now is too.
    server.setNow(NOW + 20 * MINUTE);
    const { body } = await server.json<QueueSummary>('/api/tickets/summary');
    expect(body.counts).toMatchObject({ overdue: 9, dueSoon: 3 });
  });
});

describe('POST /api/tickets', () => {
  it('creates a ticket with an SLA deadline derived from its priority', async () => {
    const { status, body } = await createTicket({ ...validTicket, assignedAgentId: PRIYA });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      customerName: 'Test Customer',
      priority: 'URGENT',
      status: 'OPEN',
      assignedAgentId: PRIYA,
      assignedAgentName: 'Priya Sharma',
      createdAt: new Date(NOW).toISOString(),
      slaDeadline: new Date(NOW + 2 * HOUR).toISOString(),
      isOverdue: false,
    });

    const fetched = await server.json<TicketDto>(`/api/tickets/${body.id}`);
    expect(fetched.body).toEqual(body);
  });

  it('applies the 24 hour SLA to low priority tickets', async () => {
    const { body } = await createTicket({ ...validTicket, priority: 'LOW' });
    expect(body.slaDeadline).toBe(new Date(NOW + 24 * HOUR).toISOString());
    expect(body.assignedAgentId).toBeNull();
    expect(body.description).toBe('Literally.');
  });

  it('accepts HIGH priority with its 8 hour SLA', async () => {
    const { status, body } = await createTicket({ ...validTicket, priority: 'HIGH' });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      priority: 'HIGH',
      slaDeadline: new Date(NOW + 8 * HOUR).toISOString(),
      escalationCount: 0,
      lastEscalatedAt: null,
    });
  });

  it('trims text and rejects blank required fields', async () => {
    const { status, body } = await server.json<ErrorResponse>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...validTicket, customerName: '   ', title: '' }),
    });
    expect(status).toBe(400);
    expect(body.error.details?.map((detail) => detail.field).sort()).toEqual(['customerName', 'title']);
  });

  it('distinguishes missing fields from fields of the wrong type', async () => {
    const { status, body } = await server.json<ErrorResponse>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ priority: 'LOW', title: 42 }),
    });
    expect(status).toBe(400);
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        { field: 'customerName', message: 'Customer name is required' },
        { field: 'title', message: 'Title must be text' },
      ]),
    );
  });

  it('rejects unknown priorities and client-supplied server fields', async () => {
    const badPriority = await server.json<ErrorResponse>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...validTicket, priority: 'CRITICAL' }),
    });
    expect(badPriority.status).toBe(400);

    const injectedDeadline = await server.json<ErrorResponse>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...validTicket, slaDeadline: '2099-01-01T00:00:00Z' }),
    });
    expect(injectedDeadline.status).toBe(400);
  });

  it('rejects assignment to an agent that does not exist', async () => {
    const { status, body } = await server.json<ErrorResponse>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...validTicket, assignedAgentId: 'agent-nobody' }),
    });
    expect(status).toBe(400);
    expect(body.error.details?.[0]?.field).toBe('assignedAgentId');
  });

  it('returns 400 for malformed JSON without leaking internals', async () => {
    const response = await server.request('/api/tickets', { method: 'POST', body: '{"title":' });
    const body = (await response.json()) as ErrorResponse;
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.js/);
  });
});

describe('PATCH /api/tickets/:id', () => {
  async function createdTicketId(): Promise<string> {
    return (await createTicket({ ...validTicket, priority: 'NORMAL' })).body.id;
  }

  it('updates status and editable fields and bumps updatedAt', async () => {
    const id = await createdTicketId();
    server.setNow(NOW + MINUTE);

    const { status, body } = await updateTicket(id, { status: 'IN_PROGRESS', title: 'Printer fixed-ish' });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'IN_PROGRESS',
      title: 'Printer fixed-ish',
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW + MINUTE).toISOString(),
    });
  });

  it('reassigns and unassigns tickets', async () => {
    const id = await createdTicketId();

    const assigned = await updateTicket(id, { assignedAgentId: MARCUS });
    expect(assigned.body.assignedAgentName).toBe('Marcus Chen');

    const unassigned = await updateTicket(id, { assignedAgentId: null });
    expect(unassigned.body.assignedAgentId).toBeNull();
    expect(unassigned.body.assignedAgentName).toBeNull();
  });

  it('recalculates the SLA deadline from creation time when priority changes', async () => {
    const id = await createdTicketId();
    server.setNow(NOW + 3 * HOUR);

    const escalated = await updateTicket(id, { priority: 'URGENT' });
    expect(escalated.body.slaDeadline).toBe(new Date(NOW + 2 * HOUR).toISOString());
    expect(escalated.body.isOverdue).toBe(true);
  });

  it('keeps the stored deadline when other fields change', async () => {
    const id = await createdTicketId();
    const { body } = await updateTicket(id, { description: 'More detail' });
    expect(body.slaDeadline).toBe(new Date(NOW + 24 * HOUR).toISOString());
  });

  it('resolving a ticket removes it from the overdue filter', async () => {
    const overdue = await listTickets('?overdue=true');
    const target = overdue.body.tickets[0] as TicketDto;

    const resolved = await updateTicket(target.id, { status: 'RESOLVED' });
    expect(resolved.body.isOverdue).toBe(false);

    const after = await listTickets('?overdue=true');
    expect(after.body.pagination.total).toBe(overdue.body.pagination.total - 1);
  });

  it('rejects empty and invalid updates', async () => {
    const id = await createdTicketId();
    expect((await updateTicket(id, {})).status).toBe(400);
    expect((await updateTicket(id, { status: 'DONE' })).status).toBe(400);
    expect((await updateTicket(id, { createdAt: 0 })).status).toBe(400);
  });

  it('returns 404 for an unknown ticket', async () => {
    const { status, body } = await server.json<ErrorResponse>('/api/tickets/does-not-exist', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/tickets/:id', () => {
  it('deletes a ticket permanently', async () => {
    const { body: created } = await createTicket(validTicket);

    const deleted = await server.request(`/api/tickets/${created.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);

    const fetched = await server.json<ErrorResponse>(`/api/tickets/${created.id}`);
    expect(fetched.status).toBe(404);

    const again = await server.request(`/api/tickets/${created.id}`, { method: 'DELETE' });
    expect(again.status).toBe(404);
  });
});

describe('GET /api/agents', () => {
  it('lists agents alphabetically', async () => {
    const { status, body } = await server.json<{ agents: Agent[] }>('/api/agents');
    expect(status).toBe(200);
    expect(body.agents.map((agent) => agent.name)).toEqual(['Marcus Chen', 'Priya Sharma']);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const { status, body } = await server.json<ErrorResponse>('/api/nope');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Route GET /api/nope not found');
  });
});
