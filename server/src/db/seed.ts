import { randomUUID } from 'node:crypto';
import { calculateSlaDeadline } from '../domain/sla.js';
import { AgentRepository } from '../repositories/agentRepository.js';
import { TicketRepository } from '../repositories/ticketRepository.js';
import type { DatabaseConnection } from './database.js';
import { SEED_AGENTS, SEED_TICKETS } from './seedData.js';

const MS_PER_MINUTE = 60 * 1000;

/** Replaces all data with the demo data set, with timestamps relative to `now`. */
export function seedDatabase(db: DatabaseConnection, now: number = Date.now()): void {
  const agents = new AgentRepository(db);
  const tickets = new TicketRepository(db);

  db.transaction(() => {
    db.exec('DELETE FROM tickets; DELETE FROM agents;');
    SEED_AGENTS.forEach((agent) => agents.insert(agent));
    SEED_TICKETS.forEach(({ createdMinutesAgo, ...ticket }) => {
      const createdAt = now - createdMinutesAgo * MS_PER_MINUTE;
      tickets.insert({
        ...ticket,
        id: randomUUID(),
        createdAt,
        updatedAt: createdAt,
        slaDeadline: calculateSlaDeadline(createdAt, ticket.priority),
        escalationCount: 0,
        lastEscalatedAt: null,
      });
    });
  })();
}

/** Seeds only a brand-new database. Returns true when seeding happened. */
export function seedIfEmpty(db: DatabaseConnection): boolean {
  const row = db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM agents').get();
  if ((row?.count ?? 0) > 0) return false;
  seedDatabase(db);
  return true;
}
