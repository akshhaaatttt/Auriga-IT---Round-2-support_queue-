import { useCallback, useEffect, useState } from 'react';
import { isAbortError } from '../services/apiClient';
import { agentApi } from '../services/ticketApi';
import type { Agent } from '../types/api';

interface AgentsState {
  agents: Agent[];
  error: unknown;
  isLoading: boolean;
  retry: () => void;
}

export function useAgents(): AgentsState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; agents: Agent[]; error: unknown } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    agentApi
      .list(controller.signal)
      .then(({ agents }) => setResult({ attempt, agents, error: null }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setResult({ attempt, agents: [], error });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    agents: result?.agents ?? [],
    error: result?.attempt === attempt ? result.error : null,
    isLoading: result?.attempt !== attempt,
    retry,
  };
}
