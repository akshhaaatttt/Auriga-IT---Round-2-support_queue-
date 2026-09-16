import type { Priority, TicketStatus } from '../types/api';

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  URGENT: 'Urgent',
  NORMAL: 'Normal',
  LOW: 'Low',
};

export const STATUS_LABELS: Readonly<Record<TicketStatus, string>> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export const SLA_POLICY_LABELS: Readonly<Record<Priority, string>> = {
  URGENT: '2h response',
  NORMAL: '24h response',
  LOW: '24h response',
};
