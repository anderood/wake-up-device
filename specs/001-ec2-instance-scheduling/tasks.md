---

description: "Task list for EC2 instance scheduling"
---

# Tasks: Agendamento de Instancia EC2

**Input**: Design documents from `/specs/001-ec2-instance-scheduling/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Testing**: Test tasks are included because the specification requires independent scenario validation and the plan defines pytest, Stubber, SQLite integration, Node HTTP contract tests, TypeScript checking, rendering checks, latency/RSS checks, and a seven-day soak.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently after the shared foundation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the Python worker, explicit Node dependencies, shared region data, and test entry points.

- [ ] T001 Create `worker/pyproject.toml` with Python 3.11+, Boto3, botocore, pytest, package metadata, the `ec2_worker` source layout, and the `worker[test]` extra used by `quickstart.md`.
- [ ] T002 [P] Add `openid-client` v6, `express-session`, `@types/express-session`, and `csrf-sync` to `package.json`, and add a dedicated native Node web-contract command for `tests/ec2-web.contract.test.ts` without changing the existing `npm test` placeholder.
- [ ] T003 [P] Create `worker/src/ec2_worker/__init__.py`, `worker/tests/`, and `tests/ec2-web.contract.test.ts` with test fixtures that use an isolated SQLite path and never require real AWS credentials.
- [ ] T004 [P] Create `config/aws-ec2-regions.json` as the versioned regional allowlist containing only supported EC2 regional names and their AWS partitions, excluding Availability Zones, Local Zones, FIPS endpoints, and global endpoints.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the migration-defined shared schema, secure sessions, region validators, SQLite boundary, and protected routing required by every story.

**Critical**: No user story work can begin until this phase is complete.

- [ ] T005 Add `ec2_config` and `auth_session` to `src/database/migrations/20261108150000-add-ec2-automation.ts` with these constraints: `id` is a primary key and only value `1` is allowed; `instance_id` is an EC2 ID in the format `i-` followed by 8 or 17 hexadecimal characters; `region` is present in `config/aws-ec2-regions.json`, non-empty, and must correspond to the instance; `timezone` requires `America/Sao_Paulo`; `recovery_enabled` defaults to `0` and `1` processes all missed occurrences; `scheduler_cursor_utc` stores the last materialized calendar instant in ISO-8601 UTC; `revision` increments on every update; `updated_at` is ISO-8601 UTC; `sid` is a random unique identifier without identity data; `issuer` is the validated OIDC issuer; `subject` is the validated OIDC `sub` claim and not an email; `data` contains minimum session data and the CSRF token without access or refresh tokens; `created_at`, `last_access_at`, and `expires_at` are ISO-8601 UTC; expired sessions are rejected and removed.
- [ ] T006 Add `ec2_transition` to `src/database/migrations/20261108150000-add-ec2-automation.ts` with these constraints: `instance_id` is a unique required TEXT key for the controlled instance; `state` is required and limited to `active` or `needs_reconciliation`; `run_id` is the required real run holding the gate; `updated_at` is required ISO-8601 UTC; inspections and simulations do not acquire the gate; `unknown` and `interrupted` keep `needs_reconciliation` until a definitive inspection.
- [ ] T007 Add `ec2_schedule` to `src/database/migrations/20261108150000-add-ec2-automation.ts` with these constraints: `action` is `start` or `stop`; `weekday` is `1` Monday through `7` Sunday; `local_time` is strict `HH:MM` from `00:00` to `23:59`; `enabled` is `0` or `1` with default `1`; `updated_at` is ISO-8601 UTC; `UNIQUE(action, weekday)` prevents duplicate actions; at most one start and one stop schedule exist per day; local time uses `zoneinfo`, never a fixed offset.
- [ ] T008 Add `ec2_run` and its indexes to `src/database/migrations/20261108150000-add-ec2-automation.ts` with these constraints: `id` is an autoincrement primary key; `idempotency_key` is unique and uses `automatic:<schedule_id>:<scheduled-instant>` or a manual UUID; `occurrence_key` is a stable unique automatic key and null for manual runs; `source` is `automatic` or `manual`; `mode` is `real` or `simulation`; `action` is `start`, `stop`, or `inspect`; `instance_id` and `region` are required target snapshots; `config_revision` is required; `schedule_id`, `scheduled_date`, `scheduled_time`, `scheduled_at_utc`, `schedule_revision`, `actor_issuer`, `actor_subject`, and `reconciles_run_id` are nullable; `status` is one of `queued`, `running`, `requested`, `observed`, `noop`, `skipped`, `simulated`, `failed`, `interrupted`, `unknown`, or `conflict`; `claim_token` is nullable; `requested_at` is required ISO-8601 UTC; `started_at` and `finished_at` are nullable ISO-8601 UTC; `observed_state`, `result`, `error_code`, and `error_message` are nullable; `error_code` is limited to `network`, `auth`, `permission`, `not_found`, `throttled`, `timeout`, or `unknown`; `error_message` never contains tokens, secrets, headers, or credentials; `reconciles_run_id` links a new action to an immutable uncertain run or its inspection.
- [ ] T009 [P] Define Sequelize models in `src/models/ec2-config.ts`, `src/models/auth-session.ts`, `src/models/ec2-transition.ts`, `src/models/ec2-schedule.ts`, and `src/models/ec2-run.ts` matching the migration fields, logical relationships, status values, unique idempotency/occurrence keys, and snapshot/reconciliation invariants in `data-model.md`.
- [ ] T010 [P] Implement shared region loading and validation in `src/services/aws-regions.ts` and `worker/src/ec2_worker/regions.py`, reading `config/aws-ec2-regions.json`, rejecting unsupported partitions/endpoints, accepting supported opt-in regions, and never making a network request during form validation.
- [ ] T011 [P] Implement environment validation and SQLite connection handling in `worker/src/ec2_worker/config.py` and `worker/src/ec2_worker/db.py`, requiring absolute `DB_STORAGE`, `America/Sao_Paulo`, `busy_timeout`, local filesystem storage, and short parameterized transactions without reading or logging AWS secrets.
- [ ] T012 [P] Implement shared queue, cursor, transition-gate, session, and audit persistence primitives in `worker/src/ec2_worker/repository.py` using parameterized SQL and short `BEGIN IMMEDIATE` transactions; support idempotent `requestId`, automatic `occurrence_key`, claims, orphan interruption, immutable uncertain runs, `reconciles_run_id`, and gate release only after definitive inspection.
- [ ] T013 Implement OIDC discovery and callback validation in `src/services/oidc.ts` using `openid-client` v6, Authorization Code with PKCE S256, one-time state/nonce/verifier transactions, exact issuer/audience/azp/exp/iat/sub validation, fixed HTTPS callbacks, and no provider-token persistence.
- [ ] T014 Implement the Express-compatible Sequelize session Store in `src/services/session.ts` with `get`, `set`, `touch`, and `destroy`; persist only opaque session data, validated issuer/subject, CSRF state, timestamps, and expiry; regenerate the session after authentication and remove expired sessions without AWS access.
- [ ] T015 Implement authentication and CSRF middleware in `src/middleware/auth.ts` and `src/middleware/csrf.ts`; use secure HttpOnly SameSite=Lax Path=/ cookies, protect every POST/DELETE including logout and fetch actions, return `401` for protected JSON, redirect protected HTML to login, and return `403` for invalid CSRF.
- [ ] T016 Integrate login, callback, logout, session middleware, CSRF middleware, and protected web routing in `server.ts` and `src/router/web.ts`, preserving existing device routes and `express.urlencoded({ extended: false })`.
- [ ] T017 [P] Add empty-database, existing-database, migration-index, shared-region, Sequelize-to-Python, and session-token exclusion tests in `worker/tests/test_integration_sqlite.py`, proving existing `devices` data remains intact.

**Checkpoint**: The schema migrates safely, both runtimes share SQLite and region metadata, session/CSRF protection is active, and the queue/gate primitives are available.

---

## Phase 3: User Story 1 - Configurar instancia e horarios (Priority: P1) MVP

**Goal**: Let any authenticated operator save one valid EC2 configuration and weekly schedules using offline region validation, while preserving the last valid configuration after errors.

**Independent Test**: Authenticate, save a supported region and valid instance/schedule values, reload `/ec2`, then submit an unsupported region, invalid instance ID, invalid weekday, and invalid `HH:MM`; verify `422`, no AWS call, and preservation of the previous valid configuration.

### Tests for User Story 1

- [ ] T018 [P] [US1] Add repository tests in `worker/tests/test_repository.py` for singleton `id = 1`, revision increments, supported/unsupported region partitions, valid schedule persistence, `UNIQUE(action, weekday)`, strict weekday/time validation, and rejection without overwriting the valid configuration.
- [ ] T019 [P] [US1] Add authenticated web contract tests in `tests/ec2-web.contract.test.ts` for `GET /ec2`, `POST /ec2/config`, and `POST /ec2/schedules`, including escaped values, offline region rejection, HTTP 422, and no AWS/network dependency during save.

### Implementation for User Story 1

- [ ] T020 [US1] Implement configuration and schedule validation/upsert in `src/controllers/ec2.controller.ts`, enforcing the EC2 ID format, membership in `config/aws-ec2-regions.json`, `America/Sao_Paulo`, recovery `0`/`1`, weekday `1`-`7`, strict `HH:MM`, singleton `id = 1`, revision increment, and preservation of existing history.
- [ ] T021 [US1] Add `GET /ec2`, `POST /ec2/config`, and `POST /ec2/schedules` in `src/router/web.ts`, binding the authenticated actor and CSRF checks without accepting an arbitrary AWS target.
- [ ] T022 [US1] Create `src/views/ec2/index.ejs` with escaped configuration fields, supported-region selection, recovery toggle, weekday schedule controls, Portuguese-Brazilian validation messages, and an empty state that performs no AWS access.
- [ ] T023 [US1] Verify the configuration journey and EJS rendering using `tests/ec2-web.contract.test.ts`, `specs/001-ec2-instance-scheduling/quickstart.md`, `npx tsc --noEmit`, an empty SQLite database, and a database containing the existing `devices` table.

**Checkpoint**: A supported configuration and schedule are durable and available to the worker; invalid submissions cannot replace the valid configuration.

---

## Phase 4: User Story 2 - Executar a rotina automatica (Priority: P1)

**Goal**: Evaluate schedules every minute in `America/Sao_Paulo`, apply the safe EC2 state matrix once per occurrence, and process full ordered recovery only when enabled.

**Independent Test**: Use an injected clock and fake gateway for `stopped`, `running`, intermediate, final, and unknown states; verify one request per scheduled occurrence, no redundant request, durable audit, no replay by default, and complete ordered replay when enabled.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add timezone, day-boundary, minute-deduplication, cursor, and recovery-backlog tests in `worker/tests/test_scheduler.py`, including disabled-recovery cursor advancement and enabled-recovery materialization of every missed occurrence.
- [ ] T025 [P] [US2] Add state-matrix and transition-gate tests in `worker/tests/test_executor.py` for `stopped`/`start`, `running`/`stop`, desired-state `noop`, intermediate/final `skipped`, one real claim, `requested` gating, and no duplicate transition.
- [ ] T026 [P] [US2] Add Boto3 request/parameter, region, `DescribeInstances`, retry, timeout, and sanitized-error tests in `worker/tests/test_ec2_gateway.py` using `botocore.stub.Stubber` without contacting AWS.

### Implementation for User Story 2

- [ ] T027 [US2] Implement timezone-aware occurrence calculation, stable occurrence keys, cursor advancement, and ordered paginated replay in `worker/src/ec2_worker/scheduler.py` using `zoneinfo.ZoneInfo("America/Sao_Paulo")` and `scheduler_cursor_utc`.
- [ ] T028 [US2] Implement the Boto3 gateway in `worker/src/ec2_worker/ec2_gateway.py` so it validates the shared region, describes only the persisted instance/region, uses limited retries for reads, performs one transport attempt for mutations, maps stable error categories, and never logs credentials.
- [ ] T029 [US2] Implement the idempotent state executor in `worker/src/ec2_worker/executor.py` with pre-mutation inspection, the `data-model.md` transition matrix, no AWS client for simulation, transition-gate updates, and immutable `unknown`/`interrupted` outcomes without automatic retry.
- [ ] T030 [US2] Implement one complete worker tick in `worker/src/ec2_worker/service.py`, including orphan interruption, occurrence materialization, one-at-a-time claims, manual queue selection, short transactions around AWS calls, safe audit persistence, and continued processing after one run fails.
- [ ] T031 [US2] Implement `python -m ec2_worker.cli --tick` and exit codes in `worker/src/ec2_worker/cli.py`; accept only `--tick`, `--db-path`, `--log-level`, and `--dry-run`, never accept target/credential arguments, and return nonzero only for structural configuration/database failures.
- [ ] T032 [US2] Add automatic schedule and recovery integration cases to `worker/tests/test_integration_sqlite.py`, proving Sequelize-created configuration is consumed by Python, repeated ticks do not duplicate occurrences, the cursor and ledger are atomic, and backlog pages are not silently discarded.

**Checkpoint**: The worker executes a complete minute tick without the web process, preserves transition safety, and remains available after action-level failures.

---

## Phase 5: User Story 3 - Controlar e simular manualmente (Priority: P2)

**Goal**: Let an authenticated operator inspect state, enqueue real start/stop actions, repeat a request idempotently, reconcile uncertainty, and run local simulations without synchronous AWS calls.

**Independent Test**: With a seeded configuration and fake gateway, request inspect, simulation, real start/stop, same/different request IDs, and reconciliation; verify 202/409 behavior, persisted links, immutable uncertain runs, and zero AWS client creation for simulation.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add manual queue, same-`requestId` idempotency, conflicting-`requestId`, transition-gate, inspect, simulation, and reconciliation tests in `worker/tests/test_manual_actions.py`, including definitive and intermediate inspection outcomes.
- [ ] T034 [P] [US3] Add authenticated web contract cases in `tests/ec2-web.contract.test.ts` for `POST /ec2/actions/start`, `POST /ec2/actions/stop`, `POST /ec2/status/refresh`, repeated request IDs, `409`, `reconcilesRunId`, 202 response bodies, and CSRF rejection.

### Implementation for User Story 3

- [ ] T035 [US3] Implement manual start/stop enqueueing in `src/controllers/ec2.controller.ts` and `src/router/web.ts`, validating UUID `requestId`, `mode`, target snapshots, same-intent idempotency, conflicting-ID `409`, transition-gate `409`, CSRF, and optional `reconcilesRunId` without calling AWS in the HTTP request.
- [ ] T036 [US3] Implement `POST /ec2/status/refresh` and `GET /ec2/status` in `src/controllers/ec2.controller.ts` and `src/router/web.ts`, creating `inspect` runs, returning the latest persisted observation/next action, and never accepting arbitrary instance IDs or regions.
- [ ] T037 [US3] Extend `src/views/ec2/index.ejs` with inspect, real start/stop, simulation, repeated-request, reconciliation, and run-polling controls that distinguish requested from observed state and show actionable Portuguese-Brazilian messages.
- [ ] T038 [US3] Complete manual-run and reconciliation processing in `worker/src/ec2_worker/service.py`, `worker/src/ec2_worker/executor.py`, and `worker/src/ec2_worker/repository.py`, allowing inspection while gated, clearing the gate only after definitive state, and creating new actions with `reconciles_run_id` without mutating the original run.

**Checkpoint**: Manual operations return durable run IDs immediately, simulations are local, duplicate requests are safe, and uncertain mutations require inspect-then-new-action reconciliation.

---

## Phase 6: User Story 4 - Investigar execucoes e falhas (Priority: P2)

**Goal**: Provide protected audit history for every execution outcome and safe diagnostics for AWS, configuration, network, authentication, authorization, timeout, interruption, uncertainty, and conflict.

**Independent Test**: Generate successful, noop, skipped, simulated, failed, interrupted, unknown, and conflict runs; inspect protected history and verify timestamps, snapshots, mode, observed state, safe messages, reconciliation links, and no secrets.

### Tests for User Story 4

- [ ] T039 [P] [US4] Add audit and failure integration cases in `worker/tests/test_integration_sqlite.py` for every run status, sanitized Portuguese-Brazilian messages, no token/header leakage, preserved history after configuration edits, immutable uncertain runs, and `running` to `interrupted` recovery.
- [ ] T040 [P] [US4] Add gateway failure cases in `worker/tests/test_ec2_gateway.py` for network, auth, permission, not-found, throttled, timeout, unknown, lost mutation response, and no-second-mutation behavior.
- [ ] T041 [P] [US4] Add protected audit and security contract cases in `tests/ec2-web.contract.test.ts` for unauthenticated/expired sessions, JSON `401`, HTML login redirect, CSRF `403`, paginated runs, filters, and secret-free error output.

### Implementation for User Story 4

- [ ] T042 [US4] Implement safe error classification, message sanitization, terminal status persistence, and immutable reconciliation links in `worker/src/ec2_worker/ec2_gateway.py`, `worker/src/ec2_worker/executor.py`, and `worker/src/ec2_worker/repository.py`.
- [ ] T043 [US4] Implement paginated `GET /ec2/runs` and audit/status query handling in `src/controllers/ec2.controller.ts` and `src/router/web.ts`, supporting `status`, `source`, `mode`, date filters, `reconcilesRunId`, and a default limit of 50.
- [ ] T044 [US4] Render audit history, next action, last observed state, failure reason, transition-gate status, and reconciliation guidance in `src/views/ec2/index.ejs`, escaping all database-backed values and distinguishing every documented run status.
- [ ] T045 [US4] Verify protected audit behavior in `src/middleware/auth.ts`, `src/middleware/csrf.ts`, and `src/controllers/ec2.controller.ts`: invalid/expired sessions are rejected before AWS access or data disclosure, while every valid issuer identity can view and operate the configured instance.

**Checkpoint**: Operators can explain outcomes and reconcile uncertain mutations without exposing secrets or causing automatic retries.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Deploy safely on Raspberry Pi and validate operational performance and documentation.

- [ ] T046 [P] Create `deploy/systemd/wake-up-device-ec2.timer` with `OnCalendar=*-*-* *:*:00`, `Persistent=false`, `AccuracySec=1s`, and the worker service dependency.
- [ ] T047 [P] Create `deploy/systemd/wake-up-device-ec2.service` as a restricted `Type=oneshot` unit using a dedicated Unix user, `python -m ec2_worker.cli --tick`, `TimeoutStartSec=45s`, journald output, `NoNewPrivileges=yes`, `PrivateTmp=yes`, compatible filesystem protection, and no credential-bearing environment file.
- [ ] T048 Update `README.md` and `.env.example` with dependency setup, shared absolute `DB_STORAGE`, OIDC/TLS variables, `openid-client` provider configuration, temporary AWS credentials via `credential_process`/IAM Roles Anywhere, region allowlist maintenance, minimum IAM permissions, simulation, recovery, reconciliation, logs, and systemd installation without secrets.
- [ ] T049 [P] Add latency, RSS, timeout, SQLite-integrity, and no-overlap validation in `worker/tests/test_performance.py` and `specs/001-ec2-instance-scheduling/quickstart.md`, enforcing dispatch within 60 seconds, normal tick under 45 seconds, and RSS below `65536 KiB`.
- [ ] T050 [P] Add the seven-day Raspberry Pi soak procedure and acceptance evidence to `specs/001-ec2-instance-scheduling/quickstart.md`, covering 10080 expected ticks, no manual restart, journald/systemd health, no OOM, no SQLite corruption, and stable disk/memory behavior.
- [ ] T051 Review `src/database/migrations/20261108150000-add-ec2-automation.ts`, `src/models/`, `worker/src/ec2_worker/`, `src/controllers/ec2.controller.ts`, `src/views/ec2/index.ejs`, `config/aws-ec2-regions.json`, and `deploy/systemd/` for parameterized operations, persisted-target derivation, secret-free logs, mobile-safe rendering, explicit partition handling, and no regression to existing device routes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001-T004 establish runtimes, dependencies, test fixtures, and the shared region source.
- **Foundational (Phase 2)**: T005-T017 depend on the setup and block all stories with schema, security, persistence, and routing infrastructure.
- **User Story 1 (Phase 3)**: Depends on Phase 2 and establishes the valid configuration/schedule consumed by the worker.
- **User Story 2 (Phase 4)**: Depends on Phase 2 and the US1 configuration contract; fake gateways keep worker tests independently executable.
- **User Story 3 (Phase 5)**: Depends on the US1 configuration shape and US2 state executor/gate behavior.
- **User Story 4 (Phase 6)**: Depends on the shared run schema and execution outcomes from US2/US3.
- **Polish (Phase 7)**: Depends on the CLI, protected routes, audit fields, and worker behavior being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2; no dependency on another story.
- **US2 (P1)**: Requires US1's persisted configuration/schedule contract.
- **US3 (P2)**: Requires US1's configuration and US2's state/gate executor; HTTP enqueue tests remain independently testable with fixtures.
- **US4 (P2)**: Requires US2/US3 terminal statuses and reconciliation links; audit tests can use seeded runs.

### Within Each User Story

- Tests are written before the corresponding implementation and must fail until implementation is complete.
- Models/migrations precede services, services precede endpoints, and worker state rules precede tick integration.
- No AWS call occurs in a web request or inside a SQLite transaction.
- A story is complete only after its independent test criteria and checkpoint pass.

### Parallel Opportunities

- Setup: T002-T004 can run in parallel after T001 establishes the package context.
- Foundation: T009-T012 and T017 can run in parallel after the migration shape is agreed; T005-T008 edit one migration and must be coordinated.
- US1: T018 and T019 can run in parallel; T020-T022 can proceed in parallel after validation rules are fixed.
- US2: T024-T026 can run in parallel; T027 and T028 can run in parallel, followed by T029-T031.
- US3: T033 and T034 can run in parallel; T035-T037 can run in parallel after the HTTP contract is fixed.
- US4: T039-T041 can run in parallel; T043-T045 can run in parallel after audit fields are available.
- Polish: T046-T050 can run in parallel after referenced interfaces stabilize.

## Parallel Example: User Story 1

```text
Task: "Add repository tests in worker/tests/test_repository.py for region and schedule validation"
Task: "Add authenticated web contract tests in tests/ec2-web.contract.test.ts"

Task: "Implement configuration validation in src/controllers/ec2.controller.ts"
Task: "Add configuration routes in src/router/web.ts"
Task: "Create src/views/ec2/index.ejs"
```

## Parallel Example: User Story 2

```text
Task: "Add scheduler tests in worker/tests/test_scheduler.py"
Task: "Add executor/gate tests in worker/tests/test_executor.py"
Task: "Add Boto3 Stubber tests in worker/tests/test_ec2_gateway.py"

Task: "Implement worker/src/ec2_worker/scheduler.py"
Task: "Implement worker/src/ec2_worker/ec2_gateway.py"
```

## Parallel Example: User Story 3

```text
Task: "Add manual/reconciliation tests in worker/tests/test_manual_actions.py"
Task: "Add manual HTTP contract tests in tests/ec2-web.contract.test.ts"

Task: "Implement manual enqueue routes in src/controllers/ec2.controller.ts and src/router/web.ts"
Task: "Extend src/views/ec2/index.ejs with simulation and reconciliation controls"
```

## Parallel Example: User Story 4

```text
Task: "Add audit integration tests in worker/tests/test_integration_sqlite.py"
Task: "Add failure-category tests in worker/tests/test_ec2_gateway.py"
Task: "Add protected audit contract tests in tests/ec2-web.contract.test.ts"

Task: "Implement paginated GET /ec2/runs in src/controllers/ec2.controller.ts and src/router/web.ts"
Task: "Render audit and reconciliation status in src/views/ec2/index.ejs"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 schema, allowlist, persistence, OIDC, session, and CSRF foundation.
3. Complete Phase 3 User Story 1.
4. Validate supported/unsupported regions, invalid forms, persistence, and EJS rendering independently.
5. Stop for validation or demo before enabling real AWS mutations.

### Incremental Delivery

1. Deliver US1 as the configuration MVP.
2. Add US2 and validate automatic ticks with fake AWS responses before real credentials.
3. Add US3 and validate asynchronous manual, simulation, and reconciliation flows.
4. Add US4 and validate audit, failure, and security behavior.
5. Finish systemd, documentation, performance checks, and the seven-day soak.

### Suggested MVP Scope

The minimum useful release is Phase 1, Phase 2, and US1. The operational MVP should then include US2 because automatic scheduling is the primary value; real AWS execution remains behind simulation, credential, and controlled-window checks.

## Notes

- Every task uses `- [ ] T###`; `[P]` appears only for independent work and story tasks carry exactly one `[US#]` label.
- Every task names concrete repository paths and the migration filename is fixed.
- `npm test` remains a placeholder failure per `AGENTS.md`; use the dedicated web-contract command, `pytest worker/tests -q`, `npx tsc --noEmit`, migration checks, and quickstart scenarios.
