import { LifeBuoy, Plus } from 'lucide-react';
import type { Agent } from '../types/api';

interface AppHeaderProps {
  agents: readonly Agent[];
  currentAgent: Agent | null;
  onAgentChange: (agentId: string) => void;
  onCreateTicket: () => void;
}

export function AppHeader({ agents, currentAgent, onAgentChange, onCreateTicket }: AppHeaderProps) {
  return (
    <header className="bg-slate-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <LifeBuoy aria-hidden className="size-6 text-red-400" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Support Queue</h1>
            <p className="text-xs text-slate-400">IT Helpdesk</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <label htmlFor="current-agent" className="whitespace-nowrap">
              Current agent
            </label>
            <select
              id="current-agent"
              value={currentAgent?.id ?? ''}
              onChange={(event) => onAgentChange(event.target.value)}
              disabled={agents.length === 0}
              className="rounded-md border border-slate-600 bg-slate-800 py-1.5 pl-2 pr-8 text-sm text-white disabled:opacity-60"
            >
              {agents.length === 0 && <option value="">Loading agents…</option>}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onCreateTicket}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Plus aria-hidden className="size-4" />
            New ticket
          </button>
        </div>
      </div>
    </header>
  );
}
