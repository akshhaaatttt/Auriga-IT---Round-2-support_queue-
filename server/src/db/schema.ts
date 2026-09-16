import { PRIORITIES, TICKET_STATUSES } from '../models/ticket.js';

const sqlList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

/**
 * Timestamps are INTEGER epoch milliseconds: exact, cheap to compare and index, and
 * identical to the values the TypeScript comparator works with.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agents (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tickets (
  id                TEXT PRIMARY KEY,
  customer_name     TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL CHECK (priority IN (${sqlList(PRIORITIES)})),
  status            TEXT NOT NULL CHECK (status IN (${sqlList(TICKET_STATUSES)})),
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  sla_deadline      INTEGER NOT NULL,
  CHECK (sla_deadline >= created_at)
);

-- Queue scans: "unresolved and past deadline" and the overdue tier ordering.
CREATE INDEX IF NOT EXISTS idx_tickets_status_deadline ON tickets (status, sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline    ON tickets (sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON tickets (assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at      ON tickets (created_at);
-- NOCASE indexes serve case-insensitive prefix lookups and equality on these columns.
CREATE INDEX IF NOT EXISTS idx_tickets_customer_name   ON tickets (customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_tickets_title           ON tickets (title COLLATE NOCASE);
`;
