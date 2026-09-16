import { Router } from 'express';
import type { TicketService } from '../services/ticketService.js';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from '../validation/ticketSchemas.js';
import { validate } from '../validation/validate.js';

export function createTicketRouter(service: TicketService): Router {
  const router = Router();

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
