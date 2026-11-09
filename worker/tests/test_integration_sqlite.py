from datetime import datetime, timezone

from ec2_worker.config import Settings
from ec2_worker.regions import load_regions
from ec2_worker.repository import Repository
from ec2_worker.service import WorkerService


def test_service_consumes_config_and_repeats_tick_without_duplicate(connection, repository, tmp_path):
    regions_file = tmp_path / "regions.json"
    regions_file.write_text('[{"name":"sa-east-1","partition":"aws"}]')
    connection.execute("INSERT INTO ec2_schedule VALUES (1, 'start', 1, '08:00', 1, '2026-01-01T00:00:00Z')")
    settings = Settings(db_path=tmp_path / "db.sqlite", region_file=regions_file)

    class Gateway:
        def describe(self, instance_id, region):
            return "running"

    service = WorkerService(
        repository, settings, load_regions(regions_file), gateway_factory=Gateway,
        clock=lambda: datetime(2026, 1, 5, 11, 0, tzinfo=timezone.utc),
    )
    service.tick()
    service.tick()
    assert connection.execute("SELECT count(*) FROM ec2_run").fetchone()[0] == 1
    assert connection.execute("SELECT status FROM ec2_run").fetchone()[0] == "noop"
