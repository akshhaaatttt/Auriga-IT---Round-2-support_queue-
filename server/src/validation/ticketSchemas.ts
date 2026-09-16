import { z } from 'zod';
import { PAGINATION, TEXT_LIMITS } from '../config/constants.js';
import { PRIORITIES, TICKET_STATUSES, type TicketStatus } from '../models/ticket.js';

const requiredText = (label: string, max: number) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const description = z
  .string()
  .trim()
  .max(TEXT_LIMITS.description, `Description must be at most ${TEXT_LIMITS.description} characters`);

const identifier = z.string().trim().min(1).max(64);

const priority = z.enum(PRIORITIES, { error: `Priority must be one of ${PRIORITIES.join(', ')}` });
const status = z.enum(TICKET_STATUSES, { error: `Status must be one of ${TICKET_STATUSES.join(', ')}` });

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const statusList = z
  .string()
  .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
  .pipe(z.array(status).max(TICKET_STATUSES.length))
  .transform((values): TicketStatus[] => [...new Set(values)]);

export const ticketIdParamsSchema = z.object({ id: identifier });

export const listTicketsQuerySchema = z.object({
  search: z.string().trim().max(TEXT_LIMITS.search).optional(),
  overdue: booleanFlag.optional(),
  assignedTo: identifier.optional(),
  status: statusList.optional(),
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});

export const createTicketSchema = z.strictObject({
  customerName: requiredText('Customer name', TEXT_LIMITS.customerName),
  title: requiredText('Title', TEXT_LIMITS.title),
  description: description.default(''),
  priority,
  status: status.default('OPEN'),
  assignedAgentId: identifier.nullable().default(null),
});

export const updateTicketSchema = z
  .strictObject({
    customerName: requiredText('Customer name', TEXT_LIMITS.customerName),
    title: requiredText('Title', TEXT_LIMITS.title),
    description,
    priority,
    status,
    assignedAgentId: identifier.nullable(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Provide at least one field to update' });

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
