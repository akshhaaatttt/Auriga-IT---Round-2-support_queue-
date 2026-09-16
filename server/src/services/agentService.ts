import type { Agent } from '../models/ticket.js';
import type { AgentRepository } from '../repositories/agentRepository.js';

export class AgentService {
  constructor(private readonly agents: AgentRepository) {}

  listAgents(): Agent[] {
    return this.agents.findAll();
  }
}
