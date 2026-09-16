# Engineering Reasoning

This document explains the decisions behind Support Queue, and where the brief left room for
interpretation. The automated escalation feature (the assessment "twist") is covered in
[§23](#23-automated-priority-escalation).

---

## 1. Domain model

**Ticket**

| Field             | Type                                | Notes                                            |
| ----------------- | ----------------------------------- | ------------------------------------------------ |
| `id`              | UUID string                         | Server-generated                                 |
| `customerName`    | text                                |                                                  |
| `title`           | text                                |                                                  |
| `description`     | text                                |                                                  |
| `priority`        | `URGENT \| HIGH \| NORMAL \| LOW`   | May be raised automatically (§23)                |
| `status`          | `OPEN \| IN_PROGRESS \| RESOLVED`   |                                                  |
| `assignedAgentId` | string or null                      |                                                  |
| `createdAt`       | epoch ms                            |                                                  |
| `updatedAt`       | epoch ms                            |                                                  |
| `slaDeadline`     | epoch ms                            | Stored, never derived when reading               |
| `escalationCount` | integer                             | How many times automation raised the priority    |
| `lastEscalatedAt` | epoch ms or null                    | When automation last raised the priority         |

**Agent**: `id`, `name`, `email`.

Decisions:

- **Timestamps are stored as integer epoch milliseconds**, both in SQLite and in the TypeScript domain model.
  - Comparisons are exact integer comparisons, identical in SQL and in TypeScript. There is no ISO-string parsing and no time-zone ambiguity inside the ordering logic.
  - The API converts them to ISO-8601 at the boundary (`TicketDto`).
- **Queue input is typed narrowly.** The sort engine only needs `QueueTicket = id | priority | status | createdAt | slaDeadline`, so it cannot come to depend on unrelated fields.
- **Priorities and statuses are defined once** as `as const` arrays. The TypeScript unions, the zod enums and the SQL priority ranking are generated from those arrays. The SQL `CHECK` constraints are the exception: they live in frozen, versioned migrations (§23.10), so an old migration always runs the same way.
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

`PRIORITY_RANK = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }` is defined in `config/constants.ts`.

`HIGH` was added for the escalation chain (§23.6). Its SLA is **8 hours**, between Urgent (2h) and Normal (24h). Agents can also choose High when creating or editing a ticket.

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

A persisted score starts going stale as soon as it is written. Keeping it correct would need either a background job rewriting *every* row on *every* breach (write load, race conditions, a gap between the breach and the job run), or tolerance of wrong ordering. Everything the ordering needs (priority, status, deadline, creation time) is already in the row, and the order is a cheap function of those values plus `now`.

**The SLA deadline, however, *is* persisted.** It is a fact about the ticket (the promise made when it was logged), not a derived view. If the SLA table changes later, existing tickets keep their original promise, which makes history auditable.

(Automated escalation, §23, is a different kind of write. It records a discrete business event, "this ticket's priority was raised", at most once per ticket per run. It does not keep a derived ordering value up to date, and the queue order is still computed at read time.)

The deadline is recalculated in exactly one case: **when an agent changes the priority**. The new deadline is `createdAt + SLA(newPriority)`, measured from when the customer reported the problem, not from the moment of the edit. Automated escalation deliberately does *not* do this (§23.6).
- An agent manually raising a 3-hour-old Normal ticket to Urgent therefore makes it overdue immediately. That is correct: it has in fact waited 3 hours on an issue that deserved a 2-hour response.
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
  CASE t.priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 1 END DESC,
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
| `(sla_deadline)`                              | `overdue=true` count and list (`sla_deadline < @now`), next-deadline lookup, escalation candidate scan |
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
5. **Escalation and migration suites**: see §23.13.
6. **`client/src/utils/time.test.ts`**: countdown formatting, no negative durations, the exact-deadline boundary, and the due-soon threshold.

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
| Escalation keeps the original SLA deadline | "Overdue by" stays continuous; the original promise stays auditable | An escalated ticket's deadline does not match its current priority's SLA window (the UI says so) |
| In-process escalation scheduler | No extra infrastructure | Needs a lock or leader election if the server is ever scaled out (§23.15) |

## 22. What would change for a production multi-user deployment

- **Authentication and authorisation:** SSO/OIDC. "Current agent" would come from the session, not a dropdown, and roles (agent / lead / admin) would control who can delete.
- **Database:** PostgreSQL. The same `ORDER BY` works there unchanged (`CASE`, `NULLS FIRST` semantics made explicit). Search would use `pg_trgm` indexes. The small `user_version` migration runner would be replaced by a migration tool.
- **Real-time updates:** Server-Sent Events or WebSockets would push ticket changes, replacing 30-second polling. The client would keep the scheduled breach refresh, or the server could push breach events.
- **Concurrency:** optimistic locking (`If-Match` / an `updatedAt` version) so two agents can't silently overwrite each other's edits.
- **Audit trail:** an event table for status, priority and assignment changes, plus `resolved_at` / `first_response_at`, to report on whether SLAs were met.
- **SLA policy:** a versioned, configurable policy (per customer tier, business hours, holidays) stored alongside each ticket. The stored-deadline design already allows this.
- **Operations:**
  - structured logging and request ids, metrics, health and readiness probes;
  - rate limiting, security headers (helmet), and an explicit CORS allow-list;
  - containerised deployment behind TLS.
- **Scale:** the tier-split queries (§20), archiving of resolved tickets, cached counts, and cursor-based pagination within a tier.

---

## 23. Automated Priority Escalation

> "The solution must also include an automated check that escalates any ticket which has
> breached its agreed response time — raising its priority by one level
> (normal → high → urgent), at most one level per run."

### 23.1 Why escalation is a domain service

Escalation is a business rule that **changes stored data**: after it runs, the ticket really is a higher priority, for every user, report and later query. It therefore lives on the server, in three layers with one job each:

```
EscalationScheduler  (when to run)          escalation/escalationScheduler.ts
        │  run(now)
EscalationService    (one complete run)     escalation/escalationService.ts
        │  shouldEscalate / escalatePriority
escalationPolicy     (the rule, pure)       escalation/escalationPolicy.ts
        │
TicketRepository     (guarded SQL)          repositories/ticketRepository.ts
        │
SQLite
```

- The scheduler holds no business logic; it only calls `escalationService.run(clock())`.
- The manual endpoint `POST /api/tickets/escalation/run` calls the **same** service instance, built once in `container.ts`, so there is exactly one implementation.

### 23.2 Why it is not implemented in React

A browser-side escalation would:
- only happen while someone has the page open;
- run once per open tab, so several tabs could escalate the same ticket twice;
- be invisible to other users and to the database.

The client therefore has **no escalation logic**. It displays whatever the API returns: the new priority, and an *Auto-escalated ×N* badge built from `escalationCount` and `lastEscalatedAt`. New priorities reach the page through the existing 30-second refresh. No second refresh mechanism was added.

### 23.3 Why the database is the source of truth

- The priority is persisted, so the queue's `ORDER BY`, the filters, the summary counts and every client all see the same value.
- A restart doesn't reset anything.
- Each escalation also sets `updated_at` and `last_escalated_at` and increments `escalation_count`. That makes an automatic change easy to tell apart from an agent's edit, without adding a full event-log table (which would be the production upgrade, §22).

### 23.4 How an SLA breach is determined

It uses the single existing definition, `isOverdue(ticket, now)` from `sorting/priorityQueue.ts`: unresolved **and** `now > slaDeadline`, strictly. `shouldEscalate` calls `isOverdue`; it does not re-implement it.

In SQL, the candidate query and the guarded `UPDATE` both use the shared `IS_OVERDUE_SQL` fragment, which is the same one the queue uses. As a result:
- `now === slaDeadline` does **not** escalate;
- `slaDeadline + 1 ms` does.

Tests check this at both the pure-function level and against the database.

### 23.5 Why only unresolved tickets escalate

`RESOLVED` is the only terminal status in this domain. A resolved ticket has had its response, so raising its priority would only move it within the bottom tier and add noise.
- `OPEN` tickets escalate.
- `IN_PROGRESS` tickets also escalate: someone having started work doesn't undo a missed promise, and a stalled in-progress ticket is exactly what escalation should surface.

This matches how the queue already treats in-progress tickets (§2).

### 23.6 The priority transition model

The existing model had `URGENT | NORMAL | LOW`. The requirement names `NORMAL → HIGH → URGENT`, so the smallest consistent change was to **add `HIGH`** between them:

```
LOW (1) → NORMAL (2) → HIGH (3) → URGENT (4) → URGENT
```

- **`HIGH`** is a full priority, not an escalation-only state.
  - It has its own SLA (8h), rank, badge, form option and sort position.
  - The TypeScript comparator and the generated SQL `CASE` both include it through `PRIORITY_RANK`.
  - The SQL/TypeScript equivalence test now generates all four priorities.
- **`LOW → NORMAL`.** The brief's chain starts at Normal but doesn't forbid escalating Low, and leaving breached Low tickets at Low forever would contradict "escalates *any* ticket which has breached". Low therefore escalates one step, into the named chain. Normal → High → Urgent is unchanged.
- **The transitions are an explicit lookup table** (`NEXT_PRIORITY`), not rank arithmetic, so the chain can be read at a glance. A test checks that every non-terminal step raises the rank by exactly 1.
- **Escalation changes the priority, not the SLA deadline.** When an agent re-prioritises a ticket, the deadline is recalculated (§11), because the agent is re-classifying the issue. Escalation is a *consequence* of a breach, not a re-classification. If it recalculated the deadline:
  - "Overdue by 15m" would suddenly become "Overdue by 16h" (a Normal ticket's 24h window replaced by High's 8h window, both measured from creation);
  - the original promise, which is what was actually broken, would be lost from the record.

  Keeping the deadline makes the breach duration continuous ("15m → 16m → 17m" across runs) and keeps the ticket eligible on the next run. The drawer states "Original deadline kept after auto-escalation", so the difference from the current priority's SLA window is explained.

### 23.7 Why exactly one level per run

The requirement is explicit, and it is also good operational behaviour. Escalation is gradual pressure: every run gives the team a chance to respond before the next step.

It is guaranteed by construction:
- `escalatePriority` performs one table lookup and has no loop.
- `EscalationService.run` reads the candidate list **once** at the start, and visits each candidate **once**.
- Each write is conditional on the priority that was read (`WHERE priority = @from`, §23.10), so even a stale read can't produce a two-level jump.

### 23.8 How repeated runs reach URGENT

A breached ticket stays breached, because the deadline doesn't move. It is therefore a candidate again on the next run, one level higher:

| Run     | Result          |
| ------- | --------------- |
| Start   | NORMAL          |
| Run 1   | HIGH            |
| Run 2   | URGENT          |
| Run 3   | URGENT (no write) |

With the default 60-second interval, a breached Normal ticket reaches Urgent within about two minutes of the breach being detected, and a Low ticket within about three. The interval can be changed with `ESCALATION_INTERVAL_MS`.

Resolving a ticket stops escalation. An agent manually lowering the priority also recalculates the deadline (§11); if the new deadline is in the future, the ticket is no longer breached and escalation stops. The audit counters are kept either way.

### 23.9 Why URGENT is terminal

There is no level above Urgent. Among overdue tickets, the queue already orders by *how long* each has been breached, so an overdue Urgent ticket keeps rising as time passes without any change to its priority.

Urgent tickets are excluded **in SQL** (`priority <> @topPriority`), so they are never loaded or written: no pointless `UPDATE`, and no change to `updated_at`. A test asserts that an overdue Urgent row stays byte-for-byte identical after a run.

### 23.10 Atomic, stale-safe updates

Each escalation is a compare-and-set:

```sql
UPDATE tickets AS t
SET priority = @to, updated_at = @now, last_escalated_at = @now,
    escalation_count = t.escalation_count + 1
WHERE t.id = @id
  AND t.priority = @from                                   -- the priority we read
  AND (t.status <> 'RESOLVED' AND t.sla_deadline < @now)   -- still eligible
```

- **If anything changed between the read and the write, the update matches 0 rows.** For example, another process already escalated the ticket, an agent re-prioritised or resolved it, or the deadline moved. The ticket is then reported as `unchanged` rather than overwritten. Tests simulate each of these.
- **The whole run executes inside one `BEGIN IMMEDIATE` transaction** (`TicketRepository.runExclusive`). The candidate snapshot and all writes are serialised against every other writer, including a second server process using the same file. Two overlapping runs can therefore only happen one after the other, and each one is a separate one-level step.
- **One failed row doesn't stop the run.** Each ticket's update has its own `try/catch`: the error is logged with the ticket id and reported in `failed`, and the remaining tickets are still processed and committed. No error is silently swallowed.
- **All values are bound parameters.** Ids, times and priorities are never interpolated into the SQL.

**Schema change.** SQLite can't alter a `CHECK` constraint, and the original constraint rejected `HIGH`. A small **versioned migration runner** was introduced (`db/migrations.ts`, `PRAGMA user_version`):
- Migration 1 is the original schema, written with `IF NOT EXISTS`, so databases created before versioning (which report `user_version = 0`) are adopted safely.
- Migration 2 rebuilds `tickets` with the new constraint and the audit columns, copies every row across, recreates the indexes, and runs `foreign_key_check`.
- Each migration runs in its own transaction, together with its version bump.
- Migration SQL is frozen text, never generated from current constants, so history can't change later.
- A database from a *newer* release is refused rather than guessed at.

Tests build a genuine legacy database and confirm that it upgrades with no data loss and that `HIGH` is accepted afterwards. The same upgrade was also run against a copy of a real development database.

### 23.11 How the scheduler works

`EscalationScheduler` wraps `setInterval`:
- **`start()`** runs once immediately, so a restart catches up on breaches missed while the server was down, then runs on every interval. A second `start()` returns `false` and creates no second timer.
- **`stop()`** clears the timer. Calling it repeatedly is harmless, and the scheduler can be started again afterwards.
- **`tick()`** passes `clock()` (the current time) to the service. If a run throws, for example because the database is busy, the error is logged and the schedule carries on.
- **The timer is `unref()`'d**, so the scheduler on its own never keeps the process alive.
- **Runs are synchronous** (better-sqlite3), so they can't overlap inside one process. A run touches only the few eligible rows through an index, so the event loop is blocked for about a millisecond per run.
- **Configuration:** `ESCALATION_INTERVAL_MS` (default 60,000; minimum 1,000) and `ESCALATION_ENABLED`. Invalid values stop the server at startup rather than being silently corrected.
- **Logging.** Each run logs a start line, one line per escalated ticket (id and transition only, no customer data), and a summary: `candidates / escalated / unchanged / failed`. On-time tickets are never loaded, so they aren't logged.

### 23.12 Graceful shutdown

`server.ts` starts the scheduler once, after the HTTP server is listening.

On `SIGINT`/`SIGTERM` it:
1. stops the scheduler;
2. closes the HTTP server;
3. closes the database;
4. exits with code 0.

A guard makes a repeated signal harmless. This was checked by signalling the production build (clean exit, "Scheduler stopped" logged).

In development, `tsx watch` restarts the whole process, so there is never more than one scheduler.

### 23.13 How tests verify the behaviour

| Suite | What it proves |
| --- | --- |
| `escalationPolicy.test.ts` | Each single step (NORMAL→HIGH, HIGH→URGENT, URGENT→URGENT, LOW→NORMAL); NORMAL never becomes URGENT in one call; every step is exactly +1 rank; URGENT is the only terminal state; breach boundary (on time / exactly the deadline / +1 ms / severely overdue); OPEN and IN_PROGRESS escalate, RESOLVED does not |
| `escalationService.test.ts` | Against a real SQLite database: the priority is saved; exact sequences across runs (NORMAL→HIGH→URGENT→URGENT, HIGH→URGENT→URGENT, LOW→…→URGENT); `updatedAt`, `lastEscalatedAt` and `escalationCount` are set; the deadline is kept; URGENT is not written; a mixed set of tickets (A–E from the brief); only eligible rows are loaded; stale reads, a ticket resolved between read and write, and concurrent re-prioritisation are all refused; one failing ticket doesn't stop the others; the log output |
| `escalationScheduler.test.ts` | With fake timers (no real waiting): an immediate run then one per interval, with the current time passed in; no duplicate timers; `stop()` removes the timer and further runs; stop/start can be repeated; a failing run doesn't kill the schedule; the timer is unref'd |
| `escalationApi.test.ts` | The manual endpoint's status code, response shape, saved result and one-level-per-call behaviour; queue order uses the escalated priorities (including an escalated ticket overtaking an Urgent one); on-time tickets are never escalated; a later manual priority change keeps the audit trail |
| `migrations.test.ts` | A legacy database upgrades without data loss; HIGH is accepted and every index still exists afterwards; running migrations again changes nothing; unknown priorities are still rejected; a database from a newer version is refused |

In a headless browser against the production build, a Low ticket climbed Low → Normal → High → Urgent over three scheduler runs without a page reload. Unsaved edits in the open drawer were kept (the "changed while you were editing" notice appeared), and saving them did not revert the escalated priority.

### 23.14 Trade-offs of an in-process scheduler

**Benefits**
- No extra infrastructure. It starts and stops with the API, and shares the same services and database connection.

**Costs**
- **No escalation while the server is down.** This is softened by the immediate run on startup: after downtime a ticket catches up by *one* level, never several. That is consistent with "one level per run".
- **Timing precision equals the interval.** A breach is escalated up to one interval after it happens.
- **Escalation runs in the same process as the API.** A very large backlog would add latency to API requests while a run is executing. The candidate query is indexed and limited to eligible rows, so this is small in practice.

**Protecting unsaved edits.** Priorities now change while people are looking at them, so the ticket drawer's edit form works from a **snapshot** taken when the user starts typing:
- A background change neither wipes their edits nor gets overwritten by them. Only the fields the user actually changed are sent.
- A notice appears offering to discard the edits.

### 23.15 Multi-instance production deployment

If the API were scaled across several Node processes or machines, every instance would run its own scheduler.

**Correctness would still hold within a shared SQLite file:** the immediate transaction serialises runs, and the compare-and-set update prevents stale double-steps. **But the business meaning of "a run" would break.** N instances each running once a minute would escalate tickets N times as fast.

A real deployment would therefore:
- **Run the check in exactly one place.** Options:
  - a leader-elected instance;
  - a Postgres advisory lock (`pg_try_advisory_lock`) taken at the start of each run;
  - a dedicated worker or cron job (Kubernetes CronJob, cloud scheduler) calling the same service code.
- **Record runs in a table** (`escalation_runs`: id, started_at, finished_at, counts), with a per-ticket `last_escalated_run_id`. "At most one level per run" can then be enforced by a database constraint, and a run can be audited and safely retried.
- **Emit escalation events** (an outbox or event table) for notifications ("ticket escalated to Urgent") and for SLA reporting, instead of relying only on log lines.
- **Keep the pure policy and the compare-and-set update unchanged.** They are already independent of where the scheduler runs.

---

## 24. UI/UX design system

The interface was reworked after a visual audit of the running app, using the UI/UX Pro Max design guidance (Swiss/minimal enterprise style, dense dashboard layout, subtle motion). The design goal is that **an agent can tell which ticket to work on next within about two seconds.**

### 24.1 What the audit found

- **Low density.** Each row took about 93px (three lines plus a strip of badges), so only six tickets fitted on a laptop screen.
- **Red everywhere.** Every overdue row was tinted red, and each row carried up to four coloured pills, so urgency lost its meaning.
- **Weak metrics.** Five equal cards that couldn't be clicked, and nothing answered "how many are urgent?" or "what's about to breach?"
- **Heavy header.** A dark bar that looked like a demo, and filters split across two different kinds of control.
- **Drawer.** Priority, status and assignee could only be changed through a long form at the bottom.
- **Mobile.** Titles cut off after about 25 characters.

### 24.2 Design tokens

All colours, fonts, radii, shadows and animations are defined once as Tailwind v4 `@theme` tokens in `client/src/index.css`. Reusable component classes are built on top of them: `btn-*`, `control`, `segmented`/`segment`, `badge`, `panel`, `eyebrow` and `kbd`. Components never use hex values or raw palette colours, and an audit (grep) confirms none remain.

- **Neutrals** (`canvas`, `surface`, `line`, `ink`, `ink-muted`, `ink-subtle`) come from a slate palette, and there is **one accent** (trust blue) for primary actions, selection and focus.
- **Colours carry fixed meanings:**
  - **red** means only "SLA breached";
  - **priority** uses one warm ramp (slate → amber → orange), so Low < Normal < High < Urgent reads as a single progression rather than four unrelated colours;
  - **violet** means only "changed by automation";
  - **green** means "resolved" and "success".
- **Contrast** was checked numerically: every text/background pair is at least 4.5:1. `ink-subtle` was darkened from `#64748b` to `#5b6a7f`, because the lighter value dropped to 4.3:1 on tinted surfaces; axe flagged this.
- **Typography:**
  - Fira Sans for interface text, a readable humanist face suited to dense dashboards;
  - Fira Code only for identifiers and metric numbers;
  - countdowns use tabular figures, so digits line up from row to row.
  - The fonts load from Google Fonts with `display=swap` and a system-font fallback, so the app still renders correctly offline.
- **Motion** is limited to hover and colour transitions (about 150ms), a 200ms drawer slide, a 160ms modal fade and toast entry. `prefers-reduced-motion` turns all of it off. Nothing pulses or flashes. The only continuously moving element is the spinner shown while data is loading.
- **Touch targets** grow to 44px on coarse pointers (phones and tablets).

### 24.3 Information hierarchy in the queue

- **Column order follows the agent's questions:** priority → what & who → SLA → status → owner. The **title** is the heaviest text, and the **SLA** is the only column that changes colour.
- **Overdue is shown three ways, never by colour alone:**
  - a 3px red left edge;
  - an alarm icon;
  - the words "Overdue by 2h 10m".

  A red background tint was removed on purpose.
- **Rows are grouped into sections** (*SLA breached*, *Within SLA*, *Resolved*), each with a one-line explanation of its order. The server returns the tiers already in order and contiguous, so grouping neighbouring rows never changes the order. Each group is a separate `<ol start=…>`, which keeps queue positions correct.
- **The top ticket on page 1** gets a **Next** marker (only if it is unresolved).
- **The priority signal** (four bars, filled up to the level) encodes the level by shape as well as colour.
- **Auto-escalation** appears as a compact violet ↗ marker, with "×N" when it happened more than once. The full sentence ("Priority raised automatically 2 times after the SLA was breached, most recently …") is in its tooltip and in the row's accessible name. The drawer repeats it as a callout: *"Automatically escalated due to SLA breach"*.
- **Summary metrics** come from the same `/api/tickets/summary` call. The server added `active`, `urgent` and `dueSoon` counts, the last using a 30-minute window that matches the client's due-soon styling. "Open tickets" and "SLA breached" can be clicked to apply the matching filters, and show a selected state while those filters are active.
- **On narrow screens** the row reflows rather than shrinking:
  - priority and SLA on the first line;
  - a two-line title;
  - customer and reference;
  - status and owner.

  Secondary columns and the relative creation time are dropped. At 375px wide there is no horizontal scrolling.

### 24.4 Interaction

- **The drawer is organised by task:**
  - identity (reference, title, customer);
  - SLA panel;
  - escalation callout;
  - **properties** (priority, status and assignee as inline selects that save immediately, plus "Assign to me", "Start work" and "Resolve"/"Reopen");
  - description editing;
  - a clearly separated delete section with a two-step confirmation.

  Priority changes explain that they reset the SLA deadline.
- **Updates are not optimistic** (§17). Buttons and selects are disabled while a request is running and a "Saving…" status appears. Toasts name the exact change.
- **The create form** is grouped into Customer / Ticket details / Priority & SLA / Assignment:
  - priority is a radio-card group that shows each SLA window;
  - errors appear under the field in question, focus moves to the first invalid field, and there is a character counter;
  - the actions stay visible at the bottom while scrolling.
- **Search:** <kbd>/</kbd> focuses it from anywhere, unless the user is typing or a dialog is open, and <kbd>Esc</kbd> clears it. A key hint is shown until the user types. Search waits 300 ms after typing stops and still runs on the server, as before.
- **Background refresh** stays silent: the list keeps its scroll position, and a new filter dims the old rows instead of blanking them.
- **Focus after closing the drawer.** The native `<dialog>` normally returns focus to the row that opened it. If that row was re-rendered or filtered out (for example after resolving), focus goes to the ticket's current row, or to the queue heading, never to `<body>`.

### 24.5 Verification

A headless-browser script (Playwright, kept out of the repository) runs 41 checks against the production build with reduced motion enabled:
- the loading skeleton;
- summary numbers match the API;
- ordering and section grouping, and escalation markers;
- the <kbd>/</kbd> and <kbd>Esc</kbd> shortcuts, search, and each empty state;
- clicking a metric applies its filter;
- the overdue, assigned-to-me (including switching agent), unassigned and status filters;
- pagination and page size;
- create-form validation and focus handling, then creating a ticket;
- reaching a row with Tab, with a visible focus ring;
- priority, assignment, "Assign to me", start, edit, resolve and reopen, and delete, each confirmed through the API;
- the refresh error banner, and recovery through Retry;
- focus handling when the drawer closes;
- no horizontal scrolling at 375px;
- **axe-core WCAG 2.2 AA with zero violations** on the queue, the create dialog, the drawer and the mobile layout.

**Dark mode was deliberately not added.** The tokens are semantic, so a dark theme would be a token override. It would need its own contrast check (§24.2) before shipping, and the assessment prioritised one polished theme.
