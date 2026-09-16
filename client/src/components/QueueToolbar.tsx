import { Search, X } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import type { TicketStatus } from '../types/api';

export const QUEUE_VIEWS = [
  { id: 'all', label: 'All tickets' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'mine', label: 'Assigned to me' },
  { id: 'unassigned', label: 'Unassigned' },
] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number]['id'];

export type StatusFilter = 'ACTIVE' | 'ANY' | TicketStatus;

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'ANY', label: 'All' },
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** "/" focuses search from anywhere on the page, unless the user is typing or a dialog is open. */
function useSlashToFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref]);
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
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);

  return (
    <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center">
      <div className="relative w-full xl:max-w-sm">
        <label htmlFor="ticket-search" className="sr-only">
          Search tickets by customer or title
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          ref={searchRef}
          id="ticket-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.preventDefault();
              onSearchChange('');
            }
          }}
          placeholder="Search customers or ticket titles"
          maxLength={100}
          autoComplete="off"
          spellCheck={false}
          aria-keyshortcuts="/"
          className="control pr-16 pl-9 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
          {search ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                searchRef.current?.focus();
              }}
              aria-label="Clear search text"
              className="btn btn-ghost h-7 w-7 px-0"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <kbd className="kbd" aria-hidden>
              /
            </kbd>
          )}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:ml-auto">
        <div role="group" aria-label="Queue view" className="segmented">
          {QUEUE_VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              disabled={id === 'mine' && !hasCurrentAgent}
              onClick={() => onViewChange(id)}
              className="segment"
            >
              {label}
              {id === 'overdue' && overdueCount !== null && overdueCount > 0 && (
                <span className="rounded-full bg-danger px-1.5 font-mono text-[11px] leading-4.5 font-semibold text-white tabular-nums">
                  {overdueCount}
                  <span className="sr-only"> overdue</span>
                </span>
              )}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Status" className="segmented">
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={statusFilter === value}
              onClick={() => onStatusFilterChange(value)}
              className="segment px-2.5"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
