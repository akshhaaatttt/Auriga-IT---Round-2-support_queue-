import type { Ticket } from '../types/api';
import { TicketRow } from './TicketRow';

interface TicketListProps {
  tickets: readonly Ticket[];
  firstPosition: number;
  now: number;
  selectedId: string | null;
  onSelect: (ticket: Ticket) => void;
}

const COLUMN_HEADERS = ['#', 'Ticket', 'Status', 'Assignee', 'SLA', 'Created'];

export function TicketList({ tickets, firstPosition, now, selectedId, onSelect }: TicketListProps) {
  return (
    <div>
      <div
        aria-hidden
        className="hidden grid-cols-[2.25rem_minmax(0,1fr)_8.5rem_9.5rem_10.5rem_8.5rem] gap-x-3 border-b border-slate-200 bg-slate-50 px-4 py-2 pl-5 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid"
      >
        {COLUMN_HEADERS.map((header) => (
          <span key={header} className={header === 'Created' ? 'text-right' : undefined}>
            {header}
          </span>
        ))}
      </div>
      <ol className="divide-y divide-slate-200" aria-label="Tickets in priority order">
        {tickets.map((ticket, index) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            position={firstPosition + index}
            now={now}
            isSelected={ticket.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </div>
  );
}

export function TicketListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="divide-y divide-slate-200">
      <span className="sr-only">Loading tickets…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 px-4 py-4">
          <div className="h-4 w-5 rounded bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="h-3 w-1/3 rounded bg-slate-100" />
          </div>
          <div className="hidden h-4 w-24 rounded bg-slate-200 sm:block" />
          <div className="hidden h-4 w-28 rounded bg-slate-200 md:block" />
        </div>
      ))}
    </div>
  );
}
