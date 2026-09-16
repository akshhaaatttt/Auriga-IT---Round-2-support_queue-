import { Router } from 'express';
import type { AgentService } from '../services/agentService.js';

export function createAgentRouter(service: AgentService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ agents: service.listAgents() });
  });

  return router;
}
