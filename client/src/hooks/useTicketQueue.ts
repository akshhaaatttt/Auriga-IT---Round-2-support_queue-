import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAbortError } from '../services/apiClient';
import { buildTicketSearchParams, ticketApi } from '../services/ticketApi';
import type { QueueSummary, TicketPage, TicketQuery } from '../types/api';
import type { ServerClock } from './useServerClock';

/** Background refresh cadence; picks up other agents' changes and keeps countdowns honest. */
export const QUEUE_REFRESH_INTERVAL_MS = 30_000;
/** Timers longer than this overflow in browsers; polling covers anything further out anyway. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

interface QueueData {
  queryKey: string;
  requestKey: string;
  page: TicketPage;
  summary: QueueSummary;
}

interface QueueFailure {
  requestKey: string;
  error: unknown;
}

export interface TicketQueueState {
  page: TicketPage | null;
  summary: QueueSummary | null;
  error: unknown;
  /** No data has been loaded yet. */
  isInitialLoading: boolean;
  /** The visible data belongs to a different filter/page than the one requested. */
  isQueryChanging: boolean;
  /** Any request (including background refreshes) is in flight. */
  isFetching: boolean;
  refresh: () => void;
}

function earliest(...isoTimes: (string | null | undefined)[]): string | null {
  const times = isoTimes.filter((time): time is string => Boolean(time)).map((time) => Date.parse(time));
  return times.length > 0 ? new Date(Math.min(...times)).toISOString() : null;
}

/** `query` must be referentially stable (memoized) — a new object triggers a new request. */
export function useTicketQueue(query: TicketQuery, clock: ServerClock): TicketQueueState {
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<QueueData | null>(null);
  const [failure, setFailure] = useState<QueueFailure | null>(null);
  const { sync, toLocalTime } = clock;

  const queryKey = useMemo(() => buildTicketSearchParams(query).toString(), [query]);
  const requestKey = `${queryKey}#${reloadToken}`;
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([ticketApi.list(query, controller.signal), ticketApi.summary(controller.signal)])
      .then(([page, summary]) => {
        sync(page.meta.serverTime);
        setData({ queryKey, requestKey, page, summary });
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setFailure({ requestKey, error });
      });
    return () => controller.abort();
  }, [query, queryKey, requestKey, sync]);

  useEffect(() => {
    const id = window.setInterval(refresh, QUEUE_REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const nextQueueChangeAt = earliest(data?.page.meta.nextQueueChangeAt, data?.summary.meta.nextQueueChangeAt);
  useEffect(() => {
    if (!nextQueueChangeAt) return undefined;
    const delay = Math.min(Math.max(toLocalTime(nextQueueChangeAt) - Date.now(), 0), MAX_TIMER_DELAY_MS);
    const id = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(id);
  }, [nextQueueChangeAt, refresh, toLocalTime]);

  return {
    page: data?.page ?? null,
    summary: data?.summary ?? null,
    error: failure?.requestKey === requestKey ? failure.error : null,
    isInitialLoading: data === null && failure === null,
    isQueryChanging: data !== null && data.queryKey !== queryKey && failure?.requestKey !== requestKey,
    isFetching: data?.requestKey !== requestKey && failure?.requestKey !== requestKey,
    refresh,
  };
}
