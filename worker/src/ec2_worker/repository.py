from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any, Iterable

from .db import transaction


class RepositoryError(RuntimeError):
    pass


class ConflictError(RepositoryError):
    pass


@dataclass(frozen=True)
class ConfigRecord:
    instance_id: str
    region: str
    timezone: str
    recovery_enabled: bool
    scheduler_cursor_utc: str | None
    revision: int
    updated_at: str


@dataclass(frozen=True)
class ScheduleRecord:
    id: int
    action: str
    weekday: int
    local_time: str
    enabled: bool
    updated_at: str


@dataclass(frozen=True)
class RunRecord:
    id: int
    idempotency_key: str
    occurrence_key: str | None
    source: str
    mode: str
    action: str
    instance_id: str
    region: str
    config_revision: int
    schedule_id: int | None
    scheduled_date: str | None
    scheduled_time: str | None
    scheduled_at_utc: str | None
    schedule_revision: int | None
    actor_issuer: str | None
    actor_subject: str | None
    reconciles_run_id: int | None
    status: str
    claim_token: str | None
    requested_at: str
    started_at: str | None
    finished_at: str | None
    observed_state: str | None
    result: str | None
    error_code: str | None
    error_message: str | None


def _row_run(row: sqlite3.Row) -> RunRecord:
    return RunRecord(**dict(row))


class Repository:
    def __init__(self, connection: sqlite3.Connection):
        self.connection = connection

    def get_config(self) -> ConfigRecord | None:
        row = self.connection.execute(
            "SELECT instance_id, region, timezone, recovery_enabled, scheduler_cursor_utc, "
            "revision, updated_at FROM ec2_config WHERE id = 1"
        ).fetchone()
        return ConfigRecord(**dict(row)) if row else None

    def schedules(self, *, enabled_only: bool = True) -> list[ScheduleRecord]:
        sql = "SELECT id, action, weekday, local_time, enabled, updated_at FROM ec2_schedule"
        if enabled_only:
            sql += " WHERE enabled = 1"
        sql += " ORDER BY weekday, local_time, id"
        return [ScheduleRecord(**dict(row)) for row in self.connection.execute(sql)]

    def set_cursor(self, cursor: str, *, updated_at: str) -> None:
        with transaction(self.connection):
            self.connection.execute(
                "UPDATE ec2_config SET scheduler_cursor_utc = ?, updated_at = ? WHERE id = 1",
                (cursor, updated_at),
            )

    def materialize(
        self,
        occurrences: Iterable[dict[str, Any]],
        *,
        cursor: str,
        updated_at: str,
    ) -> list[RunRecord]:
        """Insert a ledger page and advance the cursor atomically."""
        created: list[RunRecord] = []
        with transaction(self.connection):
            for occurrence in occurrences:
                self.connection.execute(
                    "INSERT OR IGNORE INTO ec2_run "
                    "(idempotency_key, occurrence_key, source, mode, action, instance_id, region, "
                    "config_revision, schedule_id, scheduled_date, scheduled_time, scheduled_at_utc, "
                    "schedule_revision, status, requested_at) VALUES (?, ?, 'automatic', 'real', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)",
                    (
                        occurrence["idempotency_key"], occurrence["occurrence_key"],
                        occurrence["action"], occurrence["instance_id"], occurrence["region"],
                        occurrence["config_revision"], occurrence["schedule_id"],
                        occurrence["scheduled_date"], occurrence["scheduled_time"],
                        occurrence["scheduled_at_utc"], occurrence.get("schedule_revision", 0),
                        updated_at,
                    ),
                )
                row = self.connection.execute(
                    "SELECT * FROM ec2_run WHERE idempotency_key = ?",
                    (occurrence["idempotency_key"],),
                ).fetchone()
                if row:
                    created.append(_row_run(row))
            self.connection.execute(
                "UPDATE ec2_config SET scheduler_cursor_utc = ?, updated_at = ? WHERE id = 1",
                (cursor, updated_at),
            )
        return created

    def _gate(self, instance_id: str) -> sqlite3.Row | None:
        return self.connection.execute(
            "SELECT instance_id, state, run_id FROM ec2_transition WHERE instance_id = ?",
            (instance_id,),
        ).fetchone()

    def _reconciliation_ready(self, instance_id: str, run_id: int | None) -> bool:
        if run_id is None:
            return False
        row = self.connection.execute(
            "SELECT id, status, action, instance_id FROM ec2_run WHERE id = ?",
            (run_id,),
        ).fetchone()
        if not row or row["instance_id"] != instance_id:
            return False
        if row["status"] == "observed":
            return True
        if row["status"] not in {"unknown", "interrupted"}:
            return False
        return self.connection.execute(
            "SELECT 1 FROM ec2_run WHERE source = 'manual' AND action = 'inspect' "
            "AND status = 'observed' AND reconciles_run_id = ? AND observed_state IN ('running', 'stopped', 'terminated')",
            (run_id,),
        ).fetchone() is not None

    def enqueue_manual(
        self,
        *,
        request_id: str,
        action: str,
        mode: str,
        instance_id: str,
        region: str,
        config_revision: int,
        requested_at: str,
        actor_issuer: str | None = None,
        actor_subject: str | None = None,
        reconciles_run_id: int | None = None,
    ) -> RunRecord:
        if action not in {"start", "stop", "inspect"} or mode not in {"real", "simulation"}:
            raise RepositoryError("Ação ou modo inválido")
        with transaction(self.connection):
            existing = self.connection.execute(
                "SELECT * FROM ec2_run WHERE idempotency_key = ?", (request_id,)
            ).fetchone()
            if existing:
                same = all(existing[key] == value for key, value in {
                    "action": action, "mode": mode, "instance_id": instance_id,
                    "region": region, "reconciles_run_id": reconciles_run_id,
                }.items())
                if not same:
                    raise ConflictError("requestId já foi usado para outra intenção")
                return _row_run(existing)

            real_mutation = mode == "real" and action in {"start", "stop"}
            gate = self._gate(instance_id) if real_mutation else None
            if gate and not self._reconciliation_ready(instance_id, reconciles_run_id):
                raise ConflictError("Já existe uma transição que exige reconciliação")
            if gate and real_mutation:
                # The inspect run cleared the uncertainty; replace the old gate atomically.
                self.connection.execute(
                    "DELETE FROM ec2_transition WHERE instance_id = ? AND state = 'needs_reconciliation'",
                    (instance_id,),
                )
            self.connection.execute(
                "INSERT INTO ec2_run (idempotency_key, source, mode, action, instance_id, region, "
                "config_revision, actor_issuer, actor_subject, reconciles_run_id, status, requested_at) "
                "VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)",
                (request_id, mode, action, instance_id, region, config_revision,
                 actor_issuer, actor_subject, reconciles_run_id, requested_at),
            )
            run_id = self.connection.execute("SELECT last_insert_rowid()").fetchone()[0]
            if real_mutation:
                self.connection.execute(
                    "INSERT INTO ec2_transition (instance_id, state, run_id, updated_at) VALUES (?, 'active', ?, ?)",
                    (instance_id, run_id, requested_at),
                )
            return _row_run(self.connection.execute("SELECT * FROM ec2_run WHERE id = ?", (run_id,)).fetchone())

    def enqueue_automatic(self, occurrence: dict[str, Any], *, requested_at: str) -> RunRecord:
        """Insert one automatic ledger item without changing the scheduler cursor."""
        with transaction(self.connection):
            self.connection.execute(
                "INSERT OR IGNORE INTO ec2_run "
                "(idempotency_key, occurrence_key, source, mode, action, instance_id, region, "
                "config_revision, schedule_id, scheduled_date, scheduled_time, scheduled_at_utc, "
                "schedule_revision, status, requested_at) VALUES (?, ?, 'automatic', 'real', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)",
                (occurrence["idempotency_key"], occurrence.get("occurrence_key"), occurrence["action"],
                 occurrence["instance_id"], occurrence["region"], occurrence["config_revision"],
                 occurrence.get("schedule_id"), occurrence.get("scheduled_date"),
                 occurrence.get("scheduled_time"), occurrence.get("scheduled_at_utc"),
                 occurrence.get("schedule_revision", 0), requested_at),
            )
            row = self.connection.execute(
                "SELECT * FROM ec2_run WHERE idempotency_key = ?", (occurrence["idempotency_key"],)
            ).fetchone()
            return _row_run(row)

    def claim(self, run_id: int, *, token: str, started_at: str) -> RunRecord | None:
        with transaction(self.connection):
            row = self.connection.execute(
                "SELECT * FROM ec2_run WHERE id = ? AND status = 'queued'", (run_id,)
            ).fetchone()
            if not row:
                return None
            real_mutation = row["mode"] == "real" and row["action"] in {"start", "stop"}
            if real_mutation:
                gate = self._gate(row["instance_id"])
                if gate and gate["run_id"] != run_id:
                    self.connection.execute(
                        "UPDATE ec2_run SET status = 'conflict', result = ?, finished_at = ? WHERE id = ?",
                        ("A execução entrou em conflito com outra transição.", started_at, run_id),
                    )
                    return None
                if not gate:
                    self.connection.execute(
                        "INSERT INTO ec2_transition (instance_id, state, run_id, updated_at) VALUES (?, 'active', ?, ?)",
                        (row["instance_id"], run_id, started_at),
                    )
            self.connection.execute(
                "UPDATE ec2_run SET status = 'running', claim_token = ?, started_at = ? WHERE id = ?",
                (token, started_at, run_id),
            )
            return _row_run(self.connection.execute("SELECT * FROM ec2_run WHERE id = ?", (run_id,)).fetchone())

    def queued(self, limit: int) -> list[RunRecord]:
        rows = self.connection.execute(
            "SELECT * FROM ec2_run WHERE status = 'queued' ORDER BY "
            "CASE WHEN scheduled_at_utc IS NULL THEN 0 ELSE 1 END, scheduled_at_utc, id LIMIT ?",
            (limit,),
        )
        return [_row_run(row) for row in rows]

    def mark_orphaned(self, *, finished_at: str) -> int:
        with transaction(self.connection):
            rows = list(self.connection.execute("SELECT id, instance_id FROM ec2_run WHERE status = 'running'"))
            for row in rows:
                self.connection.execute(
                    "UPDATE ec2_run SET status = 'interrupted', result = ?, error_code = 'unknown', "
                    "error_message = ?, finished_at = ?, claim_token = NULL WHERE id = ?",
                    ("A execução foi interrompida e exige reconciliação.", "Worker reiniciado durante a execução.", finished_at, row["id"]),
                )
                self.connection.execute(
                    "UPDATE ec2_transition SET state = 'needs_reconciliation', updated_at = ? "
                    "WHERE instance_id = ? AND run_id = ?",
                    (finished_at, row["instance_id"], row["id"]),
                )
            return len(rows)

    def finish(
        self,
        run_id: int,
        *,
        status: str,
        finished_at: str,
        observed_state: str | None = None,
        result: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> RunRecord:
        if status not in {"requested", "observed", "noop", "skipped", "simulated", "failed", "unknown", "interrupted", "conflict"}:
            raise RepositoryError("Status final inválido")
        with transaction(self.connection):
            current = self.connection.execute("SELECT * FROM ec2_run WHERE id = ?", (run_id,)).fetchone()
            if not current:
                raise RepositoryError("Execução inexistente")
            if current["status"] in {"unknown", "interrupted"}:
                return _row_run(current)
            self.connection.execute(
                "UPDATE ec2_run SET status = ?, finished_at = ?, observed_state = ?, result = ?, "
                "error_code = ?, error_message = ?, claim_token = NULL WHERE id = ?",
                (status, finished_at, observed_state, result, error_code, error_message, run_id),
            )
            real_mutation = current["mode"] == "real" and current["action"] in {"start", "stop"}
            if real_mutation and status in {"unknown", "interrupted"}:
                self.connection.execute(
                    "UPDATE ec2_transition SET state = 'needs_reconciliation', updated_at = ? WHERE run_id = ?",
                    (finished_at, run_id),
                )
            elif real_mutation and status in {"failed", "noop", "skipped", "conflict"}:
                self.connection.execute("DELETE FROM ec2_transition WHERE run_id = ?", (run_id,))
            if current["action"] == "inspect" and status == "observed" and observed_state in {"running", "stopped", "terminated"}:
                self.connection.execute(
                    "DELETE FROM ec2_transition WHERE run_id = (SELECT reconciles_run_id FROM ec2_run WHERE id = ?)",
                    (run_id,),
                )
            return _row_run(self.connection.execute("SELECT * FROM ec2_run WHERE id = ?", (run_id,)).fetchone())

    def get_run(self, run_id: int) -> RunRecord | None:
        row = self.connection.execute("SELECT * FROM ec2_run WHERE id = ?", (run_id,)).fetchone()
        return _row_run(row) if row else None

    def get_run_by_request_id(self, request_id: str) -> RunRecord | None:
        row = self.connection.execute("SELECT * FROM ec2_run WHERE idempotency_key = ?", (request_id,)).fetchone()
        return _row_run(row) if row else None

    claim_run = claim
    complete_run = finish
    list_queued = queued
    interrupt_orphans = mark_orphaned

    def transition(self, instance_id: str) -> sqlite3.Row | None:
        return self._gate(instance_id)
