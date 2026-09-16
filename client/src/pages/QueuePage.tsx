import { Inbox, Loader2, RotateCw, SearchX, ShieldCheck } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { CreateTicketDialog } from '../components/CreateTicketDialog';
import { Pagination } from '../components/Pagination';
import { QueueToolbar, type QueueView, type StatusFilter } from '../components/QueueToolbar';
import { EmptyState, ErrorState } from '../components/StateMessages';
import { SummaryCards } from '../components/SummaryCards';
import { TicketDrawer } from '../components/TicketDrawer';
import { TicketList, TicketListSkeleton } from '../components/TicketList';
import { ToastRegion } from '../components/ToastRegion';
import { useAgents } from '../hooks/useAgents';
import { useCurrentAgent } from '../hooks/useCurrentAgent';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useServerClock } from '../hooks/useServerClock';
import { useTicketQueue } from '../hooks/useTicketQueue';
import { useToasts } from '../hooks/useToasts';
import { describeError } from '../services/apiClient';
import { ticketApi } from '../services/ticketApi';
import type { Ticket, TicketInput, TicketQuery, TicketStatus, TicketUpdate } from '../types/api';
import { cn } from '../utils/cn';
import { formatTimestamp } from '../utils/time';

/** Countdown labels are minute-precision, so a 30s tick keeps them within half a minute. */
const CLOCK_TICK_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;
const UNASSIGNED = 'unassigned';

const ACTIVE_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS'];

function toStatuses(filter: StatusFilter): readonly TicketStatus[] | undefined {
  if (filter === 'ANY') return undefined;
  if (filter === 'ACTIVE') return ACTIVE_STATUSES;
  return [filter];
}

function toAssignee(view: QueueView, currentAgentId: string | null): string | undefined {
  if (view === 'unassigned') return UNASSIGNED;
  if (view === 'mine') return currentAgentId ?? undefined;
  return undefined;
}

/** Prefer whichever copy of a ticket is newer: the list refresh or the last mutation result. */
function freshest(selected: Ticket, fromList: Ticket | undefined): Ticket {
  if (!fromList) return selected;
  return Date.parse(fromList.updatedAt) >= Date.parse(selected.updatedAt) ? fromList : selected;
}

export function QueuePage() {
  const agentsState = useAgents();
  const [currentAgent, selectAgent] = useCurrentAgent(agentsState.agents);
  const clock = useServerClock(CLOCK_TICK_MS);
  const { toasts, notify, dismiss } = useToasts();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const [view, setView] = useState<QueueView>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const assignedTo = toAssignee(view, currentAgent?.id ?? null);

  // Any filter change resets pagination to page 1 without an extra render cycle.
  const filterKey = JSON.stringify([search, view, statusFilter, limit, assignedTo]);
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const setPage = useCallback((next: number) => setPageState({ filterKey, page: next }), [filterKey]);

  const query = useMemo<TicketQuery>(
    () => ({
      search: search || undefined,
      overdue: view === 'overdue' ? true : undefined,
      assignedTo,
      statuses: toStatuses(statusFilter),
      page,
      limit,
    }),
    [search, view, assignedTo, statusFilter, page, limit],
  );
  const queue = useTicketQueue(query, clock);
  const { refresh } = queue;

  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const drawerTicket = selected && freshest(selected, queue.page?.tickets.find((ticket) => ticket.id === selected.id));

  const handleCreate = useCallback(
    async (input: TicketInput) => {
      const ticket = await ticketApi.create(input);
      setCreateOpen(false);
      notify(`Created “${ticket.title}”`);
      refresh();
    },
    [notify, refresh],
  );

  const handleUpdate = useCallback(
    async (id: string, changes: TicketUpdate) => {
      const ticket = await ticketApi.update(id, changes);
      setSelected(ticket);
      notify('Ticket updated');
      refresh();
    },
    [notify, refresh],
  );

  const visibleCount = queue.page?.tickets.length ?? 0;
  const handleDelete = useCallback(
    async (id: string) => {
      await ticketApi.remove(id);
      notify('Ticket deleted');
      if (visibleCount === 1 && page > 1) setPage(page - 1);
      refresh();
    },
    [notify, refresh, visibleCount, page, setPage],
  );

  const resetFilters = () => {
    setSearchInput('');
    setView('all');
    setStatusFilter('ACTIVE');
  };

  const firstPosition = (page - 1) * limit + 1;

  const renderQueue = () => {
    if (queue.isInitialLoading) return <TicketListSkeleton />;
    if (!queue.page) {
      return (
        <ErrorState title="Couldn't load the queue" message={describeError(queue.error)} onRetry={refresh} />
      );
    }
    if (queue.page.tickets.length === 0) return renderEmpty();
    return (
      <div className={cn('transition-opacity', queue.isQueryChanging && 'opacity-50')} aria-busy={queue.isQueryChanging}>
        <TicketList
          tickets={queue.page.tickets}
          firstPosition={firstPosition}
          now={clock.now}
          selectedId={drawerTicket?.id ?? null}
          onSelect={setSelected}
        />
      </div>
    );
  };

  const renderEmpty = () => {
    if (page > 1) {
      return (
        <EmptyState
          icon={Inbox}
          title="This page is empty"
          description="Tickets may have been resolved or deleted since this page was loaded."
          action={<ActionButton onClick={() => setPage(1)}>Back to first page</ActionButton>}
        />
      );
    }
    if (queue.summary?.counts.total === 0) {
      return (
        <EmptyState
          icon={Inbox}
          title="The queue is empty"
          description="No tickets have been logged yet. New tickets will appear here in priority order."
          action={<ActionButton onClick={() => setCreateOpen(true)}>Create a ticket</ActionButton>}
        />
      );
    }
    if (search) {
      return (
        <EmptyState
          icon={SearchX}
          title={`No tickets match “${search}”`}
          description="Search looks at customer names and ticket titles. Try a different term or clear the filters."
          action={<ActionButton onClick={resetFilters}>Clear search and filters</ActionButton>}
        />
      );
    }
    if (view === 'overdue') {
      return (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing is overdue"
          description="Every ticket matching these filters is within its SLA."
        />
      );
    }
    return (
      <EmptyState
        icon={Inbox}
        title="No tickets match these filters"
        description="Try another view or status."
        action={<ActionButton onClick={resetFilters}>Reset filters</ActionButton>}
      />
    );
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <a
        href="#queue"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to ticket queue
      </a>
      <AppHeader
        agents={agentsState.agents}
        currentAgent={currentAgent}
        onAgentChange={selectAgent}
        onCreateTicket={() => setCreateOpen(true)}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {agentsState.error !== null && (
          <div className="overflow-hidden rounded-lg border border-red-200">
            <ErrorState
              compact
              title="Couldn't load agents."
              message={describeError(agentsState.error)}
              onRetry={agentsState.retry}
            />
          </div>
        )}

        <SummaryCards counts={queue.summary?.counts ?? null} />

        <section id="queue" aria-labelledby="queue-heading" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
            <div>
              <h2 id="queue-heading" className="text-base font-semibold text-slate-900">
                Ticket queue
              </h2>
              <p className="text-sm text-slate-600">
                Overdue tickets first (longest overdue on top), then by priority and time left on the SLA.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {queue.page && <span>Updated {formatTimestamp(queue.page.meta.serverTime)} · auto-refreshing</span>}
              <button
                type="button"
                onClick={refresh}
                disabled={queue.isFetching}
                aria-label="Refresh queue"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
              >
                {queue.isFetching ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <RotateCw aria-hidden className="size-4" />
                )}
              </button>
            </div>
          </div>

          <QueueToolbar
            search={searchInput}
            onSearchChange={setSearchInput}
            view={view}
            onViewChange={setView}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            overdueCount={queue.summary?.counts.overdue ?? null}
            hasCurrentAgent={currentAgent !== null}
          />

          {queue.page && queue.error !== null && (
            <ErrorState
              compact
              title="Couldn't refresh."
              message={`${describeError(queue.error)} Showing the last loaded data.`}
              onRetry={refresh}
            />
          )}

          {renderQueue()}

          {queue.page && queue.page.pagination.total > 0 && (
            <Pagination
              pagination={{ ...queue.page.pagination, page, limit }}
              disabled={queue.isQueryChanging}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </section>
      </main>

      <CreateTicketDialog
        open={createOpen}
        agents={agentsState.agents}
        defaultAgentId={currentAgent?.id ?? null}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
      <TicketDrawer
        ticket={drawerTicket}
        agents={agentsState.agents}
        currentAgent={currentAgent}
        now={clock.now}
        onClose={() => setSelected(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
    >
      {children}
    </button>
  );
}
