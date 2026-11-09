import pytest

from ec2_worker.repository import ConflictError


def test_manual_request_id_is_idempotent(repository):
    first = repository.enqueue_manual(
        request_id="request-1", action="inspect", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:00Z",
    )
    second = repository.enqueue_manual(
        request_id="request-1", action="inspect", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:01:00Z",
    )
    assert first.id == second.id
    with pytest.raises(ConflictError):
        repository.enqueue_manual(
            request_id="request-1", action="start", mode="real", instance_id="i-12345678",
            region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:01:00Z",
        )


def test_uncertain_run_is_immutable_and_gate_is_durable(repository):
    run = repository.enqueue_manual(
        request_id="request-2", action="start", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:00Z",
    )
    claimed = repository.claim(run.id, token="claim", started_at="2026-01-01T00:00:01Z")
    repository.finish(run.id, status="unknown", finished_at="2026-01-01T00:00:02Z", error_code="timeout")
    assert repository.get_run(run.id).status == "unknown"
    assert repository.transition("i-12345678")["state"] == "needs_reconciliation"
    assert claimed.status == "running"
    with pytest.raises(ConflictError):
        repository.enqueue_manual(
            request_id="request-3", action="stop", mode="real", instance_id="i-12345678",
            region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:03Z",
        )
