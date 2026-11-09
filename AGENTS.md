# AGENTS.md

Technical repository context and implementation constraints for AI coding
agents working on Wake Up Device. Treat this file as the authoritative,
current technical contract for implementation decisions, validation steps, and
project-specific constraints. Keep it synchronized with the codebase when forms,
routes, schema, runtime behavior, or verification commands change.

## Application Stack

- Runtime: Node.js 23.6 or newer; the Docker image uses Node.js 24 Alpine.
- Language: strict TypeScript executed directly by Node in ESM mode.
- Web framework: Express 5.
- Server-rendered UI: EJS templates with native HTML forms.
- Browser layer: inline vanilla JavaScript and CSS inside the EJS views, plus
  Font Awesome Free CSS and webfonts served from the installed package. There is
  no frontend framework, static asset pipeline, bundler, or CSS framework.
- Database: SQLite through Sequelize 6 and the native `sqlite3` driver.
- Migrations: Umzug with Sequelize storage.
- Network operations: `wake_on_lan` for UDP magic packets and the system `ping`
  command through Node's `execFile`.
- Local orchestration: Docker Compose with separate `app` and `migrate` services
  sharing one persistent SQLite volume.
- EC2 automation worker: Python 3.11+ package under `worker/`, invoked by a
  systemd timer and sharing the SQLite file with the Node process.

## TypeScript And Module Rules

- The project uses `"type": "module"` and TypeScript `module: "nodenext"`.
- Keep explicit `.ts` extensions in relative imports.
- `tsconfig.json` enables strict checking, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, and `noEmit`.
- Use `import type` for type-only imports.
- Node executes source `.ts` files directly; there is no compilation output.

## Project Structure

- `server.ts`: Express entrypoint, EJS configuration, Font Awesome static asset
  mounts, SQLite-backed sessions, OIDC/CSRF middleware, route mounting, and the
  `APP_PORT` listener.
- `src/router/web.ts`: browser-facing routes mounted at `/`.
- `src/router/ec2.ts`: protected EC2 automation routes mounted at `/ec2`.
- `src/router/routes.ts`: API routes mounted at `/api`.
- `src/controllers/home.controller.ts`: device CRUD, validation, local and
  external access URL generation, Wake-on-LAN, and ping request handling.
- `src/controllers/api.controller.ts`: current API welcome response.
- `src/models/device.ts`: Sequelize model for the `devices` table.
- `src/models/ec2-*.ts`: Sequelize models for EC2 configuration, transitions,
  schedules, runs, and OIDC sessions.
- `src/auth/`: PKCE OIDC login/callback, SQLite session store, and synchronizer
  token CSRF protection.
- `src/controllers/ec2.controller.ts`: protected configuration, schedule,
  manual action enqueueing, and run-history handling.
- `src/services/aws-regions.ts`: offline AWS partition/region allowlist loader.
- `src/database/database.ts`: Sequelize/SQLite connection using `DB_STORAGE`.
- `src/database/migrate.ts`: Umzug runner.
- `src/database/migrations/`: schema migrations, including initial table
  creation for an empty SQLite file.
- `src/services/wake-on-lan.ts`: Promise wrapper around the CommonJS
  `wake_on_lan` package.
- `src/services/ping.ts`: validated IPv4 ping execution and in-flight request
  reuse.
- `src/views/home/index.ejs`: device cards and browser-side wake, ping, and
  delete flows.
- `src/views/home/add.ejs`: create form.
- `src/views/home/edit.ejs`: edit form.
- `src/views/ec2/index.ejs`: protected EC2 configuration, schedules, actions,
  and audit history.
- `worker/src/ec2_worker/`: independent Python scheduler, repository, gateway,
  and executor process.
- `deploy/`: systemd service and timer units for the web process and worker.
- `compose.yaml`: application and migration service definitions plus the shared
  SQLite volume.

## HTTP And Routing Contracts

- `server.ts` enables `express.urlencoded({ extended: false })` for HTML form
  submissions. It does not enable `express.json()` or multipart parsing.
- `GET /`: list active devices where `status = 1`.
- `GET /add/create`: render the create form.
- `POST /add`: validate and create a device, then redirect to `/?created=1`.
- `GET /device/:id/edit`: load an active device and render the edit form.
- `POST /device/:id/update`: validate and update an active device, then redirect
  to `/?updated=1`.
- `POST /device/:id/wake`: send a Wake-on-LAN packet and return JSON.
- `POST /device/:id/ping`: ping the stored IPv4 address and return
  `{ online: boolean }`.
- `DELETE /device/:id`: permanently delete a device and return `204`.
- `GET /device`: placeholder endpoint that returns `501`.
- `GET /api`: return the current welcome JSON response.
- `GET /auth/login`: begin OIDC Authorization Code + PKCE login.
- `GET /auth/callback`: validate the OIDC callback and establish the session.
- `POST /auth/logout`: destroy the server-side session; CSRF protected.
- `GET /ec2`: protected EC2 configuration, schedules, actions, and run history.
- `POST /ec2/config`: protected singleton configuration update.
- `POST /ec2/schedules`: protected schedule creation/update.
- `POST /ec2/schedules/:id/delete`: protected schedule deletion.
- `POST /ec2/actions`: protected manual `start`, `stop`, or `inspect` enqueue.
  It requires a UUID `requestId`, supports `real` and `simulation`, and never
  calls AWS during the HTTP request.
- `GET /ec2/runs`: protected JSON audit history.

All `/ec2` routes require an authenticated OIDC session. All new state-changing
POST routes require a synchronizer-token CSRF token.

There is no CSV import route, file upload middleware, JSON API for device CRUD,
or soft-delete behavior.

## Forms And Rendering

- Forms are rendered on the server with EJS and submitted as
  `application/x-www-form-urlencoded` requests.
- Create and edit views duplicate their markup and inline script; there is no
  shared form partial at present.
- The form is grouped into three bordered sections separated by a bottom border:
  `Identificação` (name and type), `Wake-on-LAN` (the wake toggle and MAC), and
  `Acesso` (the access toggle, local IP, external IP, and port).
- Form fields appear in this order: `name`, `type`, the `enableWake` toggle,
  `macAddress` when wake is enabled, the `enableAccess` toggle,
  `localIpAddress`, `externalIpAddress`, and then `accessPort` when access is
  enabled.
- The `enableWake` and `enableAccess` checkboxes are hidden inputs styled as
  switch toggles labeled `Ativado` and `Porta configurada`.
- The `Ativado` toggle controls whether the MAC field is enabled and submitted.
  When it is unchecked, the server ignores and clears `macAddress`.
- The `Porta configurada` toggle controls only whether the access port field is
  enabled and submitted. When it is unchecked, the server ignores and clears
  only `accessPort`.
- Local IP, external IP, and MAC are independent and optional.
- Browser JavaScript requires `accessPort` when access is enabled. Server
  validation remains authoritative and enforces the same relationship.
- Validation errors render the same form with HTTP `422`, an error message, and
  the submitted values preserved.
- The controller trims all form strings and maps camelCase form names to
  snake_case database columns.
- Names and types are required with a maximum length of 20.
- Optional local and external addresses must be valid IPv4 addresses.
- The shared access port must be an integer from 1 to 65535 and is required
  when the access port checkbox is enabled. IP addresses can be stored without a
  port, but access links are generated only when an IP and port are both stored.
- MAC addresses accept colon or hyphen separators, are normalized to uppercase
  colon notation, and must match `AA:BB:CC:DD:EE:FF`.
- A device may store any combination of MAC, local IPv4, and external IPv4.

## Database Schema

The application uses the existing `devices` table plus `auth_session`,
`ec2_config`, `ec2_transition`, `ec2_schedule`, and `ec2_run`:

| Column | SQLite type | Null | Default and constraints | Application meaning |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | Primary key, auto increment | Device identifier |
| `name` | `VARCHAR(20)` | No | None | Required display name |
| `type` | `VARCHAR(20)` | Yes | None | Required by controller validation |
| `mac_address` | `VARCHAR(20)` | Yes | Unique when non-null | Wake-on-LAN destination |
| `ip_address` | `VARCHAR(15)` | Yes | None | Local IPv4 used for access and reachability checks |
| `external_ip_address` | `VARCHAR(15)` | Yes | None | External IPv4 used for access |
| `access_port` | `INTEGER` | Yes | None | Shared TCP port for local and external access links |
| `status` | `INTEGER` | No | `1` | Only rows with value `1` are listed and editable |

Important schema behavior:

- The database does not have check constraints for the IP/port relationship;
  this invariant is enforced in `validateDeviceForm`.
- Multiple `NULL` MAC values are allowed by SQLite's unique index behavior.
- The Sequelize model disables `createdAt` and `updatedAt`; the table has no
  timestamp columns.
- Deletion is permanent even though a `status` column exists.
- The initial Umzug migration creates the complete schema in an empty SQLite
  file. Every later schema change must have another migration.
- Removed columns, such as the former `location` column, must be removed through
  migrations and removed from the Sequelize model, controller, views, and search
  behavior together.
- SQLite has limited `ALTER TABLE` support. Test migrations that change or
  remove columns because Sequelize may rebuild the table internally.
- The SQLite file must remain on persistent storage. The Docker `app` and
  `migrate` services must always mount the same volume and storage path.
- `ec2_config` is a singleton row with `id = 1` and fixed timezone
  `America/Sao_Paulo`.
- `ec2_run` is the immutable audit ledger with unique idempotency and automatic
  occurrence keys. `unknown` and `interrupted` runs are never overwritten.
- `ec2_transition` blocks concurrent real mutations until a definitive inspect
  run releases the gate.
- The EC2 migration is `20261108150000-add-ec2-automation.ts` and must be run
  before starting the web process or worker.

## Wake-on-LAN And Ping

- Wake and ping targets must always be loaded from the database. Never accept an
  arbitrary MAC or IP target directly from a request body.
- `wakeDevice` sends to `WOL_BROADCAST_ADDRESS`, defaulting to
  `255.255.255.255`. A directed broadcast such as `192.168.1.255` is preferred
  because the default may remain inside Docker's bridge network.
- A successful wake response confirms only packet transmission, not that the
  target powered on.
- The wake endpoint reports whether ping confirmation is available from the
  stored optional local IPv4 address.
- The browser polls the ping endpoint every two seconds for up to 60 seconds.
- `pingIpv4` validates the address before invoking `ping -c 1 -W 1`, applies a
  two-second process timeout, and reuses an in-flight check for the same address.
- Missing ping responses are not definitive because a device may block ICMP.
- Local development requires the `ping` command. The Docker image installs it
  through Alpine's `iputils` package.

## View Behavior

- `index.ejs` displays only database-backed device values escaped by EJS.
- Search filters active devices by `name` and `type` only.
- Cards independently show Font Awesome icon actions for `Ligar` when a MAC is
  available, `Local` for a local IP and port, `Externo` for an external IP and
  port, and `Editar` for every device.
- Cards display the device type plus optional MAC, local IPv4, external IPv4,
  and access port values when they exist.
- Access links use `http://IP:port`, `target="_blank"`, and
  `rel="noopener noreferrer"`.
- Icon-only actions keep descriptive `aria-label` and `title` attributes. The
  wake icon changes from `fa-power-off` to an animated `fa-spinner` while the
  request and optional ping polling are in progress.
- MAC devices receive optional online confirmation through local-IP ping polling.
- Permanent deletion uses browser `fetch` after a confirmation dialog.
- Keep pages functional on desktop and mobile and preserve the existing visual
  language unless a redesign is explicitly requested.

## Environment And Docker

- `.env` is ignored. Use `.env.example` as the variable reference.
- `DB_STORAGE` configures the SQLite file path and defaults locally to
  `wake-up-device.sqlite`.
- `WOL_BROADCAST_ADDRESS` configures the Wake-on-LAN broadcast target.
- `SESSION_SECRET`, `SESSION_COOKIE_SECURE`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI` configure the protected web
  login.
- `AWS_REGION_FILE` points both processes at `config/aws-ec2-regions.json`.
- `WORKER_TIMEZONE`, `WORKER_MAX_RUNS_PER_TICK`, and `WORKER_READ_RETRIES`
  configure the Python worker; the worker requires an absolute `DB_STORAGE`.
- The Docker `app` service runs with `network_mode: host` so Wake-on-LAN
  broadcasts leave the host's network interface directly instead of staying
  inside Docker's bridge network. It listens on host port `3000`.
- Compose stores `/data/wake-up-device.sqlite` in the `sqlite-data` volume and
  waits for successful migrations before starting the application service.

## Commands And Verification

- Install dependencies: `npm install`.
- Run with reload: `npm run dev`.
- Run without reload: `npm start`.
- Start the containerized app: `docker compose up --build`.
- Stop containers: `docker compose down`.
- Apply migrations: `npm run db:migrate`.
- Type-check: `npx tsc --noEmit`.
- Web contract tests: `npm run test:web`.
- Python syntax check: `python3 -m compileall -q worker/src worker/tests`.
- Python tests when pytest is installed: `pytest worker/tests -q`.
- `npm test` is a placeholder that exits with an error. Do not use it as a
  successful verification command.
- For EJS changes, render the affected template with representative values or
  exercise the relevant page in addition to type-checking.

## Security Constraints

- EC2 automation requires OIDC authentication, server-side SQLite sessions,
  PKCE, SameSite/Lax HttpOnly cookies, and CSRF tokens on state-changing forms.
- AWS credentials are used only by the worker and must never be accepted from
  HTTP requests or written to the audit ledger.
- The application still has no authorization roles or rate limiting and must
  remain restricted to a trusted network unless those controls are added.
- Continue using parameterized Sequelize operations rather than constructing SQL
  from request values.
- Validate route IDs and all network addresses on the server.
