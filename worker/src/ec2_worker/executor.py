from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from .ec2_gateway import Ec2GatewayProtocol, GatewayError
from .repository import Repository, RunRecord


_ERROR_MESSAGES = {
    "network": "Não foi possível conectar à AWS.",
    "auth": "As credenciais AWS foram rejeitadas ou expiraram.",
    "permission": "A identidade AWS não tem permissão para esta operação.",
    "not_found": "A instância não foi encontrada ou não é acessível.",
    "throttled": "A AWS limitou temporariamente a solicitação.",
    "timeout": "A AWS não respondeu dentro do tempo limite.",
    "unknown": "A AWS retornou uma falha não classificada.",
}


def _safe_error(category: str) -> str:
    return _ERROR_MESSAGES.get(category, _ERROR_MESSAGES["unknown"])


def _timestamp(clock: Callable[[], datetime]) -> str:
    value = clock()
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class Executor:
    def __init__(self, repository: Repository, gateway: Ec2GatewayProtocol | None, *, clock: Callable[[], datetime] | None = None, dry_run: bool = False):
        self.repository = repository
        self.gateway = gateway
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.dry_run = dry_run

    def execute(self, run: RunRecord) -> RunRecord:
        if run.mode == "simulation":
            return self.repository.finish(
                run.id, status="simulated", finished_at=_timestamp(self.clock),
                result=f"Simulação: a ação {run.action} seria avaliada.",
            )
        if self.dry_run:
            return self.repository.finish(
                run.id, status="skipped", finished_at=_timestamp(self.clock),
                result="Execução real omitida pelo modo dry-run.",
            )
        if self.gateway is None:
            return self.repository.finish(
                run.id, status="failed", finished_at=_timestamp(self.clock),
                result="Gateway AWS indisponível.", error_code="unknown", error_message="Gateway não configurado.",
            )
        try:
            describe = getattr(self.gateway, "describe", None) or getattr(self.gateway, "describe_instance")
            state = describe(run.instance_id, run.region)
        except GatewayError as exc:
            return self.repository.finish(
                run.id, status="failed", finished_at=_timestamp(self.clock),
                result="Não foi possível consultar o estado da instância.",
                error_code=exc.category, error_message=_safe_error(exc.category),
            )
        except Exception:
            return self.repository.finish(
                run.id, status="failed", finished_at=_timestamp(self.clock),
                result="Não foi possível consultar o estado da instância.",
                error_code="unknown", error_message="Falha não classificada na consulta.",
            )

        if run.action == "inspect":
            return self.repository.finish(
                run.id, status="observed", finished_at=_timestamp(self.clock),
                observed_state=state, result=f"Estado observado: {state}.",
            )
        desired = "running" if run.action == "start" else "stopped"
        if state == desired:
            return self.repository.finish(
                run.id, status="noop", finished_at=_timestamp(self.clock),
                observed_state=state, result="Nenhuma alteração necessária.",
            )
        if state != ("stopped" if run.action == "start" else "running"):
            return self.repository.finish(
                run.id, status="skipped", finished_at=_timestamp(self.clock),
                observed_state=state, result=f"Ação não elegível no estado {state}.",
            )
        try:
            if run.action == "start":
                mutate = getattr(self.gateway, "start", None) or getattr(self.gateway, "start_instance")
            else:
                mutate = getattr(self.gateway, "stop", None) or getattr(self.gateway, "stop_instance")
            mutate(run.instance_id, run.region)
            return self.repository.finish(
                run.id, status="requested", finished_at=_timestamp(self.clock),
                observed_state=state, result="Solicitação enviada à AWS.",
            )
        except GatewayError as exc:
            status = "unknown" if exc.uncertain else "failed"
            return self.repository.finish(
                run.id, status=status, finished_at=_timestamp(self.clock),
                observed_state=state,
                result="A resposta da AWS não confirmou a solicitação." if exc.uncertain else "A AWS rejeitou a solicitação.",
                error_code=exc.category, error_message=_safe_error(exc.category),
            )
        except Exception:
            return self.repository.finish(
                run.id, status="unknown", finished_at=_timestamp(self.clock), observed_state=state,
                result="A resposta da AWS não confirmou a solicitação.",
                error_code="unknown", error_message="Falha durante a mutação.",
            )
