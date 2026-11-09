from datetime import datetime, timezone

from ec2_worker.repository import ConfigRecord
from ec2_worker.scheduler import Scheduler


def test_scheduler_uses_local_zone_and_deduplicates(repository, connection):
    connection.execute("INSERT INTO ec2_schedule VALUES (1, 'start', 1, '08:00', 1, '2026-01-01T00:00:00Z')")
    connection.execute("UPDATE ec2_config SET scheduler_cursor_utc = NULL")
    scheduler = Scheduler(repository)
    now = datetime(2026, 1, 5, 11, 0, tzinfo=timezone.utc)  # 08:00 in Sao Paulo
    assert len(scheduler.tick(now)) == 1
    assert scheduler.tick(now) == []
    assert connection.execute("SELECT count(*) FROM ec2_run").fetchone()[0] == 1


def test_recovery_materializes_each_missed_minute_schedule(repository, connection):
    connection.execute("UPDATE ec2_config SET recovery_enabled = 1, scheduler_cursor_utc = '2026-01-05T10:58:00Z'")
    connection.execute("INSERT INTO ec2_schedule VALUES (1, 'start', 1, '07:59', 1, '2026-01-01T00:00:00Z')")
    # 10:59 UTC is 07:59 in Sao Paulo; the current minute is 11:00 UTC.
    runs = Scheduler(repository).tick(datetime(2026, 1, 5, 11, 0, tzinfo=timezone.utc))
    assert len(runs) == 1
    assert runs[0].scheduled_at_utc == "2026-01-05T10:59:00Z"
