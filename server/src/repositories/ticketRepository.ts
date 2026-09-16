import { DUE_SOON_WINDOW_MS } from '../config/constants.js';
import type { DatabaseConnection } from '../db/database.js';
import type { Priority, QueueTicket, Ticket, TicketStatus } from '../models/ticket.js';
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
  /** Unresolved tickets (open + in progress). */
  active: number;
  overdue: number;
  /** Unresolved URGENT tickets. */
  urgent: number;
  /** Unresolved tickets not yet overdue whose deadline is within DUE_SOON_WINDOW_MS. */
  dueSoon: number;
  open: number;
  inProgress: number;
  resolved: number;
}

/** The fields the escalation service needs to decide on, and guard, a priority change. */
export type EscalationCandidate = Pick<QueueTicket, 'id' | 'priority' | 'status' | 'slaDeadline'>;

export interface PriorityEscalation {
  id: string;
  from: Priority;
  to: Priority;
  at: number;
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
  escalation_count: number;
  last_escalated_at: number | null;
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
         t.created_at, t.updated_at, t.sla_deadline, t.escalation_count, t.last_escalated_at
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
    escalationCount: row.escalation_count,
    lastEscalatedAt: row.last_escalated_at,
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
                COALESCE(SUM(t.status <> 'RESOLVED'), 0) AS active,
                COALESCE(SUM(${IS_OVERDUE_SQL}), 0) AS overdue,
                COALESCE(SUM(t.status <> 'RESOLVED' AND t.priority = 'URGENT'), 0) AS urgent,
                COALESCE(SUM(t.status <> 'RESOLVED' AND t.sla_deadline >= @now
                             AND t.sla_deadline <= @now + @dueSoonWindow), 0) AS dueSoon,
                COALESCE(SUM(t.status = 'OPEN'), 0) AS open,
                COALESCE(SUM(t.status = 'IN_PROGRESS'), 0) AS inProgress,
                COALESCE(SUM(t.status = 'RESOLVED'), 0) AS resolved
         FROM tickets t ${where.sql}`,
      )
      .get({ ...where.params, dueSoonWindow: DUE_SOON_WINDOW_MS });
    return row ?? { total: 0, active: 0, overdue: 0, urgent: 0, dueSoon: 0, open: 0, inProgress: 0, resolved: 0 };
  }

  findById(id: string): TicketWithAgent | null {
    const row = this.db.prepare<[string], TicketRow>(`${SELECT_TICKET_SQL} WHERE t.id = ?`).get(id);
    return row ? toTicket(row) : null;
  }

  insert(ticket: Ticket): void {
    this.db
      .prepare<[Ticket]>(
        `INSERT INTO tickets (id, customer_name, title, description, priority, status,
                              assigned_agent_id, created_at, updated_at, sla_deadline,
                              escalation_count, last_escalated_at)
         VALUES (@id, @customerName, @title, @description, @priority, @status,
                 @assignedAgentId, @createdAt, @updatedAt, @slaDeadline,
                 @escalationCount, @lastEscalatedAt)`,
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

  /**
   * Unresolved, overdue tickets whose priority is not already `topPriority`. Filtering happens
   * in SQL (served by the sla_deadline index), so only escalatable rows are loaded.
   */
  findEscalationCandidates(now: number, topPriority: Priority): EscalationCandidate[] {
    return this.db
      .prepare<[SqlParams], { id: string; priority: Priority; status: TicketStatus; sla_deadline: number }>(
        `SELECT t.id, t.priority, t.status, t.sla_deadline
         FROM tickets t
         WHERE ${IS_OVERDUE_SQL} AND t.priority <> @topPriority
         ORDER BY t.sla_deadline ASC, t.id ASC`,
      )
      .all({ now, topPriority })
      .map((row) => ({ id: row.id, priority: row.priority, status: row.status, slaDeadline: row.sla_deadline }));
  }

  /**
   * Compare-and-set priority change. It only applies if the ticket still has the priority the
   * caller read (`from`) and is still unresolved and overdue at `at`, so a stale read can never
   * move a ticket more than one level. Returns false when the guard did not match.
   */
  applyEscalation({ id, from, to, at }: PriorityEscalation): boolean {
    const result = this.db
      .prepare<[SqlParams]>(
        `UPDATE tickets AS t
         SET priority = @to,
             updated_at = @now,
             last_escalated_at = @now,
             escalation_count = t.escalation_count + 1
         WHERE t.id = @id AND t.priority = @from AND ${IS_OVERDUE_SQL}`,
      )
      .run({ id, from, to, now: at });
    return result.changes > 0;
  }

  /** Runs `work` in a write transaction taken up-front, serialising it against other writers. */
  runExclusive<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  delete(id: string): boolean {
    return this.db.prepare<[string]>('DELETE FROM tickets WHERE id = ?').run(id).changes > 0;
  }
}
