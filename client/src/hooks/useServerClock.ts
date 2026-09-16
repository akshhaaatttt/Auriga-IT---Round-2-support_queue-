import { useCallback, useEffect, useRef, useState } from 'react';

export interface ServerClock {
  /** Current time in server-clock milliseconds, refreshed every tick. */
  now: number;
  /** Aligns the clock with a server timestamp, correcting for local clock skew. */
  sync: (serverTime: string) => void;
  /** Converts a server timestamp into the equivalent local `Date.now()` value. */
  toLocalTime: (serverTime: string) => number;
}

export function useServerClock(tickMs: number): ServerClock {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetRef.current), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  const sync = useCallback((serverTime: string) => {
    const serverNow = Date.parse(serverTime);
    offsetRef.current = serverNow - Date.now();
    setNow(serverNow);
  }, []);

  const toLocalTime = useCallback((serverTime: string) => Date.parse(serverTime) - offsetRef.current, []);

  return { now, sync, toLocalTime };
}
