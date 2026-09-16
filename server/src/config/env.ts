import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
} as const;
