import { CheckCircle2, Inbox, Plus, SearchX, UserRoundX } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { CreateTicketDialog } from '../components/CreateTicketDialog';
import { Pagination } from '../components/Pagination';
import { QueueSummary } from '../components/QueueSummary';
import { QueueToolbar, type QueueView, type StatusFilter } from '../components/QueueToolbar';
import { EmptyState, ErrorState } from '../components/StateMessages';
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
import { describeTicketChange } from '../utils/ticketChanges';

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
      notify(describeTicketChange(changes, agentsState.agents));
      refresh();
    },
    [notify, refresh, agentsState.agents],
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

  /**
   * The native dialog restores focus to the row that opened it, but that row may have been
   * re-rendered or moved (e.g. after resolving). Fall back to the ticket's current row, then
   * to the queue heading, so keyboard users never land on <body>.
   */
  const closeDrawer = () => {
    const closedId = selected?.id;
    setSelected(null);
    window.requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const row = closedId ? document.querySelector<HTMLElement>(`[data-ticket-id="${CSS.escape(closedId)}"]`) : null;
      (row ?? document.getElementById('queue-heading'))?.focus();
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setView('all');
    setStatusFilter('ACTIVE');
  };

  const showView = (next: QueueView, status: StatusFilter) => {
    setView(next);
    setStatusFilter(status);
  };

  const activeMetric =
    view === 'overdue' ? 'overdue' : view === 'all' && statusFilter === 'ACTIVE' && !searchInput ? 'active' : null;
  const firstPosition = (page - 1) * limit + 1;
  const lastUpdated = queue.page
    ? new Date(queue.page.meta.serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const renderQueue = () => {
    if (queue.isInitialLoading) return <TicketListSkeleton />;
    if (!queue.page) {
      return <ErrorState title="Couldn't load the queue" message={describeError(queue.error)} onRetry={refresh} />;
    }
    if (queue.page.tickets.length === 0) return renderEmpty();
    return (
      <div className={cn('transition-opacity duration-150', queue.isQueryChanging && 'opacity-60')} aria-busy={queue.isQueryChanging}>
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
          title="This page is now empty"
          description="Tickets on it were resolved, deleted or moved up the queue since it loaded."
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setPage(1)}>
              Back to first page
            </button>
          }
        />
      );
    }
    if (queue.summary?.counts.total === 0) {
      return (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title="All clear"
          description="There are no tickets in the queue. New requests will appear here in priority order."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Log a ticket
            </button>
          }
        />
      );
    }
    if (search) {
      return (
        <EmptyState
          icon={SearchX}
          title="No tickets found"
          description={`Nothing matches “${search}” with these filters. Try another customer name or ticket title.`}
          action={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setSearchInput('')}>
                Clear search
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                Reset all filters
              </button>
            </>
          }
        />
      );
    }
    if (view === 'overdue') {
      return (
        <EmptyState
          icon={CheckCircle2}
          tone="success"
          title="You're caught up"
          description="No tickets matching these filters have breached their SLA."
        />
      );
    }
    if (view === 'mine') {
      return (
        <EmptyState
          icon={UserRoundX}
          title="Nothing assigned to you"
          description={`${currentAgent?.name ?? 'You'} has no tickets with this status. Pick one up from the unassigned queue.`}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setView('unassigned')}>
              View unassigned tickets
            </button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={Inbox}
        title="No tickets match these filters"
        description="Try a different view or status."
        action={
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>
            Reset filters
          </button>
        }
      />
    );
  };

  const total = queue.page?.pagination.total;

  return (
    <div className="min-h-dvh">
      <a
        href="#queue"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-(--shadow-overlay)"
      >
        Skip to ticket queue
      </a>
      <AppHeader
        agents={agentsState.agents}
        currentAgent={currentAgent}
        onAgentChange={selectAgent}
        onCreateTicket={() => setCreateOpen(true)}
        lastUpdated={lastUpdated}
        isRefreshing={queue.isFetching}
        onRefresh={refresh}
      />

      <main className="mx-auto max-w-[90rem] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Priority queue</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Work from the top: breached SLAs first, then by priority and time remaining.
            </p>
          </div>
        </div>

        {agentsState.error !== null && (
          <div className="overflow-hidden rounded-(--radius-panel) border border-danger-line">
            <ErrorState compact title="Couldn't load agents." message={describeError(agentsState.error)} onRetry={agentsState.retry} />
          </div>
        )}

        <QueueSummary
          counts={queue.summary?.counts ?? null}
          activeMetric={activeMetric}
          onShowActive={() => {
            setSearchInput('');
            showView('all', 'ACTIVE');
          }}
          onShowOverdue={() => showView('overdue', 'ACTIVE')}
        />

        <section id="queue" aria-labelledby="queue-heading" className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
            <h2 id="queue-heading" tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
              Tickets
            </h2>
            <p className="text-sm text-ink-subtle" aria-live="polite">
              {total === undefined ? 'Loading…' : `${total} ${total === 1 ? 'ticket' : 'tickets'} match`}
            </p>
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

        <p className="pb-2 text-center text-xs text-ink-subtle">
          Press <kbd className="kbd">/</kbd> to search. Overdue tickets are escalated one priority level per automated run.
        </p>
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
        onClose={closeDrawer}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
