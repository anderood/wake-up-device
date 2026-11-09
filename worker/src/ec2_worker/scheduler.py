from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .repository import ConfigRecord, Repository


UTC = timezone.utc
LOCAL_ZONE = ZoneInfo("America/Sao_Paulo")


def minute_floor(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(second=0, microsecond=0)


def utc_text(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def materialize_due(
    repository: Repository,
    config: ConfigRecord,
    *,
    now: datetime,
) -> list:
    current = minute_floor(now)
    cursor = None
    if config.scheduler_cursor_utc:
        cursor = datetime.fromisoformat(config.scheduler_cursor_utc.replace("Z", "+00:00")).astimezone(UTC)
    if cursor and cursor > current:
        return []
    if config.recovery_enabled and cursor:
        first = cursor + timedelta(minutes=1)
    else:
        first = current
    occurrences: list[dict] = []
    schedules = repository.schedules()
    instant = first
    while instant <= current:
        local = instant.astimezone(LOCAL_ZONE)
        for schedule in schedules:
            if schedule.weekday != local.isoweekday() or schedule.local_time != local.strftime("%H:%M"):
                continue
            key_instant = utc_text(instant)
            occurrences.append({
                "idempotency_key": f"automatic:{schedule.id}:{key_instant}",
                "occurrence_key": f"schedule:{schedule.id}:{key_instant}",
                "action": schedule.action,
                "instance_id": config.instance_id,
                "region": config.region,
                "config_revision": config.revision,
                "schedule_id": schedule.id,
                "scheduled_date": local.date().isoformat(),
                "scheduled_time": schedule.local_time,
                "scheduled_at_utc": key_instant,
                "schedule_revision": 0,
            })
        instant += timedelta(minutes=1)
    cursor_text = utc_text(current)
    if not config.recovery_enabled and cursor and cursor >= current:
        return []
    return repository.materialize(occurrences, cursor=cursor_text, updated_at=utc_text(now))


class Scheduler:
    """Small injectable facade used by the service and tests."""

    def __init__(self, repository: Repository, *, clock=None):
        self.repository = repository
        self.clock = clock

    def tick(self, now: datetime | None = None) -> list:
        value = now or (self.clock() if self.clock else datetime.now(UTC))
        config = self.repository.get_config()
        if config is None:
            return []
        return materialize_due(self.repository, config, now=value)
