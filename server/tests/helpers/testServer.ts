import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import { createServices, type Services } from '../../src/container.js';
import { IN_MEMORY_DATABASE, openDatabase, type DatabaseConnection } from '../../src/db/database.js';
import { seedDatabase } from '../../src/db/seed.js';
import { NOW } from './time.js';

/** Swallows log output so test runs stay readable. */
export const silentLogger = { info: () => undefined, error: () => undefined };

export interface TestServer {
  db: DatabaseConnection;
  services: Services;
  /** Moves the server's clock; tests control time explicitly. */
  setNow(now: number): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }>;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  let now = NOW;
  const db = openDatabase(IN_MEMORY_DATABASE);
  seedDatabase(db, NOW);
  const services = createServices({ db, clock: () => now, logger: silentLogger });
  const app = createApp({ services });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = (path: string, init?: RequestInit) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });

  return {
    db,
    services,
    setNow: (value) => {
      now = value;
    },
    request,
    json: async <T>(path: string, init?: RequestInit) => {
      const response = await request(path, init);
      const text = await response.text();
      return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          db.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
