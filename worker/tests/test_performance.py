from datetime import datetime, timezone
from time import monotonic

from ec2_worker.scheduler import Scheduler


def test_empty_tick_is_fast(repository):
    start = monotonic()
    Scheduler(repository).tick(datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert monotonic() - start < 1
