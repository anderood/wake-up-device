# AGENTS.md

## Project Shape
- The Express 5 entrypoint is `server.ts`; web routes mount at `/` from `src/router/web.ts`, and API routes mount at `/api` from `src/router/routes.ts`.
- This is ESM TypeScript (`"type": "module"`, `module: "nodenext"`) executed directly by Node. Keep explicit `.ts` extensions in relative imports.
- EJS is configured with `src/views/` as the views directory. The home views are currently mixed: `index.ejs` and `add.ejs` are rendered, while `edit.html` is sent as a static file.
- The server listens on port `3000`. `APP_PORT` only changes the host port published by Docker Compose.

## Commands
- Install dependencies with `npm install`; `package-lock.json` is present.
- Run locally with Node.js 23.6 or newer using `npm run dev` (nodemon) or `npm start`.
- Start the complete app and MySQL stack with `docker compose up --build`; stop it with `docker compose down`.
- Apply pending Umzug migrations with `npm run db:migrate`. Docker Compose runs them automatically before starting the app service.
- Use `npx tsc --noEmit` for type checking.
- `npm test` is a placeholder and exits with an error; do not use it as verification.

## Routing And Forms
- `server.ts` enables `express.urlencoded({ extended: false })` for HTML forms, but not `express.json()` for JSON request bodies.
- `GET /` queries active devices (`status: 1`), and `GET /add/create` renders the create form.
- `POST /add` validates and normalizes form values, creates a device through Sequelize, and redirects to `/?created=1` on success.
- `GET /device` (`show`) and `PUT /device/:id/update` are placeholders that return `501`. `GET /device/:id/edit` still serves static sample data.
- `DELETE /device/:id` permanently deletes a device and returns `204`; the index calls it with browser-side `fetch` after confirmation.
- HTML forms cannot submit `PUT` or `DELETE` directly. The current edit form posts to `/device/1/update`, which does not match the router's `PUT` method; use client-side requests, method override, or coordinated route changes when implementing it.
- The API currently exposes only `GET /api`, which returns a welcome JSON message.

## Data Layer
- Sequelize/MySQL is configured in `src/database/database.ts`, and `src/models/device.ts` is used by the home index, create, and delete flows.
- Device fields are `id`, `name`, `type`, `location`, `external_url`, `mac_address`, and `status`; MAC addresses are unique.
- Umzug migrations live in `src/database/migrations/` and are run by `src/database/migrate.ts`.
- `docker/mysql/init.sql` creates the baseline `devices` table for a new Docker volume; migrations must remain safe when that baseline already contains migrated columns or indexes.
- `.env` is ignored. Use `.env.example` for `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PORT`, and the Compose-only `APP_PORT`.

## Views
- `index.ejs` renders database-backed device cards and includes a confirmation dialog for permanent deletion. Devices with an `external_url` receive an external action; the Wake-on-LAN action remains disabled and is not implemented.
- `add.ejs` contains the create form, displays server-side validation errors, preserves submitted values, and toggles the optional external URL with inline JavaScript.
- `edit.html` is still a static form with hard-coded sample values and no working submission path.
- Styles and browser scripts are inline in the views; there is no frontend build pipeline or static asset setup.
