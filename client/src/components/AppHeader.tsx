import { ListOrdered, Loader2, Plus, RotateCw } from 'lucide-react';
import type { Agent } from '../types/api';
import { Avatar } from './Avatar';

interface AppHeaderProps {
  agents: readonly Agent[];
  currentAgent: Agent | null;
  onAgentChange: (agentId: string) => void;
  onCreateTicket: () => void;
  lastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function AppHeader({
  agents,
  currentAgent,
  onAgentChange,
  onCreateTicket,
  lastUpdated,
  isRefreshing,
  onRefresh,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
            <ListOrdered className="size-4.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold text-ink">Support Queue</p>
            <p className="hidden truncate text-xs text-ink-subtle sm:block">IT Helpdesk operations</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 text-xs text-ink-subtle md:flex" aria-live="off">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-success/30" />
              <span className="relative m-auto size-1.5 rounded-full bg-success" />
            </span>
            <span className="whitespace-nowrap">{lastUpdated ? `Live · updated ${lastUpdated}` : 'Connecting…'}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={isRefreshing ? 'Refreshing queue' : 'Refresh queue'}
            title="Refresh queue"
            className="btn btn-ghost btn-icon hidden sm:inline-flex"
          >
            {isRefreshing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RotateCw aria-hidden className="size-4" />}
          </button>

          <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />

          <div className="flex items-center gap-2">
            <label htmlFor="current-agent" className="sr-only sm:not-sr-only sm:text-xs sm:whitespace-nowrap sm:text-ink-subtle">
              Signed in as
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute left-2">
                <Avatar name={currentAgent?.name ?? null} />
              </span>
              <select
                id="current-agent"
                value={currentAgent?.id ?? ''}
                onChange={(event) => onAgentChange(event.target.value)}
                disabled={agents.length === 0}
                className="control w-36 pl-10 font-medium sm:w-44"
              >
                {agents.length === 0 && <option value="">Loading…</option>}
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="button" onClick={onCreateTicket} className="btn btn-primary" aria-label="New ticket">
            <Plus aria-hidden className="size-4" />
            <span className="hidden sm:inline">New ticket</span>
          </button>
        </div>
      </div>
    </header>
  );
}
