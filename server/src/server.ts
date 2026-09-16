import { createApp } from './app.js';
import { env } from './config/env.js';
import { createServices } from './container.js';
import { openDatabase } from './db/database.js';
import { seedIfEmpty } from './db/seed.js';
import { EscalationScheduler } from './escalation/escalationScheduler.js';

const db = openDatabase(env.databasePath);
if (seedIfEmpty(db)) {
  console.log('[db] Empty database detected; loaded demo seed data.');
}

const services = createServices({ db });
const app = createApp({
  services,
  corsOrigins: env.corsOrigins,
  clientDistPath: env.clientDistPath,
});
const scheduler = new EscalationScheduler(services.escalation, { intervalMs: env.escalation.intervalMs });

const server = app.listen(env.port, () => {
  console.log(`[server] Support Queue API listening on http://localhost:${env.port}`);
  console.log(`[server] Database: ${env.databasePath}`);
  if (env.escalation.enabled) {
    scheduler.start();
  } else {
    console.log('[Escalation] Scheduler disabled (ESCALATION_ENABLED=false)');
  }
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down.`);
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
