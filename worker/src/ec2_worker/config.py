from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


class ConfigurationError(ValueError):
    """Raised when process configuration cannot be used safely."""


@dataclass(frozen=True)
class Settings:
    db_path: Path
    region_file: Path
    timezone: str = "America/Sao_Paulo"
    log_level: str = "INFO"
    max_runs_per_tick: int = 10
    read_retries: int = 2
    aws_profile: str | None = None
    aws_default_region: str | None = None

    @classmethod
    def from_env(
        cls,
        environ: dict[str, str] | None = None,
        *,
        db_path: str | Path | None = None,
        region_file: str | Path | None = None,
    ) -> "Settings":
        env = os.environ if environ is None else environ
        raw_db = str(db_path) if db_path is not None else env.get("DB_STORAGE", "")
        if not raw_db.strip():
            raise ConfigurationError("DB_STORAGE é obrigatório")
        database = Path(raw_db).expanduser()
        if not database.is_absolute():
            raise ConfigurationError("DB_STORAGE deve ser um caminho absoluto")
        if database.parent and not database.parent.exists():
            raise ConfigurationError("O diretório do banco não existe")

        timezone = env.get("WORKER_TIMEZONE", "America/Sao_Paulo").strip()
        if timezone != "America/Sao_Paulo":
            raise ConfigurationError("O fuso deve ser America/Sao_Paulo")

        root = Path(__file__).resolve().parents[3]
        regional_path = Path(
            region_file
            if region_file is not None
            else env.get("AWS_REGION_FILE", str(root / "config" / "aws-ec2-regions.json"))
        ).expanduser()
        try:
            max_runs = int(env.get("WORKER_MAX_RUNS_PER_TICK", "10"))
            read_retries = int(env.get("WORKER_READ_RETRIES", "2"))
        except ValueError as exc:
            raise ConfigurationError("Limites do worker inválidos") from exc
        if max_runs < 1 or read_retries < 0:
            raise ConfigurationError("Limites do worker inválidos")

        return cls(
            db_path=database,
            region_file=regional_path,
            timezone=timezone,
            log_level=env.get("WORKER_LOG_LEVEL", "INFO").upper(),
            max_runs_per_tick=max_runs,
            read_retries=read_retries,
            aws_profile=env.get("AWS_PROFILE") or None,
            aws_default_region=env.get("AWS_DEFAULT_REGION") or None,
        )
