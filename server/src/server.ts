import { createApp } from './app.js';
import { env } from './config/env.js';
import { openDatabase } from './db/database.js';
import { seedIfEmpty } from './db/seed.js';

const db = openDatabase(env.databasePath);
if (seedIfEmpty(db)) {
  console.log('[db] Empty database detected; loaded demo seed data.');
}

const app = createApp({
  db,
  corsOrigins: env.corsOrigins,
  clientDistPath: env.clientDistPath,
});

const server = app.listen(env.port, () => {
  console.log(`[server] Support Queue API listening on http://localhost:${env.port}`);
  console.log(`[server] Database: ${env.databasePath}`);
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
