import { env } from '../config/env.js';
import { openDatabase } from './database.js';
import { seedDatabase } from './seed.js';
import { SEED_AGENTS, SEED_TICKETS } from './seedData.js';

const db = openDatabase(env.databasePath);
try {
  seedDatabase(db);
  console.log(`[seed] Reset ${env.databasePath}: ${SEED_AGENTS.length} agents, ${SEED_TICKETS.length} tickets.`);
} finally {
  db.close();
}
