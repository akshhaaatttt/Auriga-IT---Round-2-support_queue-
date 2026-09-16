import { Router } from 'express';
import type { EscalationService } from '../escalation/escalationService.js';
import type { EscalationRunResultDto } from '../escalation/escalationTypes.js';
import type { Clock } from '../models/clock.js';
import { toIso, type TicketService } from '../services/ticketService.js';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from '../validation/ticketSchemas.js';
import { validate } from '../validation/validate.js';

export function createTicketRouter(service: TicketService, escalation: EscalationService, clock: Clock): Router {
  const router = Router();

  // Manual trigger for demos and operations. Runs the exact same service as the scheduler.
  router.post('/escalation/run', (_req, res) => {
    const result = escalation.run(clock());
    const body: EscalationRunResultDto = { ...result, ranAt: toIso(result.ranAt) };
    res.json(body);
  });

  router.get('/', (req, res) => {
    res.json(service.listQueue(validate(listTicketsQuerySchema, req.query)));
  });

  router.get('/summary', (_req, res) => {
    res.json(service.getSummary());
  });

  router.post('/', (req, res) => {
    const ticket = service.createTicket(validate(createTicketSchema, req.body));
    res.status(201).location(`${req.baseUrl}/${ticket.id}`).json(ticket);
  });

  router.get('/:id', (req, res) => {
    const { id } = validate(ticketIdParamsSchema, req.params);
    res.json(service.getTicket(id));
  });

  router.patch('/:id', (req, res) => {
    const { id } = validate(ticketIdParamsSchema, req.params);
    res.json(service.updateTicket(id, validate(updateTicketSchema, req.body)));
  });

  router.delete('/:id', (req, res) => {
    const { id } = validate(ticketIdParamsSchema, req.params);
    service.deleteTicket(id);
    res.status(204).end();
  });

  return router;
}
