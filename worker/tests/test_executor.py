from datetime import datetime, timezone

from ec2_worker.executor import Executor


class FakeGateway:
    def __init__(self, state):
        self.state = state
        self.calls = []

    def describe(self, instance_id, region):
        self.calls.append(("describe", instance_id, region))
        return self.state

    def start(self, instance_id, region):
        self.calls.append(("start", instance_id, region))

    def stop(self, instance_id, region):
        self.calls.append(("stop", instance_id, region))


def now():
    return datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_start_matrix_requests_only_from_stopped(repository):
    run = repository.enqueue_manual(
        request_id="exec-1", action="start", mode="real", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:00Z",
    )
    run = repository.claim(run.id, token="token", started_at="2026-01-01T00:00:01Z")
    gateway = FakeGateway("stopped")
    result = Executor(repository, gateway, clock=now).execute(run)
    assert result.status == "requested"
    assert [call[0] for call in gateway.calls] == ["describe", "start"]


def test_simulation_never_constructs_or_calls_gateway(repository):
    run = repository.enqueue_manual(
        request_id="exec-2", action="stop", mode="simulation", instance_id="i-12345678",
        region="sa-east-1", config_revision=1, requested_at="2026-01-01T00:00:00Z",
    )
    run = repository.claim(run.id, token="token", started_at="2026-01-01T00:00:01Z")
    result = Executor(repository, None, clock=now).execute(run)
    assert result.status == "simulated"
