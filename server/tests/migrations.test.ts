import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { INITIAL_SCHEMA_SQL, LATEST_SCHEMA_VERSION } from '../src/db/migrations.js';
import { TicketRepository } from '../src/repositories/ticketRepository.js';
import { makeTicketRecord } from './helpers/ticketRecords.js';
import { HOUR, NOW } from './helpers/time.js';

let directory: string;
let databasePath: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'support-queue-migrations-'));
  databasePath = path.join(directory, 'legacy.db');
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Recreates a database exactly as the pre-escalation release left it (user_version 0). */
function createLegacyDatabase(): void {
  const legacy = new Database(databasePath);
  legacy.exec(INITIAL_SCHEMA_SQL);
  legacy
    .prepare(
      `INSERT INTO tickets (id, customer_name, title, description, priority, status,
                            assigned_agent_id, created_at, updated_at, sla_deadline)
       VALUES ('legacy-1', 'Acme', 'Old ticket', 'kept', 'NORMAL', 'OPEN', NULL, ?, ?, ?)`,
    )
    .run(NOW - 30 * HOUR, NOW - 29 * HOUR, NOW - 6 * HOUR);
  expect(() =>
    legacy
      .prepare(
        `INSERT INTO tickets (id, customer_name, title, priority, status, created_at, updated_at, sla_deadline)
         VALUES ('x', 'c', 't', 'HIGH', 'OPEN', 0, 0, 0)`,
      )
      .run(),
  ).toThrow(/CHECK constraint/);
  legacy.close();
}

describe('schema migrations', () => {
  it('upgrades a pre-escalation database without losing data', () => {
    createLegacyDatabase();

    const db = openDatabase(databasePath);
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
      const ticket = new TicketRepository(db).findById('legacy-1');
      expect(ticket).toMatchObject({
        customerName: 'Acme',
        description: 'kept',
        priority: 'NORMAL',
        createdAt: NOW - 30 * HOUR,
        updatedAt: NOW - 29 * HOUR,
        slaDeadline: NOW - 6 * HOUR,
        escalationCount: 0,
        lastEscalatedAt: null,
      });
    } finally {
      db.close();
    }
  });

  it('accepts HIGH priority and keeps every index after the upgrade', () => {
    createLegacyDatabase();

    const db = openDatabase(databasePath);
    try {
      new TicketRepository(db).insert(makeTicketRecord({ id: 'high', priority: 'HIGH' }));
      const indexes = db
        .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tickets' AND name LIKE 'idx_%' ORDER BY name`)
        .all()
        .map((row) => row.name);
      expect(indexes).toEqual([
        'idx_tickets_assigned_status',
        'idx_tickets_created_at',
        'idx_tickets_customer_name',
        'idx_tickets_sla_deadline',
        'idx_tickets_status_deadline',
        'idx_tickets_title',
      ]);
    } finally {
      db.close();
    }
  });

  it('is idempotent across restarts', () => {
    openDatabase(databasePath).close();
    const db = openDatabase(databasePath);
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('still rejects unknown priorities', () => {
    const db = openDatabase(databasePath);
    try {
      expect(() =>
        new TicketRepository(db).insert({ ...makeTicketRecord({ id: 'bad' }), priority: 'CRITICAL' as never }),
      ).toThrow(/CHECK constraint/);
    } finally {
      db.close();
    }
  });

  it('refuses to open a database created by a newer version', () => {
    const newer = new Database(databasePath);
    newer.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    newer.close();

    expect(() => openDatabase(databasePath)).toThrow(/newer than this application supports/);
  });
});
