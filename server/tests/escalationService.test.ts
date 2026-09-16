import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE, openDatabase, type DatabaseConnection } from '../src/db/database.js';
import { EscalationService } from '../src/escalation/escalationService.js';
import type { Priority, Ticket } from '../src/models/ticket.js';
import { TicketRepository } from '../src/repositories/ticketRepository.js';
import { makeTicketRecord } from './helpers/ticketRecords.js';
import { silentLogger } from './helpers/testServer.js';
import { HOUR, MINUTE, NOW } from './helpers/time.js';

let db: DatabaseConnection;
let repository: TicketRepository;
let service: EscalationService;

beforeEach(() => {
  db = openDatabase(IN_MEMORY_DATABASE);
  repository = new TicketRepository(db);
  service = new EscalationService(repository, silentLogger);
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});

function insert(...tickets: Ticket[]): void {
  tickets.forEach((ticket) => repository.insert(ticket));
}

function stored(id: string): Ticket {
  const ticket = repository.findById(id);
  if (!ticket) throw new Error(`Ticket ${id} missing from database`);
  return ticket;
}

const priorityOf = (id: string): Priority => stored(id).priority;

describe('EscalationService — persistence', () => {
  it('escalates an overdue NORMAL ticket one level per run, persisting each step', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -15 * MINUTE }));
    const before = stored('a');

    service.run(NOW);
    expect(priorityOf('a')).toBe('HIGH');

    service.run(NOW + MINUTE);
    expect(priorityOf('a')).toBe('URGENT');

    service.run(NOW + 2 * MINUTE);
    expect(priorityOf('a')).toBe('URGENT');

    const after = stored('a');
    expect(after.updatedAt).toBe(NOW + MINUTE);
    expect(after.lastEscalatedAt).toBe(NOW + MINUTE);
    expect(after.escalationCount).toBe(2);
    expect(after.createdAt).toBe(before.createdAt);
  });

  it('records the escalation time in updatedAt and lastEscalatedAt', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    expect(stored('a').updatedAt).not.toBe(NOW);

    service.run(NOW);

    expect(stored('a')).toMatchObject({ updatedAt: NOW, lastEscalatedAt: NOW, escalationCount: 1 });
  });

  it('keeps the original SLA deadline, so the breach duration stays continuous', () => {
    const record = makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -15 * MINUTE });
    insert(record);

    service.run(NOW);

    expect(stored('a').slaDeadline).toBe(record.slaDeadline);
  });

  it('does not touch an URGENT ticket at all (no write, no updatedAt change)', () => {
    const record = makeTicketRecord({ id: 'u', priority: 'URGENT', deadlineIn: -HOUR });
    insert(record);

    const result = service.run(NOW);

    expect(result.candidates).toBe(0);
    expect(stored('u')).toEqual({ ...record, assignedAgentName: null });
  });
});

describe('EscalationService — one level per run', () => {
  it('moves NORMAL to HIGH, never to URGENT, in a single run', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -48 * HOUR }));

    const result = service.run(NOW);

    expect(priorityOf('a')).toBe('HIGH');
    expect(result.escalated).toEqual([{ ticketId: 'a', from: 'NORMAL', to: 'HIGH' }]);
  });

  it('follows the exact sequence NORMAL → HIGH → URGENT → URGENT across runs', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    const sequence = [priorityOf('a')];
    for (let run = 1; run <= 3; run += 1) {
      service.run(NOW + run * MINUTE);
      sequence.push(priorityOf('a'));
    }
    expect(sequence).toEqual(['NORMAL', 'HIGH', 'URGENT', 'URGENT']);
  });

  it('follows the exact sequence HIGH → URGENT → URGENT across runs', () => {
    insert(makeTicketRecord({ id: 'b', priority: 'HIGH', deadlineIn: -MINUTE }));
    const sequence = [priorityOf('b')];
    for (let run = 1; run <= 2; run += 1) {
      service.run(NOW + run * MINUTE);
      sequence.push(priorityOf('b'));
    }
    expect(sequence).toEqual(['HIGH', 'URGENT', 'URGENT']);
  });

  it('walks an overdue LOW ticket up the whole chain, one level per run', () => {
    insert(makeTicketRecord({ id: 'l', priority: 'LOW', deadlineIn: -MINUTE }));
    const sequence = [priorityOf('l')];
    for (let run = 1; run <= 4; run += 1) {
      service.run(NOW + run * MINUTE);
      sequence.push(priorityOf('l'));
    }
    expect(sequence).toEqual(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'URGENT']);
  });

  it('treats each invocation as its own run, even at the same instant', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    service.run(NOW);
    service.run(NOW);
    // Each run is a separate run, so the second legitimately moves HIGH → URGENT; never further.
    expect(priorityOf('a')).toBe('URGENT');
    expect(stored('a').escalationCount).toBe(2);
  });
});

describe('EscalationService — eligibility', () => {
  it('handles a mixed set of tickets correctly in one run', () => {
    insert(
      makeTicketRecord({ id: 'A', priority: 'NORMAL', deadlineIn: -HOUR }),
      makeTicketRecord({ id: 'B', priority: 'HIGH', deadlineIn: -HOUR }),
      makeTicketRecord({ id: 'C', priority: 'URGENT', deadlineIn: -HOUR }),
      makeTicketRecord({ id: 'D', priority: 'NORMAL', deadlineIn: HOUR }),
      makeTicketRecord({ id: 'E', priority: 'NORMAL', status: 'RESOLVED', deadlineIn: -HOUR }),
    );

    const result = service.run(NOW);

    expect(['A', 'B', 'C', 'D', 'E'].map(priorityOf)).toEqual(['HIGH', 'URGENT', 'URGENT', 'NORMAL', 'NORMAL']);
    expect(stored('E').escalationCount).toBe(0);
    expect(stored('D').escalationCount).toBe(0);
    expect(result).toMatchObject({ ranAt: NOW, candidates: 2, unchanged: [], failed: [] });
    expect(result.escalated).toEqual(
      expect.arrayContaining([
        { ticketId: 'A', from: 'NORMAL', to: 'HIGH' },
        { ticketId: 'B', from: 'HIGH', to: 'URGENT' },
      ]),
    );
  });

  it('does not escalate at exactly the deadline, but does 1ms later', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: 0 }));

    service.run(NOW);
    expect(priorityOf('a')).toBe('NORMAL');

    service.run(NOW + 1);
    expect(priorityOf('a')).toBe('HIGH');
  });

  it('escalates OPEN and IN_PROGRESS tickets but not RESOLVED ones', () => {
    insert(
      makeTicketRecord({ id: 'open', status: 'OPEN', deadlineIn: -MINUTE }),
      makeTicketRecord({ id: 'progress', status: 'IN_PROGRESS', deadlineIn: -MINUTE }),
      makeTicketRecord({ id: 'resolved', status: 'RESOLVED', deadlineIn: -MINUTE }),
    );

    service.run(NOW);

    expect([priorityOf('open'), priorityOf('progress'), priorityOf('resolved')]).toEqual(['HIGH', 'HIGH', 'NORMAL']);
  });

  it('reports an empty run when nothing is eligible', () => {
    insert(makeTicketRecord({ id: 'a', deadlineIn: HOUR }));
    expect(service.run(NOW)).toEqual({ ranAt: NOW, candidates: 0, escalated: [], unchanged: [], failed: [] });
  });

  it('only loads tickets that can actually be escalated', () => {
    const findSpy = vi.spyOn(repository, 'findEscalationCandidates');
    insert(
      makeTicketRecord({ id: 'eligible', deadlineIn: -MINUTE }),
      makeTicketRecord({ id: 'on-time', deadlineIn: MINUTE }),
      makeTicketRecord({ id: 'urgent', priority: 'URGENT', deadlineIn: -MINUTE }),
      makeTicketRecord({ id: 'resolved', status: 'RESOLVED', deadlineIn: -MINUTE }),
    );

    service.run(NOW);

    expect(findSpy.mock.results[0]?.value).toEqual([
      { id: 'eligible', priority: 'NORMAL', status: 'OPEN', slaDeadline: NOW - MINUTE },
    ]);
  });
});

describe('EscalationService — atomic, stale-safe updates', () => {
  it('refuses to apply an escalation computed from a stale priority', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    // Another process already escalated it.
    expect(repository.applyEscalation({ id: 'a', from: 'NORMAL', to: 'HIGH', at: NOW })).toBe(true);

    // A second writer that read NORMAL earlier must not overwrite, and must not double-step.
    expect(repository.applyEscalation({ id: 'a', from: 'NORMAL', to: 'HIGH', at: NOW })).toBe(false);
    expect(priorityOf('a')).toBe('HIGH');
    expect(stored('a').escalationCount).toBe(1);
  });

  it('refuses to escalate a ticket that was resolved after it was read', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    repository.update('a', { status: 'RESOLVED' }, NOW);

    expect(repository.applyEscalation({ id: 'a', from: 'NORMAL', to: 'HIGH', at: NOW })).toBe(false);
    expect(priorityOf('a')).toBe('NORMAL');
  });

  it('refuses to escalate a ticket that is not overdue at the given time', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: 0 }));
    expect(repository.applyEscalation({ id: 'a', from: 'NORMAL', to: 'HIGH', at: NOW })).toBe(false);
  });

  it('counts a ticket changed between read and write as unchanged, not escalated', () => {
    insert(makeTicketRecord({ id: 'a', priority: 'NORMAL', deadlineIn: -MINUTE }));
    const realApply = repository.applyEscalation.bind(repository);
    vi.spyOn(repository, 'applyEscalation').mockImplementation((escalation) => {
      // Simulate an agent re-prioritising the ticket just before our guarded write.
      repository.update('a', { priority: 'HIGH' }, NOW);
      return realApply(escalation);
    });

    const result = service.run(NOW);

    expect(result.escalated).toEqual([]);
    expect(result.unchanged).toEqual(['a']);
    expect(priorityOf('a')).toBe('HIGH');
    expect(stored('a').escalationCount).toBe(0);
  });
});

describe('EscalationService — failure handling', () => {
  it('keeps processing other tickets when one update fails, and reports the failure', () => {
    insert(
      makeTicketRecord({ id: 'a', deadlineIn: -3 * MINUTE }),
      makeTicketRecord({ id: 'broken', deadlineIn: -2 * MINUTE }),
      makeTicketRecord({ id: 'c', deadlineIn: -MINUTE }),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const failingService = new EscalationService(repository, logger);
    const realApply = repository.applyEscalation.bind(repository);
    vi.spyOn(repository, 'applyEscalation').mockImplementation((escalation) => {
      if (escalation.id === 'broken') throw new Error('disk on fire');
      return realApply(escalation);
    });

    const result = failingService.run(NOW);

    expect(result.escalated.map((entry) => entry.ticketId)).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ ticketId: 'broken', message: 'disk on fire' }]);
    expect([priorityOf('a'), priorityOf('broken'), priorityOf('c')]).toEqual(['HIGH', 'NORMAL', 'HIGH']);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('broken'), expect.any(Error));
  });

  it('logs the run start, each escalation, and a summary', () => {
    insert(makeTicketRecord({ id: 'a', deadlineIn: -MINUTE }), makeTicketRecord({ id: 'b', deadlineIn: HOUR }));
    const logger = { info: vi.fn(), error: vi.fn() };

    new EscalationService(repository, logger).run(NOW);

    expect(logger.info.mock.calls.map(([message]) => message)).toEqual([
      `[Escalation] Run started at ${new Date(NOW).toISOString()}`,
      '[Escalation] Ticket a: NORMAL → HIGH',
      '[Escalation] Run completed: candidates=1 escalated=1 unchanged=0 failed=0',
    ]);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
