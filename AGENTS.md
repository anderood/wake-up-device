# AGENTS.md

## Project Shape
- The Express 5 entrypoint is `server.ts`; web routes mount at `/` from `src/router/web.ts`, and API routes mount at `/api` from `src/router/routes.ts`.
- This is ESM TypeScript (`"type": "module"`, `module: "nodenext"`) executed directly by Node. Keep explicit `.ts` extensions in relative imports.
- EJS is configured with `src/views/` as the views directory. The home views are `index.ejs`, `add.ejs`, and `edit.ejs`.
- The server listens on port `3000`. `APP_PORT` only changes the host port published by Docker Compose.

## Commands
- Install dependencies with `npm install`; `package-lock.json` is present.
- Run locally with Node.js 23.6 or newer using `npm run dev` (nodemon) or `npm start`.
- Start the complete app and MySQL stack with `docker compose up --build`; stop it with `docker compose down`.
- Apply pending Umzug migrations with `npm run db:migrate`. Docker Compose runs them automatically before starting the app service.
- Use `npx tsc --noEmit` for type checking.
- `npm test` is a placeholder and exits with an error; do not use it as verification.
- Local development requires a `ping` command for device reachability checks. The Docker image installs `iputils`.

## Routing And Forms
- `server.ts` enables `express.urlencoded({ extended: false })` for HTML forms, but not `express.json()` or multipart parsing.
- `GET /` queries active devices (`status: 1`), and `GET /add/create` renders the create form.
- `POST /add` validates and normalizes form values, creates a device through Sequelize, and redirects to `/?created=1` on success.
- `GET /device/:id/edit` loads an active device into `edit.ejs`. The HTML form submits to `POST /device/:id/update`, which validates and updates the record before redirecting to `/?updated=1`.
- `POST /device/:id/wake` sends a Wake-on-LAN packet and returns JSON indicating whether ping confirmation is available.
- `POST /device/:id/ping` checks the configured IPv4 address and returns `{ online: boolean }`.
- `DELETE /device/:id` permanently deletes a device and returns `204`; the index calls it with browser-side `fetch` after confirmation.
- `GET /device` (`show`) remains a placeholder that returns `501`.
- The API currently exposes only `GET /api`, which returns a welcome JSON message.
- There is currently no CSV import route, upload middleware, or multipart parser.

## Data Layer
- Sequelize/MySQL is configured in `src/database/database.ts`, and `src/models/device.ts` backs the web device flows.
- Device fields are `id`, `name`, `type`, `location`, `external_url`, `mac_address`, `ip_address`, and `status`; MAC addresses are unique.
- `ip_address` is an optional IPv4 address used only to confirm reachability after Wake-on-LAN.
- Create and update share server-side validation for required fields, lengths, MAC normalization, optional IPv4, and HTTP/HTTPS external URLs.
- Umzug migrations live in `src/database/migrations/` and are run by `src/database/migrate.ts`.
- `docker/mysql/init.sql` creates the baseline `devices` table for a new Docker volume; migrations must remain safe when that baseline already contains migrated columns or indexes.
- `.env` is ignored. Use `.env.example` for `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PORT`, `WOL_BROADCAST_ADDRESS`, and the Compose-only `APP_PORT`.

## Wake-on-LAN And Ping
- `src/services/wake-on-lan.ts` wraps the CommonJS `wake_on_lan` package in a Promise and sends to `WOL_BROADCAST_ADDRESS`, defaulting to `255.255.255.255`.
- Prefer a directed LAN broadcast such as `192.168.1.255`. The default broadcast may remain inside Docker's bridge network.
- A successful Wake-on-LAN response confirms only that UDP packets were sent; it does not prove that the device powered on.
- `src/services/ping.ts` invokes `ping` with `execFile`, validates IPv4 before execution, and reuses an in-flight check for the same address.
- The browser polls the ping route every two seconds for up to 60 seconds. No ping response is not definitive because devices may block ICMP.

## Views
- `index.ejs` renders database-backed device cards and includes browser-side Wake-on-LAN, ping polling, and permanent deletion flows.
- Devices with an `external_url` receive an `Acessar` action. Devices without one receive the `Ligar` action.
- `add.ejs` and `edit.ejs` display server-side validation errors, preserve submitted values, accept an optional IPv4 address, and toggle the optional external URL with inline JavaScript.
- Styles and browser scripts are inline in the views; there is no frontend build pipeline or static asset setup.

## Security
- The application currently has no authentication, authorization, or CSRF protection. Keep it restricted to a trusted network unless those controls are added.
- Network actions must use only validated values loaded from the database; do not accept arbitrary ping or Wake-on-LAN targets directly from request bodies.
