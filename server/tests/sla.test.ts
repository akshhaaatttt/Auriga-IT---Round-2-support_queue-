import { describe, expect, it } from 'vitest';
import { calculateSlaDeadline, getSlaResponseMs } from '../src/domain/sla.js';
import { HOUR, NOW } from './helpers/time.js';

describe('SLA policy', () => {
  it('gives urgent tickets a 2 hour response window', () => {
    expect(getSlaResponseMs('URGENT')).toBe(2 * HOUR);
    expect(calculateSlaDeadline(NOW, 'URGENT')).toBe(NOW + 2 * HOUR);
  });

  it('gives normal tickets a 24 hour response window', () => {
    expect(calculateSlaDeadline(NOW, 'NORMAL')).toBe(NOW + 24 * HOUR);
  });

  it('gives low tickets the documented 24 hour response window', () => {
    expect(calculateSlaDeadline(NOW, 'LOW')).toBe(NOW + 24 * HOUR);
  });

  it('measures the deadline from creation time, not from the current time', () => {
    const createdAt = NOW - 5 * HOUR;
    expect(calculateSlaDeadline(createdAt, 'URGENT')).toBe(NOW - 3 * HOUR);
  });
});
