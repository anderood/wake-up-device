from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))


SCHEMA = """
CREATE TABLE ec2_config (
 id INTEGER PRIMARY KEY, instance_id TEXT NOT NULL, region TEXT NOT NULL,
 timezone TEXT NOT NULL, recovery_enabled INTEGER NOT NULL DEFAULT 0,
 scheduler_cursor_utc TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE ec2_schedule (
 id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, weekday INTEGER NOT NULL,
 local_time TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 UNIQUE(action, weekday)
);
CREATE TABLE ec2_run (
 id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE,
 occurrence_key TEXT UNIQUE, source TEXT NOT NULL, mode TEXT NOT NULL, action TEXT NOT NULL,
 instance_id TEXT NOT NULL, region TEXT NOT NULL, config_revision INTEGER NOT NULL,
 schedule_id INTEGER, scheduled_date TEXT, scheduled_time TEXT, scheduled_at_utc TEXT,
 schedule_revision INTEGER, actor_issuer TEXT, actor_subject TEXT, reconciles_run_id INTEGER,
 status TEXT NOT NULL, claim_token TEXT, requested_at TEXT NOT NULL, started_at TEXT,
 finished_at TEXT, observed_state TEXT, result TEXT, error_code TEXT, error_message TEXT
);
CREATE TABLE ec2_transition (
 instance_id TEXT PRIMARY KEY, state TEXT NOT NULL, run_id INTEGER NOT NULL, updated_at TEXT NOT NULL
);
"""


@pytest.fixture
def connection() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:", isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    connection.execute(
        "INSERT INTO ec2_config VALUES (1, 'i-12345678', 'sa-east-1', 'America/Sao_Paulo', 0, NULL, 1, '2026-01-01T00:00:00Z')"
    )
    yield connection
    connection.close()


@pytest.fixture
def repository(connection):
    from ec2_worker.repository import Repository

    return Repository(connection)
