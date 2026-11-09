from datetime import datetime, timezone

from ec2_worker.executor import Executor


class InspectGateway:
    def describe(self, instance_id, region):
        return "stopped"


def test_inspection_releases_reconciliation_gate(repository):
    uncertain = repository.enqueue_manual(
        request_id="manual-1", action="start", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:00Z",
    )
    repository.claim(uncertain.id, token="x", started_at="2026-01-01T00:00:01Z")
    repository.finish(uncertain.id, status="unknown", finished_at="2026-01-01T00:00:02Z")
    inspection = repository.enqueue_manual(
        request_id="inspect-1", action="inspect", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:03Z",
        reconciles_run_id=uncertain.id,
    )
    inspection = repository.claim(inspection.id, token="y", started_at="2026-01-01T00:00:04Z")
    Executor(repository, InspectGateway(), clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc)).execute(inspection)
    assert repository.transition("i-12345678") is None
