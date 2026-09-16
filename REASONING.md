# Engineering Reasoning

This document explains the decisions behind Support Queue, and where the brief left room for
interpretation.

---

## 1. Domain model

**Ticket**

| Field             | Type                                | Notes                                            |
| ----------------- | ----------------------------------- | ------------------------------------------------ |
| `id`              | UUID string                         | Server-generated                                 |
| `customerName`    | text                                |                                                  |
| `title`           | text                                |                                                  |
| `description`     | text                                |                                                  |
| `priority`        | `URGENT \| NORMAL \| LOW`           |                                                  |
| `status`          | `OPEN \| IN_PROGRESS \| RESOLVED`   |                                                  |
| `assignedAgentId` | string or null                      |                                                  |
| `createdAt`       | epoch ms                            |                                                  |
| `updatedAt`       | epoch ms                            |                                                  |
| `slaDeadline`     | epoch ms                            | Stored, never derived when reading               |

**Agent**: `id`, `name`, `email`.

Decisions:

- **Timestamps are stored as integer epoch milliseconds**, both in SQLite and in the TypeScript domain model.
  - Comparisons are exact integer comparisons, identical in SQL and in TypeScript. There is no ISO-string parsing and no time-zone ambiguity inside the ordering logic.
  - The API converts them to ISO-8601 at the boundary (`TicketDto`).
- **Queue input is typed narrowly.** The sort engine only needs `QueueTicket = id | priority | status | createdAt | slaDeadline`, so it cannot come to depend on unrelated fields.
- **Priorities and statuses are defined once** as `as const` arrays. The TypeScript unions, the zod enums and the SQL `CHECK` constraints are all generated from those arrays.
- **The API response has two derived fields.**
  - `assignedAgentName` comes from a `LEFT JOIN`, so the UI doesn't flicker while agents load.
  - `isOverdue` is computed at request time.
- **The agents table matches the brief:** Priya plus one colleague. Seed agents have stable ids (`agent-priya`, `agent-marcus`), so the saved "current agent" still works after a reseed.

## 2. Priority queue algorithm

The rule lives in `server/src/sorting/priorityQueue.ts`. It is written as a **lexicographic sort key**, `PriorityScore`, which is compared element by element; smaller sorts first:

| Tier                      | Key                                                                           |
| ------------------------- | ----------------------------------------------------------------------------- |
| Overdue (unresolved)      | `[0, −overdueMs,       −priorityRank, createdAt]`                             |
| On time (unresolved)      | `[1, −priorityRank,    remainingMs,   createdAt]`                             |
| Resolved                  | `[2, −priorityRank,    remainingMs,   createdAt]`                             |

After the key, the ticket `id` is used as a final tie-breaker, compared as a binary string.

The key is a **tuple, not a single number**. A weighted sum like `overdue * 1e12 + rank * 1e9 + …` is fragile: one component can overflow into another, and the weights are magic numbers. A tuple keeps every rule separate and readable, and it maps one-to-one onto an SQL `ORDER BY`.

The public functions are:
- `isOverdue(ticket, now)`
- `getOverdueMs(ticket, now)`
- `getRemainingSlaMs(ticket, now)`
- `getQueueTier(ticket, now)`
- `calculatePriorityScore(ticket, now)`
- `compareTickets(a, b, now)`
- `sortTickets(tickets, now)`

None of them reads the clock or any global state. `sortTickets` returns a new array and never modifies its input.

### Resolved tickets (a decision the brief left open)

The brief defines ordering for "every ticket" but never says what happens to resolved ones. If resolved tickets were treated as ordinary on-time tickets, a resolved Urgent ticket would sit above an open Normal one, which makes no sense for a work queue. So:

- A resolved ticket is **never overdue**. It has had its response, so the SLA no longer applies.
- Resolved tickets form a **third tier at the bottom** of the queue. Within that tier they use the on-time keys, so their order is still deterministic.
- The UI's default status filter is **Active** (Open + In progress). "All statuses" is one click away.

`IN_PROGRESS` tickets **can** still be overdue. The brief ties overdue only to the deadline, and a helpdesk also wants to see stalled in-progress work.

## 3. Exact overdue definition

```ts
overdue = ticket.status !== 'RESOLVED' && now > ticket.slaDeadline
```

The comparison is strict. In SQL it is written as `t.status <> 'RESOLVED' AND t.sla_deadline < @now`, which is the same condition.

## 4. Why overdue tickets jump to the front

A breached SLA is a promise that has already been broken. It hurts the customer relationship and shows up in reporting. An on-time Urgent ticket still has time left, however little. The brief is explicit: *overdue before non-overdue, always*.

So even an overdue **Low** ticket outranks an Urgent ticket that is due right now. Tests cover this case.

## 5. Why overdue duration is sorted descending

Among breached tickets, the one that has waited longest past its promise has done the most damage and has the most unhappy customer.

Implementation detail: `now` is the same for every ticket in a query, so ordering by `now − deadline` descending is the same as ordering by `deadline` ascending. The SQL uses the second form: it's cheaper, and it can use the `sla_deadline` index when filtering.

## 6. Priority ordering

`PRIORITY_RANK = { URGENT: 3, NORMAL: 2, LOW: 1 }` is defined in `config/constants.ts`.

- The TypeScript key negates the rank so that higher priority sorts first.
- The SQL `CASE` expression is **generated from the same constant**, so the two cannot drift apart silently.

Among overdue tickets, priority is only the *second* key. Among on-time tickets, it is the *first*.

## 7. Remaining SLA ordering

Among on-time tickets of the same priority, the ticket closest to its deadline comes first: it is the next one about to breach.

The brief's rule applies literally here: **an Urgent ticket with 2 hours left still outranks a Normal ticket with 1 minute left**. That Normal ticket will jump to the very top one millisecond after its deadline. A test pins this behaviour.

## 8. Creation timestamp tie-breaker

When the earlier keys are equal, the older ticket comes first (first come, first served).

A subtle point: with a fixed SLA table, `slaDeadline = createdAt + SLA(priority)`. So "same priority and same deadline" already implies "same `createdAt`". The tie-breaker only becomes reachable when a stored deadline was produced by an **older SLA policy**, which is exactly the situation that storing deadlines is meant to support. The SQL equivalence test deliberately generates such "legacy" deadlines so this path is exercised.

For full determinism, the **ticket id** (compared as a binary string, the same as SQLite's default collation) is the final tie-breaker. Without it, two otherwise identical tickets could swap places between page requests.

## 9. Exact deadline behaviour

- At `now === slaDeadline` the ticket is **on time**.
- At `slaDeadline + 1 ms` it is **overdue**.

This is tested in the TypeScript engine, in the SQL (evaluated exactly on a deadline boundary and 1 ms after), and in the client's display helper.

## 10. Dynamic time handling

Nothing time-dependent is stored.

**On the server**
- Every request reads the clock once (`clock()`) and passes that value as `@now` to every SQL statement.
- A whole page, its total count, and its `isOverdue` flags are therefore evaluated at the same instant.
- The clock is injected into `createApp`, which is how the tests move time forward without touching the database.

**On the client**
1. **Tick.** `useServerClock` updates `now` every 30 seconds. Countdowns, overdue badges and row highlighting are recomputed from `now`, so a ticket turns red at the next tick even before a refetch.
2. **Polling.** The queue and the summary are re-fetched every 30 seconds, and again when the tab becomes visible. This picks up changes made by the other agent.
3. **Precise transition refresh.** Each response includes `meta.nextQueueChangeAt`.
   - This is the earliest deadline, not yet passed, among the matching unresolved tickets, plus 1 ms. It is the next moment the order will change purely because time passed.
   - The client sets a timer for that moment, so a breach re-orders the queue on time rather than up to 30 seconds late.
   - This calculation **ignores the `overdue` filter**, so the Overdue view also refreshes when a new ticket joins it.
4. **Clock skew.** Every response includes `serverTime`. The client stores the offset between the server clock and its own, and uses it both for countdowns and for converting `nextQueueChangeAt` to local time. A laptop with a wrong clock therefore still shows the server's view of what is overdue.

## 11. Why priority scores are not persisted

A persisted score starts going stale as soon as it is written. Keeping it correct would need either a background job rewriting rows on every breach (write load, race conditions, a gap between the breach and the job run), or tolerance of wrong ordering. Everything the ordering needs (priority, status, deadline, creation time) is already in the row, and the order is a cheap function of those values plus `now`.

**The SLA deadline, however, *is* persisted.** It is a fact about the ticket (the promise made when it was logged), not a derived view. If the SLA table changes later, existing tickets keep their original promise, which makes history auditable.

The deadline is recalculated in exactly one case: **when priority changes**. The new deadline is `createdAt + SLA(newPriority)`, measured from when the customer reported the problem, not from the moment of the edit.
- Escalating a 3-hour-old Normal ticket to Urgent therefore makes it overdue immediately. That is correct: it has in fact waited 3 hours on an issue that deserved a 2-hour response.
- The UI warns about this before saving.
- Other edits never touch the deadline, and a test covers this.

## 12. TypeScript sorting implementation

- `compareTickets` compares the two `PriorityScore` tuples, then the ids.
- `sortTickets` copies the input array and sorts the copy (`Array.prototype.sort` is stable).
- The module has no side effects, no I/O, and no call to `Date.now()`.

It is the **canonical specification**. The code that actually serves requests is the SQL described next. The TypeScript engine is used:
- to compute `isOverdue` for every API response,
- as the reference implementation for the SQL equivalence tests,
- as the readable, unit-tested statement of the business rule.

## 13. SQL ordering implementation

The SQL is in `server/src/repositories/queueOrderSql.ts`:

```sql
ORDER BY
  CASE WHEN t.status = 'RESOLVED' THEN 2
       WHEN (t.status <> 'RESOLVED' AND t.sla_deadline < @now) THEN 0
       ELSE 1 END                                        ASC,  -- tier
  CASE WHEN (overdue) THEN t.sla_deadline END            ASC,  -- overdue: most overdue first (NULL for other tiers)
  CASE t.priority WHEN 'URGENT' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 1 END DESC,
  t.sla_deadline                                         ASC,  -- on time: least remaining first
  t.created_at                                           ASC,
  t.id                                                   ASC
```

How each clause maps to the TypeScript key:

- **Overdue tier:** deadline ascending (= overdue duration descending) → priority → deadline (already equal, so it has no effect) → created → id.
- **Other tiers:** the second clause is `NULL` for every row, so it has no effect → priority → deadline (= remaining time ascending) → created → id.

**Why there are two implementations.** The problem says *"the list is huge, so she pages through it"*. Correct `LIMIT/OFFSET` pagination needs the database itself to produce the order. Loading every ticket into Node or the browser to sort it would not scale.

**How they are kept in sync.** `tests/queueOrderEquivalence.test.ts` inserts 1,500 seeded-random tickets with many deliberate ties (coarse time buckets, legacy deadlines, all statuses). It then checks that the SQL order equals `sortTickets` in each of these cases:
- at the reference time,
- exactly on a shared deadline boundary,
- 1 ms after that boundary,
- a day later,
- far in the past,
- for a filtered subset.

It also checks that paging through the queue 37 rows at a time rebuilds the full order with no gaps or duplicates, and that the SQL overdue count equals the TypeScript `isOverdue` count. Any change to one implementation that isn't made in the other fails CI.

## 14. Pagination strategy

The API uses offset pagination (`LIMIT @limit OFFSET @offset`) with a separate `COUNT(*)` that uses the same `WHERE` clause.

- `page` must be ≥ 1, and `limit` must be between 1 and 100 (default 20).
- A page past the end returns an empty list, not an error. The UI then offers "Back to first page".
- When the last ticket on a page is deleted, the UI steps back one page.

**Why offsets rather than cursors.** The order depends on *time*: tickets move between tiers while someone is paging. A keyset cursor built from sort keys that change over time is complex and still can't give a stable snapshot. Offsets are simple, allow jumping to any page, and match the UI's "Page X of Y" control. The known trade-off is that a ticket crossing a tier boundary between two page requests can appear twice or be skipped. That is acceptable for a live queue that refreshes every 30 seconds.

**On the client:**
- Changing any filter, the search text, the page size, or the current agent (in the "mine" view) resets to page 1. The page number is stored together with a key made from the filters, so this needs no extra render.
- While a new page or filter loads, the previous rows stay visible but dimmed, instead of the list flashing empty.

## 15. Search strategy

Search is a case-insensitive **substring** match on `customer_name` or `title`, done on the server.

- The value goes through a bound parameter: `LIKE @search ESCAPE '\'`.
- `%`, `_` and `\` in the input are escaped, so a user typing `%` searches for a literal percent sign. A test covers this.
- The input is trimmed and limited to 100 characters.
- The client waits 300 ms after typing stops before searching, and a newer request cancels the one still in flight (`AbortController`), so an older response can never overwrite a newer one.

**Trade-off:** a `LIKE '%term%'` pattern that starts with a wildcard can't use a B-tree index. At this scale (thousands of tickets) the scan takes well under a millisecond per thousand rows. The next step would be an SQLite **FTS5** table with the trigram tokenizer, kept in sync by triggers, which supports indexed substring search.

## 16. Database indexes

| Index                                         | Serves                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `(status, sla_deadline)`                      | Status filters (the default Active view), overdue checks            |
| `(sla_deadline)`                              | `overdue=true` count and list (`sla_deadline < @now`), next-deadline lookup |
| `(assigned_agent_id, status)`                 | "Assigned to me" / "Unassigned", optionally with a status filter    |
| `(created_at)`                                | Creation-time lookups and reporting                                 |
| `(customer_name COLLATE NOCASE)`              | Case-insensitive customer lookups and prefix search                 |
| `(title COLLATE NOCASE)`                      | Same, for titles                                                    |

`EXPLAIN QUERY PLAN` confirms:
- The Active view uses `idx_tickets_status_deadline`.
- The overdue count uses `idx_tickets_sla_deadline`.
- The "mine" view uses `idx_tickets_assigned_status`.

**The `ORDER BY` itself is time-dependent, so no index can fully satisfy it.** SQLite sorts the filtered rows with a temporary B-tree. With a `LIMIT`, SQLite keeps only the top rows it needs while sorting, so memory stays small, but the work still grows with the size of the filtered set. See §20.

Foreign key: `assigned_agent_id → agents(id) ON DELETE SET NULL`, with `PRAGMA foreign_keys = ON`. Deleting an agent leaves their tickets in place, unassigned.

## 17. State management approach

The app uses plain React state and hooks, with no Redux or React Query. There is one page and one server resource, and the refresh rules are specific enough that a small custom hook is clearer than configuring a library.

| Hook               | Responsibility                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| `useTicketQueue`   | Fetches the page and the summary together, cancels stale requests, polls, refreshes on tab focus, schedules the precise refresh; exposes `isInitialLoading`, `isQueryChanging`, `isFetching` and `error` |
| `useServerClock`   | The ticking `now`, corrected for server clock skew                             |
| `useAgents`        | Loads the agent list, with retry                                               |
| `useCurrentAgent`  | The selected agent, saved in `localStorage`                                    |
| `useDebouncedValue`| Debounces the search input                                                     |
| `useToasts`        | Success and error notifications                                                |

In `useTicketQueue`, the loading and error flags are *derived* by comparing the key of the latest request with the key of the latest result. The hook never sets state synchronously inside an effect, and the strict `react-hooks` lint rules pass without suppressions.

**No optimistic updates.** After a create, edit or delete, the ticket's position depends on the server's `now` and on data from other agents, so an optimistic re-sort would often be wrong. Instead:
- Buttons show loading spinners while a request runs.
- The drawer immediately shows the ticket returned by the server.
- The queue is re-fetched.
- The drawer shows whichever copy of the ticket is newer (the list copy or the mutation result), by `updatedAt`.

## 18. Error handling

**Server**
- **Validation.** zod schemas check params, query and body. Unknown body fields are rejected (`strictObject`), so a client cannot set `slaDeadline`, `createdAt` or `id`. Failures become a `ValidationError` (400) with a field-level `details` list.
- **Domain errors.** `NotFoundError` (404). Assigning a ticket to an agent that doesn't exist returns 400 with `field: assignedAgentId`.
- **Malformed JSON or an oversized body.** Express's JSON parser reports these as 4xx errors, and the API returns them as a generic `BAD_REQUEST`.
- **Anything else.** The error is logged on the server with the method and URL. The client receives `500 INTERNAL_ERROR` with a generic message: no stack traces and no SQL.
- **Unknown `/api/*` routes** return a JSON 404.
- Express 5 passes thrown errors to the error handler automatically.

**Client**
- `apiRequest` turns network failures, non-JSON responses and error bodies into a single `ApiError` type.
- Where errors appear:
  - **Form errors** appear under the relevant field, plus a summary message.
  - **Drawer quick-action errors** appear inline in the drawer.
  - **A first load that fails** shows a full error state with a retry button.
  - **A failed background refresh** keeps the last data and shows a banner.
  - **Agent loading errors** have their own retry.
- Two `catch` blocks don't report an error:
  - `AbortError` is ignored on purpose: it is expected when a newer request replaces an older one.
  - `localStorage` access failures (private browsing mode) fall back to the default agent. The code comments explain both.

## 19. Testing strategy

Tests are layered according to risk. The ordering rule is the core of the product, so it has the most tests.

1. **`priorityQueue.test.ts`** (pure unit tests), covering:
   - priority order;
   - overdue beats urgent;
   - most overdue first;
   - an overdue tie broken by priority;
   - urgent tickets ordered by time remaining;
   - an urgent ticket with more time left still beating a normal ticket due sooner;
   - creation-time tie-break;
   - the exact deadline instant (not overdue) and deadline + 1 ms (overdue);
   - an empty list, a single ticket, and no mutation of the input;
   - id tie-break;
   - resolved tickets sinking to the bottom;
   - time passing re-orders tickets that have not changed;
   - the full demo scenario;
   - a seeded set of 5,000 tickets: order is consistent between every adjacent pair, independent of input order, and tiers are contiguous.
2. **`sla.test.ts`**: SLA window per priority; deadlines are measured from creation.
3. **`queueOrderEquivalence.test.ts`**: SQL order = TypeScript order (see §13).
4. **`ticketApi.test.ts`**: HTTP integration against a real Express server and an in-memory SQLite database, with a controllable clock. It covers:
   - pagination metadata and page bounds;
   - every filter, and combinations of filters;
   - search, including escaping of wildcard characters;
   - re-ordering as time passes, with no writes;
   - `nextQueueChangeAt`;
   - create (SLA derivation), update, reassign/unassign, and deadline recalculation when priority changes;
   - resolving a ticket removes it from the overdue filter;
   - delete;
   - 400, 404 and malformed-JSON cases.
5. **`client/src/utils/time.test.ts`**: countdown formatting, no negative durations, the exact-deadline boundary, and the due-soon threshold.

The test data uses a fixed reference instant and a seeded random number generator, so every run is identical. The UI flows (search, filters, pagination, create, edit, reassign, resolve, reopen, delete, reload persistence, and mobile/tablet layouts) were also checked manually with a headless browser during development. That script is not part of the repository.

## 20. Scalability considerations

- Only one page of tickets ever leaves the database. Filtering, counting, sorting and pagination all happen in SQL.
- All statements are prepared with bound parameters. better-sqlite3 runs synchronously inside the process, which is fast for this workload because there is no network round trip.
- WAL journal mode lets readers work while a write is in progress. A `busy_timeout` handles brief lock contention.
- **Main limit:** the time-dependent sort has to sort the whole *filtered* set on each request. That is fine up to hundreds of thousands of tickets, especially with the default Active filter (resolved tickets pile up over time but are filtered out by the index). Beyond that, possible steps are:
  - **Split the query by tier.** Overdue tickets are exactly `status <> RESOLVED AND sla_deadline < now`, and their primary order is `sla_deadline`, which an index can serve. On-time tickets can be read per priority from an index on `(status, priority, sla_deadline)`. Each tier can then be streamed in index order and the tiers concatenated, with no global sort.
  - Archive resolved tickets into a separate table.
- `COUNT(*)` for every page request is cheap at this scale. At large scale it could be cached per filter for a few seconds.
- Polling costs 2 small queries per client every 30 seconds, which is trivial for a two-person helpdesk. For many clients, see §22.

## 21. Trade-offs

| Decision | Benefit | Cost |
| --- | --- | --- |
| Two implementations of the order (TypeScript + SQL) | Pagination in the database, plus a readable, unit-tested rule | Duplication. Mitigated by the equivalence tests and by generating the SQL from shared constants |
| Offset pagination | Simple, jump to any page | Possible duplicates or skips when a ticket changes tier between page loads |
| Polling plus a scheduled refresh (no WebSockets) | No extra infrastructure; breaches still appear on time | Other agents' edits can take up to 30 s to appear |
| Low SLA = 24 h (same as Normal) | Follows the brief's preference; Low tickets can't quietly age for days | Low and Normal share a deadline window; they are separated only by priority rank |
| Priority change recalculates the deadline from `createdAt` | The SLA always matches the ticket's real priority and real waiting time | Escalating an old ticket makes it overdue immediately (intended, and the UI warns about it) |
| Resolved = never overdue, always last | The queue stays focused on work still to do | No "was the SLA met?" reporting (would need a `resolved_at` column) |
| `LIKE` substring search | Simple, correct, safe | Scans rows; FTS5 is the upgrade path |
| No optimistic UI | Never shows a wrong queue position | A request round trip before the list updates |
| Minimal CORS middleware instead of the `cors` package | One less dependency; same-origin by default | Handles only the simple allow-list case |
| UUID ids | Can't be guessed, no coordination needed | Not human-friendly. A display number (e.g. `SQ-1042`) would be the next addition |

## 22. What would change for a production multi-user deployment

- **Authentication and authorisation:** SSO/OIDC. "Current agent" would come from the session, not a dropdown, and roles (agent / lead / admin) would control who can delete.
- **Database:** PostgreSQL. The same `ORDER BY` works there unchanged (`CASE`, `NULLS FIRST` semantics made explicit). Search would use `pg_trgm` indexes. Schema changes would move to versioned migrations instead of `CREATE IF NOT EXISTS`.
- **Real-time updates:** Server-Sent Events or WebSockets would push ticket changes, replacing 30-second polling. The client would keep the scheduled breach refresh, or the server could push breach events.
- **Concurrency:** optimistic locking (`If-Match` / an `updatedAt` version) so two agents can't silently overwrite each other's edits.
- **Audit trail:** an event table for status, priority and assignment changes, plus `resolved_at` / `first_response_at`, to report on whether SLAs were met.
- **SLA policy:** a versioned, configurable policy (per customer tier, business hours, holidays) stored alongside each ticket. The stored-deadline design already allows this.
- **Operations:**
  - structured logging and request ids, metrics, health and readiness probes;
  - rate limiting, security headers (helmet), and an explicit CORS allow-list;
  - containerised deployment behind TLS.
- **Scale:** the tier-split queries (§20), archiving of resolved tickets, cached counts, and cursor-based pagination within a tier.
