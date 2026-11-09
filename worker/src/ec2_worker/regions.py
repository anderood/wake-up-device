from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class RegionError(ValueError):
    pass


@dataclass(frozen=True)
class Region:
    name: str
    partition: str


_REGION_NAME = re.compile(r"^[a-z]{2}(?:-[a-z0-9]+)+-\d+$")
_PARTITIONS = {"aws", "aws-cn", "aws-us-gov"}


class RegionAllowlist:
    def __init__(self, regions: dict[str, Region]):
        self._regions = regions

    def __contains__(self, name: str) -> bool:
        return name in self._regions

    def get(self, name: str) -> Region | None:
        return self._regions.get(name)

    def validate(self, name: str) -> Region:
        try:
            return self._regions[name]
        except KeyError as exc:
            raise RegionError(f"Região EC2 não permitida: {name}") from exc

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._regions))


def _entries(document: Any) -> list[Any]:
    if isinstance(document, list):
        return document
    if isinstance(document, dict):
        entries = document.get("regions", document.get("items"))
        if isinstance(entries, list):
            return entries
        if isinstance(entries, dict) and all(isinstance(value, str) for value in entries.values()):
            return [{"name": name, "partition": partition} for name, partition in entries.items()]
        if all(isinstance(value, str) for value in document.values()):
            return [{"name": name, "partition": partition} for name, partition in document.items()]
        if all(isinstance(value, list) for value in document.values()):
            return [{"name": name, "partition": partition} for partition, names in document.items() for name in names]
    raise RegionError("Formato de allowlist regional inválido")


def load_regions(path: str | Path) -> RegionAllowlist:
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RegionError("Não foi possível carregar a allowlist de regiões") from exc

    parsed: dict[str, Region] = {}
    for item in _entries(document):
        if isinstance(item, str):
            name, partition = item, "aws"
        elif isinstance(item, dict):
            name = item.get("name", item.get("region"))
            partition = item.get("partition")
        else:
            raise RegionError("Entrada de região inválida")
        if not isinstance(name, str) or not isinstance(partition, str):
            raise RegionError("Entrada de região inválida")
        if not _REGION_NAME.fullmatch(name) or partition not in _PARTITIONS:
            raise RegionError(f"Região EC2 inválida na allowlist: {name}")
        if name in parsed:
            raise RegionError(f"Região EC2 duplicada: {name}")
        parsed[name] = Region(name, partition)
    if not parsed:
        raise RegionError("A allowlist de regiões está vazia")
    return RegionAllowlist(parsed)


def validate_region(name: str, path: str | Path) -> Region:
    return load_regions(path).validate(name)
