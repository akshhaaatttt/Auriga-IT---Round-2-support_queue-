import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export type DatabaseConnection = Database.Database;

export const IN_MEMORY_DATABASE = ':memory:';

export function openDatabase(filePath: string): DatabaseConnection {
  if (filePath !== IN_MEMORY_DATABASE) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const applied = runMigrations(db);
  if (applied.length > 0 && filePath !== IN_MEMORY_DATABASE) {
    console.log(`[db] Applied schema migration(s): ${applied.join(', ')}`);
  }
  return db;
}
