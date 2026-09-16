import type { Ticket } from '../types/api';
import { cn } from '../utils/cn';
import { formatTicketRef } from '../utils/format';
import { PRIORITY_LABELS, STATUS_LABELS } from '../utils/labels';
import { formatRelative, formatTimestamp, getSlaStatus, isTicketOverdue } from '../utils/time';
import { Avatar } from './Avatar';
import { EscalatedBadge, PriorityBadge, StatusBadge } from './Badges';
import { SlaIndicator } from './SlaIndicator';

interface TicketRowProps {
  ticket: Ticket;
  position: number;
  now: number;
  isSelected: boolean;
  isNextUp: boolean;
  onSelect: (ticket: Ticket) => void;
}

/** Desktop column template, shared with the list header so the two always line up. */
export const ROW_GRID =
  'lg:grid-cols-[2.5rem_7.5rem_minmax(0,1fr)_10.5rem_8rem_10rem] xl:grid-cols-[2.5rem_7.5rem_minmax(0,1fr)_11.5rem_8.5rem_11rem]';

function edgeClass(ticket: Ticket, overdue: boolean): string {
  if (ticket.status === 'RESOLVED') return 'before:bg-transparent';
  if (overdue) return 'before:bg-danger';
  if (ticket.priority === 'URGENT') return 'before:bg-priority-urgent';
  return 'before:bg-transparent';
}

export function TicketRow({ ticket, position, now, isSelected, isNextUp, onSelect }: TicketRowProps) {
  const overdue = isTicketOverdue(ticket, now);
  const resolved = ticket.status === 'RESOLVED';
  const escalated = ticket.escalationCount > 0;
  const accessibleName = [
    isNextUp ? 'Next up' : `Position ${position}`,
    ticket.title,
    ticket.customerName,
    getSlaStatus(ticket, now).label,
    `${PRIORITY_LABELS[ticket.priority]} priority`,
    escalated ? 'auto-escalated' : null,
    STATUS_LABELS[ticket.status],
    ticket.assignedAgentName ? `assigned to ${ticket.assignedAgentName}` : 'unassigned',
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
        data-ticket-id={ticket.id}
        aria-current={isSelected ? 'true' : undefined}
        className={cn(
          'group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors duration-150',
          'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
          'hover:bg-surface-hover focus-visible:z-10 focus-visible:-outline-offset-2',
          'lg:min-h-15 lg:gap-y-0 lg:py-2.5',
          ROW_GRID,
          edgeClass(ticket, overdue),
          isSelected && 'bg-brand-soft/60 hover:bg-brand-soft/60',
        )}
      >
        {/* Position — desktop only */}
        <span className="hidden font-mono text-xs text-ink-subtle tabular-nums lg:block">
          {isNextUp ? <span className="rounded bg-brand px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white">Next</span> : position}
        </span>

        {/* Priority */}
        <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 lg:col-start-2">
          {isNextUp && (
            <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white lg:hidden">Next</span>
          )}
          <PriorityBadge priority={ticket.priority} variant="plain" />
          {escalated && <EscalatedBadge compact count={ticket.escalationCount} lastEscalatedAt={ticket.lastEscalatedAt} />}
        </span>

        {/* Title + customer */}
        <span className={cn('col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:col-start-3 lg:row-start-1', resolved && 'opacity-60')}>
          <span
            className={cn(
              'line-clamp-2 text-[15px] leading-snug font-semibold text-ink lg:line-clamp-1',
              resolved && 'font-medium line-through decoration-ink-subtle/60',
            )}
          >
            {ticket.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
            <span className="truncate">{ticket.customerName}</span>
            <span aria-hidden className="text-line-strong">·</span>
            <span className="shrink-0 font-mono text-xs text-ink-subtle">{formatTicketRef(ticket.id)}</span>
            <span aria-hidden className="hidden text-line-strong sm:inline">·</span>
            <span className="hidden shrink-0 text-xs text-ink-subtle sm:inline" title={`Created ${formatTimestamp(ticket.createdAt)}`}>
              {formatRelative(ticket.createdAt, now)}
            </span>
          </span>
        </span>

        {/* SLA */}
        <span className="col-start-2 row-start-1 justify-self-end lg:col-start-4 lg:justify-self-start">
          <span className="hidden lg:block">
            <SlaIndicator ticket={ticket} now={now} showDeadline={!resolved} />
          </span>
          <span className="lg:hidden">
            <SlaIndicator ticket={ticket} now={now} />
          </span>
        </span>

        {/* Status */}
        <span className="col-span-2 row-start-3 flex min-w-0 items-center gap-3 lg:contents">
          <span className="lg:col-start-5 lg:row-start-1">
            <StatusBadge status={ticket.status} />
          </span>

          {/* Assignee */}
          <span className="flex min-w-0 items-center gap-2 text-sm lg:col-start-6 lg:row-start-1">
            <Avatar name={ticket.assignedAgentName} />
            <span className={cn('truncate', ticket.assignedAgentName ? 'text-ink' : 'text-ink-subtle')}>
              {ticket.assignedAgentName ?? 'Unassigned'}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
