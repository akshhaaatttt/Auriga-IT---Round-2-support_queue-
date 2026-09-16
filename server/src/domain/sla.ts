import { SLA_RESPONSE_MS } from '../config/constants.js';
import type { Priority } from '../models/ticket.js';

export function getSlaResponseMs(priority: Priority): number {
  return SLA_RESPONSE_MS[priority];
}

export function calculateSlaDeadline(createdAt: number, priority: Priority): number {
  return createdAt + getSlaResponseMs(priority);
}
