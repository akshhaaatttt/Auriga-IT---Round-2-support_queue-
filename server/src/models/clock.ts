/** Returns the current time in epoch milliseconds. Injected so time-dependent code is testable. */
export type Clock = () => number;
