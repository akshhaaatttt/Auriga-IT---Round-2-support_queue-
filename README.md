# Support Queue

A helpdesk ticket queue that always puts the most pressing ticket at the top. The order is
recalculated from the current time on every request. A ticket that passes its SLA deadline
moves to the front of the queue without any write to the database.

Built for a two-person IT helpdesk ("The helpdesk is drowning"). There are too many tickets to
show at once, so the queue is filtered, sorted and paginated in the database.

---

## 1. Features

- **Dynamic priority queue**
  - Overdue tickets come first, ordered by how long they have been overdue.
  - On-time tickets follow, ordered by priority and then by time left on the SLA.
  - Creation time breaks any remaining ties.
- **Stored SLA deadlines.** Each deadline is saved when the ticket is created (Urgent 2h, Normal 24h, Low 24h), so past records don't change if the SLA policy changes.
- **Live SLA countdowns**: "Due in 31m", "Overdue by 2h 14m". Countdowns never show negative values.
- **Automatic re-ordering**
  - The client refreshes the queue every 30 seconds.
  - It also refreshes 1ms after the next SLA deadline, which the server reports with every response.
- **Filters**
  - Views: All, Overdue, Assigned to me, Unassigned.
  - Status: Active, All statuses, Open, In progress, Resolved.
  - Search: debounced, run on the server, matches customer name or ticket title.
- **Server-side pagination** with selectable page sizes (10 / 20 / 50 / 100).
- **Full CRUD**: create, edit, change priority, change status, reassign, "Assign to me", resolve, reopen, delete (with confirmation).
- **Current-agent selector**: a simple stand-in for authentication. The selection is saved in `localStorage`.
- **Summary counts**: Total, Overdue, Open, In progress, Resolved.
- **UI states**: loading skeletons, empty states, a no-search-results state, and error states with a retry button. If a background refresh fails, the page keeps the last loaded data and shows a banner.
- **Accessibility**
  - Native `<dialog>` for focus trapping and closing with Escape.
  - Every control has a label.
  - Priority and overdue state are shown with text and icons, not colour alone.
  - Responsive from phone to desktop.

## 2. Tech stack

| Layer    | Technology                                                               |
| -------- | ------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, lucide-react, date-fns      |
| Backend  | Node.js (≥ 22.12), Express 5, TypeScript, zod                            |
| Database | SQLite via better-sqlite3                                                |
| Testing  | Vitest (unit, SQL/TypeScript equivalence, HTTP integration)              |
| Tooling  | ESLint (typescript-eslint strict, react-hooks), npm workspaces, tsx      |

## 3. Architecture

```
React UI ──fetch /api──▶ Express routes ──▶ TicketService ──▶ TicketRepository ──▶ SQLite
 (hooks, components)     (validation)       (business rules)   (SQL, ORDER BY)
                                                  │
                                                  └──▶ sorting/priorityQueue.ts  (canonical, pure)
```

- **`server/src/sorting/priorityQueue.ts`** holds the business rule as pure functions. Every function receives the current time as an argument.
- **`server/src/repositories/queueOrderSql.ts`** repeats the same rule as an SQL `ORDER BY`, so ordering and pagination happen in the database. A test generates 1,500 random tickets and checks that the SQL order and the TypeScript order are identical at several points in time.
- **Services** hold the business logic: SLA calculation, agent checks, and recalculating the deadline when priority changes. **Routes** only validate input and pass it to a service. **Repositories** hold all SQL, always with bound parameters.
- The **client** calls the API only through `services/`. Data fetching and timers live in `hooks/`, and `components/` only render.

See [REASONING.md](REASONING.md) for the design decisions.

## 4. Prerequisites

- Node.js **22.12+** (developed on Node 24) and npm 10+.
- No database server is needed. SQLite runs inside the Node process.
- better-sqlite3 ships prebuilt binaries for Linux, macOS and Windows (x64 and arm64), so no C++ toolchain is needed on those platforms.

## 5. Installation

```bash
npm install
```

This installs the root, `server` and `client` workspaces in one step.

## 6. Environment variables

The server works without any configuration. You can optionally set these (see `server/.env.example`):

| Variable            | Default                  | Purpose                                                           |
| ------------------- | ------------------------ | ----------------------------------------------------------------- |
| `PORT`              | `3001`                   | API port                                                          |
| `DATABASE_PATH`     | `data/support_queue.db`  | SQLite file, relative to `server/` or absolute                    |
| `CORS_ORIGINS`      | *(empty)*                | Comma-separated origins allowed to call the API from other origins |
| `API_PROXY_TARGET`  | `http://localhost:3001`  | (client) Where the Vite dev server sends `/api` requests          |

Set them in the shell, for example `PORT=4000 npm start`. No `.env` file is loaded automatically, and no secrets are needed.

## 7. Database setup

The server runs the schema (`CREATE TABLE/INDEX IF NOT EXISTS`) on every start.
The database file is created at `server/data/support_queue.db`, which is git-ignored.

## 8. Seed data

If the database is **empty** when the server starts, it loads demo data automatically: 2 agents and 40 tickets. The ticket timestamps are relative to "now", so the demo always shows overdue tickets, tickets close to their deadline, and resolved tickets.

To reset the database to fresh demo data at any time:

```bash
npm run seed
```

## 9. Development

```bash
npm run dev
```

- API: http://localhost:3001 (restarts automatically on changes via `tsx watch`)
- UI: **http://localhost:5173** (Vite; `/api` is forwarded to the API)

## 10. Tests and checks

```bash
npm test          # server (Vitest: sorting, SLA, SQL equivalence, API) + client (time formatting)
npm run typecheck # strict tsc for server and client
npm run lint      # ESLint across the repository
```

## 11. Production build

```bash
npm run build     # compiles server to server/dist and client to client/dist
npm start         # serves the API and the built UI on http://localhost:3001
```

`npm start` serves `client/dist` from the same Express process, so a production deployment runs on a single port with no CORS setup.

## 12. Running in GitHub Codespaces

1. Open the repository in a Codespace.
2. Run:
   ```bash
   npm install
   npm run dev
   ```
3. Open the **Ports** tab and open port **5173** in the browser.
   - Only this port needs to be forwarded, because Vite sends `/api` requests to port 3001 inside the container.
   - `*.app.github.dev` hosts are already allowed in `vite.config.ts`.

For the production build in a Codespace, run `npm run build && npm start` and open port **3001**.

## 13. API overview

All responses are JSON. Errors use this shape:
`{ "error": { "code", "message", "details?": [{ "field", "message" }] } }`

| Method | Path                     | Description                                                           |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| GET    | `/api/health`            | Health check                                                          |
| GET    | `/api/tickets`           | Queue page, in priority order                                         |
| GET    | `/api/tickets/summary`   | Counts: total, overdue, open, in progress, resolved                   |
| POST   | `/api/tickets`           | Create a ticket (`201` + `Location` header)                           |
| GET    | `/api/tickets/:id`       | Get one ticket                                                        |
| PATCH  | `/api/tickets/:id`       | Partial update: status, priority, assignment, text fields            |
| DELETE | `/api/tickets/:id`       | Delete a ticket (`204`)                                               |
| GET    | `/api/agents`            | List agents                                                           |

`GET /api/tickets` query parameters:

| Param        | Example                   | Notes                                               |
| ------------ | ------------------------- | --------------------------------------------------- |
| `search`     | `laptop`                  | Case-insensitive substring of customer name or title |
| `overdue`    | `true` / `false`          | Evaluated at request time                           |
| `assignedTo` | `agent-priya`, `unassigned` |                                                   |
| `status`     | `OPEN,IN_PROGRESS`        | One or more, comma-separated                        |
| `page`       | `1`                       | Default 1                                           |
| `limit`      | `20`                      | Default 20, maximum 100                             |

Example response:

```json
{
  "tickets": [{ "id": "…", "title": "…", "priority": "URGENT", "status": "OPEN",
                "slaDeadline": "2026-09-16T11:44:00.000Z", "isOverdue": false, "…": "…" }],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 },
  "meta": { "serverTime": "2026-09-16T09:44:00.000Z", "nextQueueChangeAt": "2026-09-16T09:51:42.026Z" }
}
```

Example requests:

```bash
curl 'http://localhost:3001/api/tickets?search=laptop&overdue=true&page=1&limit=20'
curl -X POST http://localhost:3001/api/tickets -H 'Content-Type: application/json' \
  -d '{"customerName":"Acme","title":"Laptop will not boot","priority":"URGENT","assignedAgentId":"agent-priya"}'
curl -X PATCH http://localhost:3001/api/tickets/<id> -H 'Content-Type: application/json' \
  -d '{"status":"RESOLVED"}'
```

Status codes:
- `400`: validation error, malformed JSON, or unknown field.
- `404`: ticket or route not found.
- `500`: unexpected error. The response is generic; details are only logged on the server.

## 14. Project structure

```
.
├── README.md  REASONING.md  AI_LOGS.md
├── package.json            # npm workspaces + root scripts
├── eslint.config.js
├── server/
│   ├── src/
│   │   ├── app.ts                    # Express app factory (dependency-injected db + clock)
│   │   ├── server.ts                 # entry point: open db, seed if empty, listen
│   │   ├── config/                   # constants (SLA, priority rank, limits), env parsing
│   │   ├── db/                       # schema, connection, seed data, seeding, seed CLI
│   │   ├── domain/sla.ts             # SLA deadline calculation
│   │   ├── middleware/               # error handler, CORS allow-list
│   │   ├── models/                   # domain types, DTOs, error classes
│   │   ├── repositories/             # ticket/agent SQL, queue ORDER BY mirror
│   │   ├── routes/                   # thin HTTP handlers
│   │   ├── services/                 # business logic
│   │   ├── sorting/priorityQueue.ts  # canonical pure queue ordering
│   │   └── validation/               # zod schemas + validate helper
│   └── tests/                        # Vitest suites + helpers
└── client/
    ├── index.html  vite.config.ts
    └── src/
        ├── components/   # header, toolbar, list/rows, badges, drawer, dialogs, states
        ├── hooks/        # queue fetching + scheduled refresh, server clock, agents, toasts
        ├── pages/        # QueuePage
        ├── services/     # API client
        ├── types/        # API contract types
        └── utils/        # time/SLA formatting (tested), labels
```
