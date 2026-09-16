import { Search, X } from 'lucide-react';
import type { TicketStatus } from '../types/api';
import { TICKET_STATUSES } from '../types/api';
import { cn } from '../utils/cn';
import { STATUS_LABELS } from '../utils/labels';

export const QUEUE_VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'mine', label: 'Assigned to me' },
  { id: 'unassigned', label: 'Unassigned' },
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number]['id'];

export type StatusFilter = 'ACTIVE' | 'ANY' | TicketStatus;

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Active (open + in progress)' },
  { value: 'ANY', label: 'All statuses' },
  ...TICKET_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

interface QueueToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  view: QueueView;
  onViewChange: (view: QueueView) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  overdueCount: number | null;
  hasCurrentAgent: boolean;
}

export function QueueToolbar({
  search,
  onSearchChange,
  view,
  onViewChange,
  statusFilter,
  onStatusFilterChange,
  overdueCount,
  hasCurrentAgent,
}: QueueToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center">
      <div className="relative xl:w-80">
        <label htmlFor="ticket-search" className="sr-only">
          Search by customer or ticket title
        </label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id="ticket-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search customer or ticket title…"
          maxLength={100}
          autoComplete="off"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-2 focus:outline-slate-900/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <div role="group" aria-label="Queue view" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {QUEUE_VIEWS.map(({ id, label }) => {
          const disabled = id === 'mine' && !hasCurrentAgent;
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onViewChange(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {label}
              {id === 'overdue' && overdueCount !== null && overdueCount > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white tabular-nums">
                  {overdueCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-600 xl:ml-auto">
        <label htmlFor="status-filter" className="whitespace-nowrap">
          Status
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
          className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm text-slate-900 sm:w-auto"
        >
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
