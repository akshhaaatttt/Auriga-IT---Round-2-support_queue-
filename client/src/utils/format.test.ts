import { describe, expect, it } from 'vitest';
import { formatTicketRef, initials } from './format';

describe('formatTicketRef', () => {
  it('uses the first six id characters in upper case', () => {
    expect(formatTicketRef('93caa2d7-9a3a-41e1-9c46-1ae74cce1aa2')).toBe('#93CAA2');
  });
});

describe('initials', () => {
  it.each([
    ['Priya Sharma', 'PS'],
    ['marcus', 'M'],
    ['  Ana María de la Cruz ', 'AC'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
