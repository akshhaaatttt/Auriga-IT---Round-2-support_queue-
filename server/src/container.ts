import type { DatabaseConnection } from './db/database.js';
import { EscalationService } from './escalation/escalationService.js';
import type { EscalationLogger } from './escalation/escalationTypes.js';
import type { Clock } from './models/clock.js';
import { AgentRepository } from './repositories/agentRepository.js';
import { TicketRepository } from './repositories/ticketRepository.js';
import { AgentService } from './services/agentService.js';
import { TicketService } from './services/ticketService.js';

export interface Services {
  clock: Clock;
  tickets: TicketService;
  agents: AgentService;
  escalation: EscalationService;
}

export interface ServiceOptions {
  db: DatabaseConnection;
  clock?: Clock;
  logger?: EscalationLogger;
}

/** Composition root: one set of service instances shared by the HTTP API and the scheduler. */
export function createServices({ db, clock = Date.now, logger = console }: ServiceOptions): Services {
  const ticketRepository = new TicketRepository(db);
  const agentRepository = new AgentRepository(db);
  return {
    clock,
    tickets: new TicketService(ticketRepository, agentRepository, clock),
    agents: new AgentService(agentRepository),
    escalation: new EscalationService(ticketRepository, logger),
  };
}
