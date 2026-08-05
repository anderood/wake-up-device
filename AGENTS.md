# AGENTS.md

Technical repository context and implementation constraints for AI coding
agents working on Wake Up Device.

## Application Stack

- Runtime: Node.js 23.6 or newer; the Docker image uses Node.js 24 Alpine.
- Language: strict TypeScript executed directly by Node in ESM mode.
- Web framework: Express 5.
- Server-rendered UI: EJS templates with native HTML forms.
- Browser layer: inline vanilla JavaScript and CSS inside the EJS views. There
  is no frontend framework, static asset pipeline, bundler, or CSS framework.
- Database: MySQL 8.4 through Sequelize 6 and the `mysql2` driver.
- Migrations: Umzug with Sequelize storage.
- Network operations: `wake_on_lan` for UDP magic packets and the system `ping`
  command through Node's `execFile`.
- Local orchestration: Docker Compose with separate `app`, `migrate`, and
  `database` services.

## TypeScript And Module Rules

- The project uses `"type": "module"` and TypeScript `module: "nodenext"`.
- Keep explicit `.ts` extensions in relative imports.
- `tsconfig.json` enables strict checking, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, and `noEmit`.
- Use `import type` for type-only imports.
- Node executes source `.ts` files directly; there is no compilation output.

## Project Structure

- `server.ts`: Express entrypoint, EJS configuration, form body parser, route
  mounting, and port `3000` listener.
- `src/router/web.ts`: browser-facing routes mounted at `/`.
- `src/router/routes.ts`: API routes mounted at `/api`.
- `src/controllers/home.controller.ts`: device CRUD, validation, Wake-on-LAN,
  and ping request handling.
- `src/controllers/api.controller.ts`: current API welcome response.
- `src/models/device.ts`: Sequelize model for the `devices` table.
- `src/database/database.ts`: Sequelize/MySQL connection from environment
  variables.
- `src/database/migrate.ts`: Umzug runner.
- `src/database/migrations/`: incremental schema migrations.
- `src/services/wake-on-lan.ts`: Promise wrapper around the CommonJS
  `wake_on_lan` package.
- `src/services/ping.ts`: validated IPv4 ping execution and in-flight request
  reuse.
- `src/views/home/index.ejs`: device cards and browser-side wake, ping, and
  delete flows.
- `src/views/home/add.ejs`: create form.
- `src/views/home/edit.ejs`: edit form.
- `docker/mysql/init.sql`: baseline schema used only when a new MySQL volume is
  initialized.
- `compose.yaml`: application, migration, and MySQL service definitions.

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

There is no CSV import route, file upload middleware, JSON API for device CRUD,
or soft-delete behavior.

## Forms And Rendering

- Forms are rendered on the server with EJS and submitted as
  `application/x-www-form-urlencoded` requests.
- Create and edit views duplicate their markup and inline script; there is no
  shared form partial at present.
- Form fields appear in this order: `name`, `type`, `location`, `ipAddress`,
  `hasExternalLink`, then the conditional `externalUrl` or `macAddress` field.
- `hasExternalLink` uses string values `yes` and `no`.
- When `hasExternalLink` is `yes`, browser JavaScript displays and requires
  `externalUrl`, while hiding and disabling `macAddress`.
- When `hasExternalLink` is `no`, browser JavaScript displays and requires
  `macAddress`, while hiding and disabling `externalUrl`.
- Disabled conditional inputs are not submitted. Server validation must remain
  authoritative and must not rely only on HTML attributes or browser scripts.
- Validation errors render the same form with HTTP `422`, an error message, and
  the submitted values preserved.
- The controller trims all form strings and maps camelCase form names to
  snake_case database columns.
- Names and types are required with a maximum length of 20. Location is required
  with a maximum length of 50.
- An optional IP must be a valid IPv4 address.
- MAC addresses accept colon or hyphen separators, are normalized to uppercase
  colon notation, and must match `AA:BB:CC:DD:EE:FF`.
- External URLs have a maximum length of 2048 and must use HTTP or HTTPS.
- Application validation enforces one destination mode: a device stores either
  an external URL or a MAC address according to `hasExternalLink`.

## Database Schema

The application currently uses one table, `devices`:

| Column | Baseline SQL type | Null | Default and constraints | Application meaning |
| --- | --- | --- | --- | --- |
| `id` | `INT UNSIGNED` | No | Primary key, auto increment | Device identifier |
| `name` | `VARCHAR(20)` | No | None | Required display name |
| `type` | `VARCHAR(20)` | Yes | None | Required by controller validation |
| `location` | `VARCHAR(50)` | No | `Nao informado` | Required device location |
| `external_url` | `VARCHAR(2048)` | Yes | None | HTTP/HTTPS destination for external items |
| `mac_address` | `VARCHAR(20)` | Yes | Unique when non-null | Wake-on-LAN destination |
| `ip_address` | `VARCHAR(15)` | Yes | None | Optional IPv4 used for reachability checks |
| `status` | `TINYINT` | No | `1` | Only rows with value `1` are listed and editable |

Important schema behavior:

- The database does not have a check constraint enforcing the external URL/MAC
  choice; this invariant is enforced in `validateDeviceForm`.
- Multiple `NULL` MAC values are allowed by MySQL's unique index behavior.
- The Sequelize model disables `createdAt` and `updatedAt`; the table has no
  timestamp columns.
- Deletion is permanent even though a `status` column exists.
- `docker/mysql/init.sql` defines the latest baseline for new volumes. Every
  schema change must also have an Umzug migration for existing databases.
- Migrations must inspect existing columns or indexes when needed so they are
  safe against a baseline that already includes the target schema.

## Wake-on-LAN And Ping

- Wake and ping targets must always be loaded from the database. Never accept an
  arbitrary MAC or IP target directly from a request body.
- `wakeDevice` sends to `WOL_BROADCAST_ADDRESS`, defaulting to
  `255.255.255.255`. A directed broadcast such as `192.168.1.255` is preferred
  because the default may remain inside Docker's bridge network.
- A successful wake response confirms only packet transmission, not that the
  target powered on.
- The wake endpoint reports whether ping confirmation is available from the
  stored optional IPv4 address.
- The browser polls the ping endpoint every two seconds for up to 60 seconds.
- `pingIpv4` validates the address before invoking `ping -c 1 -W 1`, applies a
  two-second process timeout, and reuses an in-flight check for the same address.
- Missing ping responses are not definitive because a device may block ICMP.
- Local development requires the `ping` command. The Docker image installs it
  through Alpine's `iputils` package.

## View Behavior

- `index.ejs` displays only database-backed device values escaped by EJS.
- External devices omit MAC details and receive an `Acessar` link with
  `target="_blank"` and `rel="noopener noreferrer"`.
- MAC devices receive a `Ligar` button and optional online confirmation through
  ping polling.
- Permanent deletion uses browser `fetch` after a confirmation dialog.
- Keep pages functional on desktop and mobile and preserve the existing visual
  language unless a redesign is explicitly requested.

## Environment And Docker

- `.env` is ignored. Use `.env.example` as the variable reference.
- Database variables are `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`,
  and `DB_PORT`.
- `WOL_BROADCAST_ADDRESS` configures the Wake-on-LAN broadcast target.
- `APP_PORT` is consumed only by Docker Compose to publish container port
  `3000`; it does not change the Express listener.
- Compose waits for MySQL health and successful migrations before starting the
  application service.

## Commands And Verification

- Install dependencies: `npm install`.
- Run with reload: `npm run dev`.
- Run without reload: `npm start`.
- Start app and MySQL: `docker compose up --build`.
- Stop containers: `docker compose down`.
- Apply migrations: `npm run db:migrate`.
- Type-check: `npx tsc --noEmit`.
- `npm test` is a placeholder that exits with an error. Do not use it as a
  successful verification command.
- For EJS changes, render the affected template with representative values or
  exercise the relevant page in addition to type-checking.

## Security Constraints

- The application has no authentication, authorization, rate limiting, or CSRF
  protection. It must remain restricted to a trusted network unless those
  controls are added.
- Continue using parameterized Sequelize operations rather than constructing SQL
  from request values.
- Keep external links restricted to HTTP and HTTPS.
- Validate route IDs and all network addresses on the server.
