import type { Clock } from '../models/clock.js';
import type { EscalationLogger } from './escalationTypes.js';

export interface EscalationRunner {
  run(now: number): unknown;
}

export interface EscalationSchedulerOptions {
  intervalMs: number;
  clock?: Clock;
  logger?: EscalationLogger;
}

/**
 * In-process timer that triggers escalation runs. It holds no business logic: it only decides
 * *when* to run and hands the current time to the escalation service.
 */
export class EscalationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly clock: Clock;
  private readonly logger: EscalationLogger;

  constructor(
    private readonly runner: EscalationRunner,
    private readonly options: EscalationSchedulerOptions,
  ) {
    this.clock = options.clock ?? Date.now;
    this.logger = options.logger ?? console;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Runs once immediately (so a restart catches up on breaches missed while down), then on
   * every interval. Calling start() again while running is a no-op and returns false.
   */
  start(): boolean {
    if (this.timer) return false;
    this.timer = setInterval(() => this.tick(), this.options.intervalMs);
    // The scheduler alone should never keep the process alive.
    this.timer.unref();
    this.logger.info(`[Escalation] Scheduler started (every ${this.options.intervalMs} ms)`);
    this.tick();
    return true;
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.info('[Escalation] Scheduler stopped');
  }

  /** One scheduled run. Failures are logged and the schedule carries on. */
  tick(): void {
    try {
      this.runner.run(this.clock());
    } catch (error) {
      this.logger.error('[Escalation] Run failed; will retry on the next interval', error);
    }
  }
}
