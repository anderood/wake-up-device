from __future__ import annotations

import argparse
import logging
import sqlite3
import sys

from .config import ConfigurationError, Settings
from .db import connect
from .regions import RegionError, load_regions
from .repository import Repository
from .service import WorkerService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Worker de agendamento EC2")
    parser.add_argument("--tick", action="store_true", help="executa um ciclo e termina")
    parser.add_argument("--db-path", help="substitui DB_STORAGE para desenvolvimento")
    parser.add_argument("--log-level", help="nível do log")
    parser.add_argument("--dry-run", action="store_true", help="não envia mutações AWS")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.tick:
        build_parser().error("--tick é obrigatório")
    try:
        settings = Settings.from_env(db_path=args.db_path)
        if args.log_level:
            settings = settings.__class__(**{**settings.__dict__, "log_level": args.log_level.upper()})
        logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))
        regions = load_regions(settings.region_file)
        with connect(settings.db_path) as connection:
            WorkerService(Repository(connection), settings, regions, dry_run=args.dry_run).tick()
        return 0
    except (ConfigurationError, RegionError, OSError, sqlite3.Error, RuntimeError, ValueError) as exc:
        logging.getLogger(__name__).error("Falha estrutural do worker: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
