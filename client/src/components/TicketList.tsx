import type { Ticket } from '../types/api';
import { cn } from '../utils/cn';
import { isTicketOverdue } from '../utils/time';
import { ROW_GRID, TicketRow } from './TicketRow';

interface TicketListProps {
  tickets: readonly Ticket[];
  firstPosition: number;
  now: number;
  selectedId: string | null;
  onSelect: (ticket: Ticket) => void;
}

type Section = 'breached' | 'on-time' | 'resolved';

const SECTION_LABELS: Record<Section, { title: string; hint: string; tone: string }> = {
  breached: { title: 'SLA breached', hint: 'Longest overdue first', tone: 'text-danger-strong' },
  'on-time': { title: 'Within SLA', hint: 'Highest priority, then least time left', tone: 'text-ink-muted' },
  resolved: { title: 'Resolved', hint: 'No further action needed', tone: 'text-ink-subtle' },
};

const COLUMN_HEADERS = ['#', 'Priority', 'Ticket', 'SLA', 'Status', 'Assignee'];

function sectionOf(ticket: Ticket, now: number): Section {
  if (ticket.status === 'RESOLVED') return 'resolved';
  return isTicketOverdue(ticket, now) ? 'breached' : 'on-time';
}

/**
 * The server returns the queue already ordered, and its tiers are contiguous, so grouping
 * consecutive rows into labelled sections never changes the order.
 */
function groupIntoSections(tickets: readonly Ticket[], now: number) {
  const groups: { section: Section; start: number; tickets: Ticket[] }[] = [];
  tickets.forEach((ticket, index) => {
    const section = sectionOf(ticket, now);
    const current = groups[groups.length - 1];
    if (current && current.section === section) current.tickets.push(ticket);
    else groups.push({ section, start: index, tickets: [ticket] });
  });
  return groups;
}

export function TicketList({ tickets, firstPosition, now, selectedId, onSelect }: TicketListProps) {
  const groups = groupIntoSections(tickets, now);

  return (
    <div>
      <div
        aria-hidden
        className={cn(
          'sticky top-14 z-10 hidden border-y border-line bg-surface-muted/95 px-4 py-2 backdrop-blur-sm lg:grid lg:gap-x-4',
          ROW_GRID,
        )}
      >
        {COLUMN_HEADERS.map((header) => (
          <span key={header} className="eyebrow">
            {header}
          </span>
        ))}
      </div>

      {groups.map(({ section, start, tickets: sectionTickets }) => {
        const { title, hint, tone } = SECTION_LABELS[section];
        const headingId = `queue-section-${section}-${start}`;
        return (
          <section key={headingId} aria-labelledby={headingId}>
            <div className="flex items-baseline gap-2 border-b border-line bg-surface px-4 pt-4 pb-2">
              <h3 id={headingId} className={cn('text-xs font-semibold tracking-wide uppercase', tone)}>
                {title}
              </h3>
              <span className="text-xs text-ink-subtle">{hint}</span>
            </div>
            <ol start={firstPosition + start} className="divide-y divide-line" aria-label={`${title} tickets`}>
              {sectionTickets.map((ticket, index) => {
                const position = firstPosition + start + index;
                return (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    position={position}
                    isNextUp={position === 1 && section !== 'resolved'}
                    now={now}
                    isSelected={ticket.id === selectedId}
                    onSelect={onSelect}
                  />
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function TicketListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="divide-y divide-line border-t border-line">
      <span className="sr-only">Loading tickets…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className={cn('grid animate-pulse items-center gap-x-4 px-4 py-3.5', 'grid-cols-[minmax(0,1fr)_auto]', ROW_GRID)}>
          <div className="hidden h-3 w-5 rounded bg-surface-muted lg:block" />
          <div className="h-3.5 w-16 rounded bg-surface-muted" />
          <div className="col-span-2 space-y-2 lg:col-span-1">
            <div className="h-3.5 w-3/4 rounded bg-line" />
            <div className="h-3 w-1/3 rounded bg-surface-muted" />
          </div>
          <div className="hidden h-3.5 w-24 rounded bg-line lg:block" />
          <div className="hidden h-5 w-20 rounded bg-surface-muted lg:block" />
          <div className="hidden items-center gap-2 lg:flex">
            <div className="size-6 rounded-full bg-surface-muted" />
            <div className="h-3 w-20 rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
