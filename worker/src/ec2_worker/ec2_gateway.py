from __future__ import annotations

import socket
from dataclasses import dataclass
from typing import Any, Protocol

from .regions import RegionAllowlist

try:  # boto3 is optional for local simulation and repository-only tests.
    import boto3
    from botocore.config import Config as BotoConfig
    from botocore.exceptions import ClientError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError
except ImportError:  # pragma: no cover - exercised only without optional runtime deps
    boto3 = None
    BotoConfig = None
    class _MissingAwsException(Exception):
        pass
    ClientError = ConnectTimeoutError = EndpointConnectionError = ReadTimeoutError = _MissingAwsException


class GatewayError(RuntimeError):
    def __init__(self, message: str, *, category: str = "unknown", uncertain: bool = False):
        super().__init__(message)
        self.category = category
        self.uncertain = uncertain


class Ec2GatewayProtocol(Protocol):
    def describe(self, instance_id: str, region: str) -> str: ...
    def start(self, instance_id: str, region: str) -> None: ...
    def stop(self, instance_id: str, region: str) -> None: ...


def _category(error: BaseException) -> str:
    if isinstance(error, (ConnectTimeoutError, ReadTimeoutError, TimeoutError, socket.timeout)):
        return "timeout"
    if isinstance(error, (EndpointConnectionError, ConnectionError, OSError)):
        return "network"
    code = getattr(error, "response", {}).get("Error", {}).get("Code", "")
    if code in {"UnauthorizedOperation", "AuthFailure", "ExpiredToken", "InvalidClientTokenId"}:
        return "permission" if code == "UnauthorizedOperation" else "auth"
    if code in {"AccessDenied", "AccessDeniedException"}:
        return "permission"
    if code in {"InvalidInstanceID.NotFound", "InvalidInstanceID.Malformed", "InvalidParameterValue"}:
        return "not_found"
    if code in {"RequestLimitExceeded", "Throttling", "ThrottlingException"}:
        return "throttled"
    return "unknown"


def _safe_message(error: BaseException, category: str) -> str:
    messages = {
        "network": "Não foi possível conectar à AWS.",
        "auth": "As credenciais AWS foram rejeitadas ou expiraram.",
        "permission": "A identidade AWS não tem permissão para esta operação.",
        "not_found": "A instância não foi encontrada ou não é acessível.",
        "throttled": "A AWS limitou temporariamente a solicitação.",
        "timeout": "A AWS não respondeu dentro do tempo limite.",
        "unknown": "A AWS retornou uma falha não classificada.",
    }
    return messages.get(category, "Falha na AWS.")


@dataclass
class Boto3Ec2Gateway:
    regions: RegionAllowlist
    profile: str | None = None
    read_retries: int = 2
    client_factory: Any = None

    def __post_init__(self) -> None:
        self._read_clients: dict[str, Any] = {}
        self._mutation_clients: dict[str, Any] = {}

    def _client(self, region: str, *, mutation: bool = False) -> Any:
        self.regions.validate(region)
        clients = self._mutation_clients if mutation else self._read_clients
        if region not in clients:
            if self.client_factory is None and boto3 is None:
                raise GatewayError("Boto3 não está instalado", category="unknown")
            factory = self.client_factory
            if factory is None:
                session = boto3.Session(profile_name=self.profile) if self.profile else boto3.Session()
                factory = session.client
            retry_config = {"mode": "standard", "max_attempts": 1 if mutation else max(1, self.read_retries + 1)}
            kwargs = {"region_name": region}
            if BotoConfig is not None:
                kwargs["config"] = BotoConfig(retries=retry_config, connect_timeout=3, read_timeout=5)
            clients[region] = factory("ec2", **kwargs)
        return clients[region]

    def describe(self, instance_id: str, region: str) -> str:
        try:
            response = self._client(region).describe_instances(InstanceIds=[instance_id])
            reservations = response.get("Reservations", [])
            instances = [item for reservation in reservations for item in reservation.get("Instances", [])]
            if not instances:
                raise GatewayError("Instância não encontrada", category="not_found")
            return str(instances[0].get("State", {}).get("Name", "unknown"))
        except GatewayError:
            raise
        except Exception as exc:
            category = _category(exc)
            raise GatewayError(_safe_message(exc, category), category=category) from exc

    def _mutate(self, action: str, instance_id: str, region: str) -> None:
        try:
            # This client has max_attempts=1 so a lost mutation response is not retried.
            getattr(self._client(region, mutation=True), f"{action}_instances")(InstanceIds=[instance_id])
        except Exception as exc:
            category = _category(exc)
            uncertain = category in {"network", "timeout", "unknown"}
            raise GatewayError(_safe_message(exc, category), category=category, uncertain=uncertain) from exc

    def start(self, instance_id: str, region: str) -> None:
        self._mutate("start", instance_id, region)

    def stop(self, instance_id: str, region: str) -> None:
        self._mutate("stop", instance_id, region)

    # These names make the gateway convenient to use with small test fakes and
    # preserve the vocabulary used by the EC2 API.
    describe_instance = describe
    start_instance = start
    stop_instance = stop


Ec2Gateway = Boto3Ec2Gateway
