from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Callable

from .config import Settings
from .ec2_gateway import Boto3Ec2Gateway, Ec2GatewayProtocol
from .executor import Executor
from .regions import RegionAllowlist
from .repository import Repository
from .scheduler import materialize_due

log = logging.getLogger(__name__)


def _utc(clock: Callable[[], datetime]) -> datetime:
    return clock().astimezone(timezone.utc)


class WorkerService:
    def __init__(
        self,
        repository: Repository,
        settings: Settings,
        regions: RegionAllowlist,
        *,
        gateway_factory: Callable[[], Ec2GatewayProtocol] | None = None,
        clock: Callable[[], datetime] | None = None,
        dry_run: bool = False,
    ):
        self.repository = repository
        self.settings = settings
        self.regions = regions
        self.gateway_factory = gateway_factory
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.dry_run = dry_run

    def tick(self) -> int:
        now = _utc(self.clock)
        stamp = now.isoformat().replace("+00:00", "Z")
        self.repository.mark_orphaned(finished_at=stamp)
        config = self.repository.get_config()
        if config is None:
            return 0
        if config.timezone != self.settings.timezone:
            raise ValueError("Fuso da configuração não suportado")
        self.regions.validate(config.region)
        materialize_due(self.repository, config, now=now)
        gateway: Ec2GatewayProtocol | None = None
        for candidate in self.repository.queued(self.settings.max_runs_per_tick):
            claimed = self.repository.claim(candidate.id, token=str(uuid.uuid4()), started_at=stamp)
            if claimed is None:
                continue
            if claimed.mode == "real" and not self.dry_run and gateway is None:
                factory = self.gateway_factory
                try:
                    if factory is None:
                        gateway = Boto3Ec2Gateway(self.regions, self.settings.aws_profile, self.settings.read_retries)
                    else:
                        gateway = factory()
                except Exception:
                    self.repository.finish(
                        claimed.id, status="failed", finished_at=stamp,
                        result="Não foi possível preparar o gateway AWS.",
                        error_code="unknown", error_message="Falha ao preparar o gateway.",
                    )
                    continue
            try:
                Executor(self.repository, gateway, clock=self.clock, dry_run=self.dry_run).execute(claimed)
            except Exception:
                # Keep one malformed action from preventing the next durable run.
                log.error("Falha ao processar run %s", claimed.id)
                self.repository.finish(
                    claimed.id, status="unknown", finished_at=stamp,
                    result="A execução foi interrompida e exige reconciliação.",
                    error_code="unknown", error_message="Falha não classificada durante a execução.",
                )
        return 0
