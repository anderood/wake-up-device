# AGENTS.md

## Project Shape
- Express app entrypoint is `server.ts`; web routes mount at `/` from `src/router/web.ts`, API routes mount at `/api` from `src/router/routes.ts`.
- This is ESM TypeScript (`"type": "module"`, `module: "nodenext"`). Keep explicit relative extensions in imports, matching the existing `.ts` style.
- Web pages are static HTML files in `src/views/home/`; controllers serve them with `res.sendFile()` and `fileURLToPath(new URL(..., import.meta.url))`.
- There is no template engine configured. Do not assume EJS/Handlebars/etc.

## Commands
- Install dependencies with `npm install`; `package-lock.json` is present.
- Use `npx tsc --noEmit` for type checking.
- `npm test` is a placeholder and exits with an error; do not use it as verification.
- There is no `start` or `dev` script in `package.json`.

## Routing And Forms
- `HomeController` currently serves static views only; `store`, `update`, and `destroy` are placeholders.
- `server.ts` does not currently enable `express.json()` or `express.urlencoded()`, so POST form bodies will not be parsed until middleware is added.
- HTML forms cannot submit `PUT` or `DELETE` directly; existing `PUT /device/:id/update` and `DELETE /device/:id` routes need JS, method override, or route changes before real browser forms can use them.

## Data Layer
- Sequelize/MySQL files exist (`src/database/database.ts`, `src/models/device.ts`) but are not wired into controllers yet.
- `.env` is ignored; use `.env.example` for expected DB variable names.
- Database config loads `.env` with `dotenv` and uses the variable names from `.env.example`.

## Views
- Current home views are `index.html`, `add.html`, and `edit.html` under `src/views/home/`.
- Device data shown in HTML is currently static sample data, not database-backed.
