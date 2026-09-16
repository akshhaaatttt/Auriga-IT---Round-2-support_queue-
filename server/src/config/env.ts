import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ESCALATION_INTERVAL_MS, MIN_ESCALATION_INTERVAL_MS } from './constants.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PORT = 3001;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  return port;
}

function parseInterval(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_ESCALATION_INTERVAL_MS;
  const interval = Number(raw);
  if (!Number.isInteger(interval) || interval < MIN_ESCALATION_INTERVAL_MS) {
    throw new Error(`Invalid ESCALATION_INTERVAL_MS value: ${raw} (minimum ${MIN_ESCALATION_INTERVAL_MS})`);
  }
  return interval;
}

function parseFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid boolean value: ${raw} (expected "true" or "false")`);
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const env = {
  port: parsePort(process.env.PORT),
  databasePath: path.resolve(SERVER_ROOT, process.env.DATABASE_PATH ?? 'data/support_queue.db'),
  corsOrigins: parseList(process.env.CORS_ORIGINS),
  clientDistPath: path.resolve(SERVER_ROOT, '../client/dist'),
  escalation: {
    enabled: parseFlag(process.env.ESCALATION_ENABLED, true),
    intervalMs: parseInterval(process.env.ESCALATION_INTERVAL_MS),
  },
} as const;
