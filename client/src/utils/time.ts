import { format, formatDistanceStrict } from 'date-fns';
import type { Ticket } from '../types/api';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Tickets due within this window get a "due soon" warning treatment. */
export const DUE_SOON_THRESHOLD_MS = 30 * MS_PER_MINUTE;

/** Compact, non-negative duration: "45m", "2h 14m", "3d 4h". Sub-minute durations show "<1m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.abs(ms) / MS_PER_MINUTE);
  if (totalMinutes < 1) return '<1m';

  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  if (totalHours === 0) return `${minutes}m`;

  const hours = totalHours % HOURS_PER_DAY;
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  if (days === 0) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

export type SlaState = 'overdue' | 'due-soon' | 'on-track' | 'resolved';

export interface SlaStatus {
  state: SlaState;
  label: string;
}

/** Mirrors the server rule: overdue only when strictly past the deadline and unresolved. */
export function isTicketOverdue(ticket: Pick<Ticket, 'status' | 'slaDeadline'>, now: number): boolean {
  return ticket.status !== 'RESOLVED' && now > Date.parse(ticket.slaDeadline);
}

export function getSlaStatus(ticket: Pick<Ticket, 'status' | 'slaDeadline'>, now: number): SlaStatus {
  const remaining = Date.parse(ticket.slaDeadline) - now;
  if (ticket.status === 'RESOLVED') return { state: 'resolved', label: 'Resolved' };
  if (isTicketOverdue(ticket, now)) return { state: 'overdue', label: `Overdue by ${formatDuration(remaining)}` };
  const label = `Due in ${formatDuration(remaining)}`;
  return { state: remaining <= DUE_SOON_THRESHOLD_MS ? 'due-soon' : 'on-track', label };
}

export function formatTimestamp(iso: string): string {
  return format(new Date(iso), 'MMM d, HH:mm');
}

export function formatRelative(iso: string, now: number): string {
  return formatDistanceStrict(new Date(iso), new Date(now), { addSuffix: true, roundingMethod: 'floor' });
}
