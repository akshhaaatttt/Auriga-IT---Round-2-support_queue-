import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { DatabaseConnection } from './db/database.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { AgentRepository } from './repositories/agentRepository.js';
import { TicketRepository } from './repositories/ticketRepository.js';
import { createAgentRouter } from './routes/agentRoutes.js';
import { createTicketRouter } from './routes/ticketRoutes.js';
import { AgentService } from './services/agentService.js';
import { TicketService, type Clock } from './services/ticketService.js';

export interface AppOptions {
  db: DatabaseConnection;
  clock?: Clock;
  corsOrigins?: readonly string[];
  /** When set and present on disk, the built client is served from this directory. */
  clientDistPath?: string;
}

const JSON_BODY_LIMIT = '100kb';

function serveClient(app: Express, clientDistPath: string): void {
  const indexHtml = path.join(clientDistPath, 'index.html');
  if (!fs.existsSync(indexHtml)) return;
  app.use(express.static(clientDistPath, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(indexHtml);
  });
}

export function createApp({ db, clock = Date.now, corsOrigins = [], clientDistPath }: AppOptions): Express {
  const agentRepository = new AgentRepository(db);
  const ticketService = new TicketService(new TicketRepository(db), agentRepository, clock);
  const agentService = new AgentService(agentRepository);

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(corsMiddleware(corsOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/tickets', createTicketRouter(ticketService));
  app.use('/api/agents', createAgentRouter(agentService));
  app.use('/api', notFoundHandler);

  if (clientDistPath) serveClient(app, clientDistPath);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
