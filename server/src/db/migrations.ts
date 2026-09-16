import type { DatabaseConnection } from './database.js';

/**
 * Versioned schema migrations, tracked with SQLite's `PRAGMA user_version`.
 *
 * Migrations are frozen history: their SQL is written out literally (never derived from the
 * current domain constants) so that a database created by an older release is upgraded
 * exactly the same way on every machine. Add new migrations to the end; never edit old ones.
 *
 * Timestamps are INTEGER epoch milliseconds: exact, cheap to compare and index, and
 * identical to the values the TypeScript comparator works with.
 */
export interface Migration {
  version: number;
  description: string;
  sql: string;
}

const TICKET_INDEXES_SQL = `
-- Queue scans: "unresolved and past deadline" and the overdue tier ordering.
CREATE INDEX IF NOT EXISTS idx_tickets_status_deadline ON tickets (status, sla_deadline);
-- Overdue filter/count and the escalation candidate scan (sla_deadline < now).
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline    ON tickets (sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON tickets (assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at      ON tickets (created_at);
-- NOCASE indexes serve case-insensitive prefix lookups and equality on these columns.
CREATE INDEX IF NOT EXISTS idx_tickets_customer_name   ON tickets (customer_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_tickets_title           ON tickets (title COLLATE NOCASE);
`;

/**
 * Version 1 is the original schema. It uses IF NOT EXISTS because databases created before
 * versioning was introduced already contain these tables while reporting user_version = 0.
 */
export const INITIAL_SCHEMA_SQL = `
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
  priority          TEXT NOT NULL CHECK (priority IN ('URGENT', 'NORMAL', 'LOW')),
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  sla_deadline      INTEGER NOT NULL,
  CHECK (sla_deadline >= created_at)
);
${TICKET_INDEXES_SQL}`;

/**
 * Version 2 adds the HIGH priority and escalation audit columns. SQLite cannot alter a CHECK
 * constraint in place, so the table is rebuilt and every existing row is copied across.
 * No other table references `tickets`, so dropping the old table is safe with foreign keys on.
 */
const ADD_HIGH_PRIORITY_AND_ESCALATION_SQL = `
CREATE TABLE tickets_v2 (
  id                TEXT PRIMARY KEY,
  customer_name     TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  priority          TEXT NOT NULL CHECK (priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW')),
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  sla_deadline      INTEGER NOT NULL,
  escalation_count  INTEGER NOT NULL DEFAULT 0 CHECK (escalation_count >= 0),
  last_escalated_at INTEGER,
  CHECK (sla_deadline >= created_at)
);

INSERT INTO tickets_v2 (id, customer_name, title, description, priority, status,
                        assigned_agent_id, created_at, updated_at, sla_deadline)
SELECT id, customer_name, title, description, priority, status,
       assigned_agent_id, created_at, updated_at, sla_deadline
FROM tickets;

DROP TABLE tickets;
ALTER TABLE tickets_v2 RENAME TO tickets;
${TICKET_INDEXES_SQL}`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'initial schema', sql: INITIAL_SCHEMA_SQL },
  {
    version: 2,
    description: 'add HIGH priority and escalation audit columns',
    sql: ADD_HIGH_PRIORITY_AND_ESCALATION_SQL,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

function getSchemaVersion(db: DatabaseConnection): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Applies pending migrations in order, each atomically. Returns the versions applied. */
export function runMigrations(db: DatabaseConnection): number[] {
  const current = getSchemaVersion(db);
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this application supports (${LATEST_SCHEMA_VERSION}).`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > current);
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql);
      // PRAGMA arguments cannot be bound; the version is a trusted integer constant.
      db.pragma(`user_version = ${migration.version}`);
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(`Migration ${migration.version} left ${violations.length} foreign key violation(s).`);
      }
    })();
  }
  return pending.map((migration) => migration.version);
}
