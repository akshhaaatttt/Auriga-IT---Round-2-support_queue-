import { useCallback, useState } from 'react';
import type { Agent } from '../types/api';

const STORAGE_KEY = 'support-queue.current-agent';

function readStoredAgentId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeAgentId(agentId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, agentId);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the selection still works for this session.
  }
}

/** The "logged in" agent. Authentication is out of scope, so this is a remembered selection. */
export function useCurrentAgent(agents: readonly Agent[]): [Agent | null, (agentId: string) => void] {
  const [selectedId, setSelectedId] = useState<string | null>(readStoredAgentId);

  const selectAgent = useCallback((agentId: string) => {
    setSelectedId(agentId);
    storeAgentId(agentId);
  }, []);

  const current = agents.find((agent) => agent.id === selectedId) ?? agents[0] ?? null;
  return [current, selectAgent];
}
