import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EscalationRunResultDto } from '../src/escalation/escalationTypes.js';
import type { PaginatedTickets, TicketDto } from '../src/models/ticketDto.js';
import { TicketRepository } from '../src/repositories/ticketRepository.js';
import { makeTicketRecord } from './helpers/ticketRecords.js';
import { startTestServer, type TestServer } from './helpers/testServer.js';
import { MINUTE, NOW } from './helpers/time.js';

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
  server.db.exec('DELETE FROM tickets');
});

afterEach(async () => {
  await server.close();
});

const runEscalation = () =>
  server.json<EscalationRunResultDto>('/api/tickets/escalation/run', { method: 'POST' });

const queueIds = async (query = '') =>
  (await server.json<PaginatedTickets>(`/api/tickets${query}`)).body.tickets.map((ticket) => ticket.id);

const getTicket = async (id: string) => (await server.json<TicketDto>(`/api/tickets/${id}`)).body;

function insert(...records: Parameters<typeof makeTicketRecord>[0][]): void {
  const repository = new TicketRepository(server.db);
  records.forEach((record) => repository.insert(makeTicketRecord(record)));
}

describe('POST /api/tickets/escalation/run', () => {
  it('runs one escalation pass and reports what changed', async () => {
    insert(
      { id: 'normal', priority: 'NORMAL', deadlineIn: -MINUTE },
      { id: 'urgent', priority: 'URGENT', deadlineIn: -MINUTE },
      { id: 'on-time', priority: 'NORMAL', deadlineIn: MINUTE },
    );

    const { status, body } = await runEscalation();

    expect(status).toBe(200);
    expect(body).toEqual({
      ranAt: new Date(NOW).toISOString(),
      candidates: 1,
      escalated: [{ ticketId: 'normal', from: 'NORMAL', to: 'HIGH' }],
      unchanged: [],
      failed: [],
    });
  });

  it('persists the change and exposes the escalation audit fields', async () => {
    insert({ id: 'normal', priority: 'NORMAL', deadlineIn: -MINUTE });
    server.setNow(NOW + MINUTE);

    await runEscalation();

    expect(await getTicket('normal')).toMatchObject({
      priority: 'HIGH',
      escalationCount: 1,
      lastEscalatedAt: new Date(NOW + MINUTE).toISOString(),
      updatedAt: new Date(NOW + MINUTE).toISOString(),
      isOverdue: true,
    });
  });

  it('moves a ticket only one level per call', async () => {
    insert({ id: 'normal', priority: 'NORMAL', deadlineIn: -60 * MINUTE });

    await runEscalation();
    expect((await getTicket('normal')).priority).toBe('HIGH');

    await runEscalation();
    expect((await getTicket('normal')).priority).toBe('URGENT');

    const third = await runEscalation();
    expect(third.body.escalated).toEqual([]);
    expect((await getTicket('normal')).priority).toBe('URGENT');
  });

  it('only accepts POST', async () => {
    const { status } = await server.json('/api/tickets/escalation/run');
    expect(status).toBe(404);
  });
});

describe('escalation and queue ordering', () => {
  it('re-orders the overdue tier using the escalated priorities', async () => {
    // Equal breach duration, so priority decides the order within the overdue tier.
    insert(
      { id: 'A', priority: 'NORMAL', deadlineIn: -10 * MINUTE },
      { id: 'B', priority: 'HIGH', deadlineIn: -10 * MINUTE },
      { id: 'C', priority: 'LOW', deadlineIn: -10 * MINUTE },
    );
    expect(await queueIds()).toEqual(['B', 'A', 'C']);

    await runEscalation();
    expect([(await getTicket('A')).priority, (await getTicket('B')).priority]).toEqual(['HIGH', 'URGENT']);
    expect(await queueIds()).toEqual(['B', 'A', 'C']);

    await runEscalation();
    // A catches up with B (both URGENT); C is now HIGH. Ties fall back to creation time, then id.
    expect(await queueIds()).toEqual(['A', 'B', 'C']);
    expect((await getTicket('C')).priority).toBe('HIGH');
  });

  it('lets an escalated ticket overtake an URGENT ticket it used to trail', async () => {
    // Same breach duration; the older ticket wins once priorities are equal.
    insert(
      { id: 'older-high', priority: 'HIGH', deadlineIn: -5 * MINUTE, createdAt: NOW - 100 * MINUTE },
      { id: 'newer-urgent', priority: 'URGENT', deadlineIn: -5 * MINUTE, createdAt: NOW - 50 * MINUTE },
    );
    expect(await queueIds()).toEqual(['newer-urgent', 'older-high']);

    await runEscalation();

    expect((await getTicket('older-high')).priority).toBe('URGENT');
    expect((await getTicket('newer-urgent')).escalationCount).toBe(0);
    expect(await queueIds()).toEqual(['older-high', 'newer-urgent']);
  });

  it('keeps on-time tickets out of escalation and below every overdue ticket', async () => {
    insert(
      { id: 'urgent-on-time', priority: 'URGENT', deadlineIn: MINUTE },
      { id: 'low-overdue', priority: 'LOW', deadlineIn: -MINUTE },
    );

    await runEscalation();

    expect(await queueIds()).toEqual(['low-overdue', 'urgent-on-time']);
    expect((await getTicket('low-overdue')).priority).toBe('NORMAL');
    expect((await getTicket('urgent-on-time')).escalationCount).toBe(0);
  });

  it('lets an agent manually change priority afterwards without resetting the audit trail', async () => {
    insert({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE });
    await runEscalation();

    const { body } = await server.json<TicketDto>('/api/tickets/a', {
      method: 'PATCH',
      body: JSON.stringify({ priority: 'LOW' }),
    });

    expect(body).toMatchObject({ priority: 'LOW', escalationCount: 1 });
  });
});
