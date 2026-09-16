import type { DatabaseConnection } from '../db/database.js';
import type { Priority, Ticket, TicketStatus } from '../models/ticket.js';
import { IS_OVERDUE_SQL, QUEUE_ORDER_BY_SQL } from './queueOrderSql.js';

export const UNASSIGNED = 'unassigned';

export interface TicketFilters {
  search?: string;
  overdue?: boolean;
  /** An agent id, or UNASSIGNED for tickets without an agent. */
  assignedTo?: string;
  statuses?: readonly TicketStatus[];
}

export interface TicketWithAgent extends Ticket {
  assignedAgentName: string | null;
}

export interface TicketCounts {
  total: number;
  overdue: number;
  open: number;
  inProgress: number;
  resolved: number;
}

export type TicketChanges = Partial<
  Pick<Ticket, 'customerName' | 'title' | 'description' | 'priority' | 'status' | 'assignedAgentId' | 'slaDeadline'>
>;

interface TicketRow {
  id: string;
  customer_name: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  created_at: number;
  updated_at: number;
  sla_deadline: number;
}

type SqlParams = Record<string, string | number | null>;

interface WhereClause {
  sql: string;
  params: SqlParams;
}

const COLUMN_BY_FIELD: Readonly<Record<keyof TicketChanges, string>> = {
  customerName: 'customer_name',
  title: 'title',
  description: 'description',
  priority: 'priority',
  status: 'status',
  assignedAgentId: 'assigned_agent_id',
  slaDeadline: 'sla_deadline',
};

const SELECT_TICKET_SQL = `
  SELECT t.id, t.customer_name, t.title, t.description, t.priority, t.status,
         t.assigned_agent_id, a.name AS assigned_agent_name,
         t.created_at, t.updated_at, t.sla_deadline
  FROM tickets t
  LEFT JOIN agents a ON a.id = t.assigned_agent_id
`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Builds a WHERE clause from fixed SQL fragments. User input only ever travels through
 * named parameters, never through string interpolation.
 */
function buildWhere(filters: TicketFilters, now: number): WhereClause {
  const conditions: string[] = [];
  const params: SqlParams = { now };

  if (filters.search) {
    conditions.push(`(t.customer_name LIKE @search ESCAPE '\\' OR t.title LIKE @search ESCAPE '\\')`);
    params.search = `%${escapeLike(filters.search)}%`;
  }
  if (filters.overdue !== undefined) {
    conditions.push(filters.overdue ? IS_OVERDUE_SQL : `NOT ${IS_OVERDUE_SQL}`);
  }
  if (filters.assignedTo === UNASSIGNED) {
    conditions.push('t.assigned_agent_id IS NULL');
  } else if (filters.assignedTo) {
    conditions.push('t.assigned_agent_id = @assignedTo');
    params.assignedTo = filters.assignedTo;
  }
  if (filters.statuses && filters.statuses.length > 0) {
    const placeholders = filters.statuses.map((status, index) => {
      params[`status${index}`] = status;
      return `@status${index}`;
    });
    conditions.push(`t.status IN (${placeholders.join(', ')})`);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function toTicket(row: TicketRow): TicketWithAgent {
  return {
    id: row.id,
    customerName: row.customer_name,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedAgentId: row.assigned_agent_id,
    assignedAgentName: row.assigned_agent_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slaDeadline: row.sla_deadline,
  };
}

export class TicketRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findQueuePage(filters: TicketFilters, now: number, limit: number, offset: number): TicketWithAgent[] {
    const where = buildWhere(filters, now);
    const rows = this.db
      .prepare<[SqlParams], TicketRow>(
        `${SELECT_TICKET_SQL} ${where.sql} ORDER BY ${QUEUE_ORDER_BY_SQL} LIMIT @limit OFFSET @offset`,
      )
      .all({ ...where.params, limit, offset });
    return rows.map(toTicket);
  }

  count(filters: TicketFilters, now: number): number {
    const where = buildWhere(filters, now);
    const row = this.db
      .prepare<[SqlParams], { total: number }>(`SELECT COUNT(*) AS total FROM tickets t ${where.sql}`)
      .get(where.params);
    return row?.total ?? 0;
  }

  /**
   * Earliest deadline among matching unresolved tickets that are not yet overdue. The queue
   * order next changes 1ms after this instant, so clients can schedule a precise refresh.
   */
  findNextDeadline(filters: TicketFilters, now: number): number | null {
    const where = buildWhere(filters, now);
    const pending = `t.status <> 'RESOLVED' AND t.sla_deadline >= @now`;
    const sql = where.sql ? `${where.sql} AND ${pending}` : `WHERE ${pending}`;
    const row = this.db
      .prepare<[SqlParams], { next: number | null }>(`SELECT MIN(t.sla_deadline) AS next FROM tickets t ${sql}`)
      .get(where.params);
    return row?.next ?? null;
  }

  countByState(filters: TicketFilters, now: number): TicketCounts {
    const where = buildWhere(filters, now);
    const row = this.db
      .prepare<[SqlParams], TicketCounts>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(${IS_OVERDUE_SQL}), 0) AS overdue,
                COALESCE(SUM(t.status = 'OPEN'), 0) AS open,
                COALESCE(SUM(t.status = 'IN_PROGRESS'), 0) AS inProgress,
                COALESCE(SUM(t.status = 'RESOLVED'), 0) AS resolved
         FROM tickets t ${where.sql}`,
      )
      .get(where.params);
    return row ?? { total: 0, overdue: 0, open: 0, inProgress: 0, resolved: 0 };
  }

  findById(id: string): TicketWithAgent | null {
    const row = this.db.prepare<[string], TicketRow>(`${SELECT_TICKET_SQL} WHERE t.id = ?`).get(id);
    return row ? toTicket(row) : null;
  }

  insert(ticket: Ticket): void {
    this.db
      .prepare<[Ticket]>(
        `INSERT INTO tickets (id, customer_name, title, description, priority, status,
                              assigned_agent_id, created_at, updated_at, sla_deadline)
         VALUES (@id, @customerName, @title, @description, @priority, @status,
                 @assignedAgentId, @createdAt, @updatedAt, @slaDeadline)`,
      )
      .run(ticket);
  }

  /** Returns false when no ticket has the given id. */
  update(id: string, changes: TicketChanges, updatedAt: number): boolean {
    const fields = (Object.keys(COLUMN_BY_FIELD) as (keyof TicketChanges)[]).filter(
      (field) => changes[field] !== undefined,
    );
    const assignments = fields.map((field) => `${COLUMN_BY_FIELD[field]} = @${field}`);
    assignments.push('updated_at = @updatedAt');

    const params: SqlParams = { id, updatedAt };
    for (const field of fields) {
      params[field] = changes[field] ?? null;
    }

    const result = this.db
      .prepare<[SqlParams]>(`UPDATE tickets SET ${assignments.join(', ')} WHERE id = @id`)
      .run(params);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    return this.db.prepare<[string]>('DELETE FROM tickets WHERE id = ?').run(id).changes > 0;
  }
}
