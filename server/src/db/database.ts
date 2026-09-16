import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';

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
  db.exec(SCHEMA_SQL);
  return db;
}
