/**
 * SQL mirror of sorting/priorityQueue.ts. Every clause maps 1:1 onto the TypeScript
 * PriorityScore tuple; tests/queueOrderEquivalence.test.ts asserts identical output.
 *
 * All expressions reference the named parameter @now, bound once per query, so the
 * whole page is ordered against a single consistent instant.
 */
import { PRIORITY_RANK } from '../config/constants.js';
import { PRIORITIES } from '../models/ticket.js';

const RESOLVED = `t.status = 'RESOLVED'`;

/** `now > sla_deadline`, i.e. strictly past the deadline, for unresolved tickets. */
export const IS_OVERDUE_SQL = `(t.status <> 'RESOLVED' AND t.sla_deadline < @now)`;

const PRIORITY_RANK_SQL = `CASE t.priority ${PRIORITIES.map(
  (priority) => `WHEN '${priority}' THEN ${PRIORITY_RANK[priority]}`,
).join(' ')} END`;

export const QUEUE_ORDER_BY_SQL = `
  CASE WHEN ${RESOLVED} THEN 2 WHEN ${IS_OVERDUE_SQL} THEN 0 ELSE 1 END ASC,
  CASE WHEN ${IS_OVERDUE_SQL} THEN t.sla_deadline END ASC,
  ${PRIORITY_RANK_SQL} DESC,
  t.sla_deadline ASC,
  t.created_at ASC,
  t.id ASC
`;
