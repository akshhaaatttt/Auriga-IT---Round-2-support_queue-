import type { Priority } from '../models/ticket.js';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * SLA response windows, measured from ticket creation.
 * LOW deliberately shares NORMAL's 24h window: the brief only defines URGENT and NORMAL,
 * and a longer LOW window would let low tickets silently age for days (see REASONING.md).
 */
export const SLA_RESPONSE_MS: Readonly<Record<Priority, number>> = {
  URGENT: 2 * MS_PER_HOUR,
  NORMAL: 24 * MS_PER_HOUR,
  LOW: 24 * MS_PER_HOUR,
};

/** Higher rank = more important. Mirrored by the SQL CASE expression in ticketRepository. */
export const PRIORITY_RANK: Readonly<Record<Priority, number>> = {
  URGENT: 3,
  NORMAL: 2,
  LOW: 1,
};

export const PAGINATION = {
  defaultPage: 1,
  defaultLimit: 20,
  maxLimit: 100,
} as const;

export const TEXT_LIMITS = {
  customerName: 120,
  title: 200,
  description: 5000,
  search: 100,
} as const;
