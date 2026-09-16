import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscalationScheduler, type EscalationRunner } from '../src/escalation/escalationScheduler.js';
import { NOW } from './helpers/time.js';

const INTERVAL_MS = 60_000;

function setup(run: EscalationRunner['run'] = vi.fn()) {
  let now = NOW;
  const runner = { run: vi.fn(run) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const scheduler = new EscalationScheduler(runner, { intervalMs: INTERVAL_MS, clock: () => now, logger });
  return {
    runner,
    logger,
    scheduler,
    advance: (ms: number) => {
      now += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

describe('EscalationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once immediately on start, then once per interval, passing the current time', () => {
    const { runner, scheduler, advance } = setup();

    scheduler.start();
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run).toHaveBeenLastCalledWith(NOW);

    advance(INTERVAL_MS - 1);
    expect(runner.run).toHaveBeenCalledTimes(1);

    advance(1);
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(runner.run).toHaveBeenLastCalledWith(NOW + INTERVAL_MS);

    advance(2 * INTERVAL_MS);
    expect(runner.run).toHaveBeenCalledTimes(4);
    scheduler.stop();
  });

  it('ignores a second start() instead of creating a duplicate timer', () => {
    const { runner, scheduler, advance } = setup();

    expect(scheduler.start()).toBe(true);
    expect(scheduler.start()).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    advance(INTERVAL_MS);
    expect(runner.run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('stops cleanly: no timers remain and no further runs happen', () => {
    const { runner, scheduler, advance } = setup();

    scheduler.start();
    scheduler.stop();

    expect(scheduler.isRunning).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    advance(10 * INTERVAL_MS);
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it('treats stop() before start() and repeated stop() as no-ops', () => {
    const { scheduler } = setup();
    expect(() => {
      scheduler.stop();
      scheduler.stop();
    }).not.toThrow();
  });

  it('can be restarted after being stopped', () => {
    const { runner, scheduler, advance } = setup();

    scheduler.start();
    scheduler.stop();
    expect(scheduler.start()).toBe(true);
    advance(INTERVAL_MS);

    expect(runner.run).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('keeps running after a run throws, and logs the error', () => {
    let calls = 0;
    const { runner, logger, scheduler, advance } = setup(() => {
      calls += 1;
      if (calls === 1) throw new Error('database locked');
    });

    expect(() => scheduler.start()).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Run failed'), expect.any(Error));

    advance(INTERVAL_MS);
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
  });

  it('does not keep the Node process alive on its own', () => {
    const unref = vi.fn();
    const realSetInterval = globalThis.setInterval;
    const spy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: () => void, ms: number) => {
      const timer = realSetInterval(handler, ms);
      return Object.assign(timer, { unref });
    }) as typeof setInterval);
    const { scheduler } = setup();

    scheduler.start();

    expect(unref).toHaveBeenCalledTimes(1);
    scheduler.stop();
    spy.mockRestore();
  });
});
