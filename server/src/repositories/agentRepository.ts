import type { DatabaseConnection } from '../db/database.js';
import type { Agent } from '../models/ticket.js';

export class AgentRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findAll(): Agent[] {
    return this.db.prepare<[], Agent>('SELECT id, name, email FROM agents ORDER BY name ASC').all();
  }

  exists(id: string): boolean {
    return this.db.prepare<[string], { found: 1 }>('SELECT 1 AS found FROM agents WHERE id = ?').get(id) !== undefined;
  }

  insert(agent: Agent): void {
    this.db.prepare<[Agent]>('INSERT INTO agents (id, name, email) VALUES (@id, @name, @email)').run(agent);
  }
}
