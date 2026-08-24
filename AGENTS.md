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
- Database: SQLite through Sequelize 6 and the native `sqlite3` driver.
- Migrations: Umzug with Sequelize storage.
- Network operations: `wake_on_lan` for UDP magic packets and the system `ping`
  command through Node's `execFile`.
- Local orchestration: Docker Compose with separate `app` and `migrate` services
  sharing one persistent SQLite volume.

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
  ping request handling, and external access URL generation.
- `src/controllers/settings.controller.ts`: global external IPv4 configuration.
- `src/controllers/api.controller.ts`: current API welcome response.
- `src/models/device.ts`: Sequelize model for the `devices` table.
- `src/models/app-setting.ts`: Sequelize model for global application settings.
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
- `src/views/settings/index.ejs`: global external IPv4 settings form.
- `compose.yaml`: application and migration service definitions plus the shared
  SQLite volume.

## HTTP And Routing Contracts

- `server.ts` enables `express.urlencoded({ extended: false })` for HTML form
  submissions. It does not enable `express.json()` or multipart parsing.
- `GET /`: list active devices where `status = 1`.
- `GET /settings`: render the global external IPv4 settings form.
- `POST /settings`: validate and persist the global external IPv4, then redirect
  to `/settings?updated=1`.
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
  `hasAccessLink`, then the conditional `localUrl` or `macAddress` field.
- `hasAccessLink` uses string values `yes` and `no`.
- When `hasAccessLink` is `yes`, browser JavaScript displays and requires
  `localUrl`, while hiding and disabling `macAddress`.
- When `hasAccessLink` is `no`, browser JavaScript displays and requires
  `macAddress`, while hiding and disabling `localUrl`.
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
- Local URLs have a maximum length of 2048 and must use HTTP or HTTPS.
- Application validation enforces one destination mode: a device stores either
  a local URL or a MAC address according to `hasAccessLink`.
- The settings form accepts only an IPv4 address without a protocol. The server
  validates it with `isIPv4`.

## Database Schema

The application uses the `devices` and `app_settings` tables.

The `devices` table:

| Column | SQLite type | Null | Default and constraints | Application meaning |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | No | Primary key, auto increment | Device identifier |
| `name` | `VARCHAR(20)` | No | None | Required display name |
| `type` | `VARCHAR(20)` | Yes | None | Required by controller validation |
| `location` | `VARCHAR(50)` | No | `Nao informado` | Required device location |
| `local_url` | `VARCHAR(2048)` | Yes | None | HTTP/HTTPS destination inside the local network |
| `mac_address` | `VARCHAR(20)` | Yes | Unique when non-null | Wake-on-LAN destination |
| `ip_address` | `VARCHAR(15)` | Yes | None | Optional IPv4 used for reachability checks |
| `status` | `INTEGER` | No | `1` | Only rows with value `1` are listed and editable |

Important schema behavior:

- The database does not have a check constraint enforcing the local URL/MAC
  choice; this invariant is enforced in `validateDeviceForm`.
- Multiple `NULL` MAC values are allowed by SQLite's unique index behavior.
- The Sequelize model disables `createdAt` and `updatedAt`; the table has no
  timestamp columns.
- Deletion is permanent even though a `status` column exists.
- The Umzug migrations create the complete schema in an empty SQLite file.
  Every later schema change must have another migration.
- SQLite has limited `ALTER TABLE` support. Test migrations that change or
  remove columns because Sequelize may rebuild the table internally.
- The SQLite file must remain on persistent storage. The Docker `app` and
  `migrate` services must always mount the same volume and storage path.

The `app_settings` table has a singleton row with `id = 1` and a required
`external_ip_address` column. No row exists until the settings form is saved.

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
- Access devices omit MAC details and receive a local link plus an external link
  when the global external IPv4 is configured. Both links use `target="_blank"`
  and `rel="noopener noreferrer"`.
- External links replace only the hostname of each local URL, preserving its
  HTTP/HTTPS protocol, port, path, query string, and fragment.
- MAC devices receive a `Ligar` button and optional online confirmation through
  ping polling.
- Permanent deletion uses browser `fetch` after a confirmation dialog.
- Keep pages functional on desktop and mobile and preserve the existing visual
  language unless a redesign is explicitly requested.

## Environment And Docker

- `.env` is ignored. Use `.env.example` as the variable reference.
- `DB_STORAGE` configures the SQLite file path and defaults locally to
  `wake-up-device.sqlite`.
- `WOL_BROADCAST_ADDRESS` configures the Wake-on-LAN broadcast target.
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
