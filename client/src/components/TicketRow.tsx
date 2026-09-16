import { UserRound } from 'lucide-react';
import type { Ticket } from '../types/api';
import { cn } from '../utils/cn';
import { PRIORITY_LABELS, STATUS_LABELS } from '../utils/labels';
import { formatRelative, formatTimestamp, getSlaStatus, isTicketOverdue } from '../utils/time';
import { OverdueBadge, PriorityBadge, StatusBadge } from './Badges';
import { SlaIndicator } from './SlaIndicator';

interface TicketRowProps {
  ticket: Ticket;
  position: number;
  now: number;
  isSelected: boolean;
  onSelect: (ticket: Ticket) => void;
}

function accentClass(ticket: Ticket, overdue: boolean): string {
  if (ticket.status === 'RESOLVED') return 'border-l-slate-200';
  if (overdue) return 'border-l-red-600';
  if (ticket.priority === 'URGENT') return 'border-l-orange-500';
  if (ticket.priority === 'NORMAL') return 'border-l-sky-400';
  return 'border-l-slate-300';
}

export function TicketRow({ ticket, position, now, isSelected, onSelect }: TicketRowProps) {
  const overdue = isTicketOverdue(ticket, now);
  const resolved = ticket.status === 'RESOLVED';
  const accessibleName = [
    `Queue position ${position}`,
    overdue ? 'Overdue' : null,
    `${PRIORITY_LABELS[ticket.priority]} priority`,
    ticket.title,
    ticket.customerName,
    STATUS_LABELS[ticket.status],
    resolved ? null : getSlaStatus(ticket, now).label,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(ticket)}
        aria-label={accessibleName}
        aria-haspopup="dialog"
        className={cn(
          'grid w-full grid-cols-[2.25rem_1fr] gap-x-3 gap-y-2 border-l-4 px-4 py-3 text-left transition-colors',
          'lg:grid-cols-[2.25rem_minmax(0,1fr)_8.5rem_9.5rem_10.5rem_8.5rem] lg:items-center',
          'hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900',
          accentClass(ticket, overdue),
          overdue && 'bg-red-50/60 hover:bg-red-50',
          resolved && 'opacity-60',
          isSelected && 'bg-slate-100 hover:bg-slate-100',
        )}
      >
        <span className="row-span-2 pt-0.5 text-sm font-medium text-slate-400 tabular-nums lg:row-span-1 lg:pt-0">
          {position}
        </span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            {overdue && <OverdueBadge />}
            <PriorityBadge priority={ticket.priority} />
          </span>
          <span className={cn('mt-1 block truncate font-semibold text-slate-900', resolved && 'line-through decoration-slate-400')}>
            {ticket.title}
          </span>
          <span className="block truncate text-sm text-slate-600">{ticket.customerName}</span>
        </span>

        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
          <span className="lg:justify-self-start">
            <StatusBadge status={ticket.status} />
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
            <UserRound aria-hidden className="size-4 shrink-0 text-slate-400" />
            <span className={cn('truncate', !ticket.assignedAgentName && 'italic text-slate-500')}>
              {ticket.assignedAgentName ?? 'Unassigned'}
            </span>
          </span>
          <SlaIndicator ticket={ticket} now={now} />
          <span
            className="text-xs whitespace-nowrap text-slate-500 lg:text-right"
            title={`Created ${formatTimestamp(ticket.createdAt)}`}
          >
            <span className="lg:hidden">Created </span>
            {formatRelative(ticket.createdAt, now)}
          </span>
        </span>
      </button>
    </li>
  );
}
