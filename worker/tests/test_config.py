from pathlib import Path

import pytest

from ec2_worker.config import ConfigurationError, Settings


def test_settings_require_absolute_database(tmp_path):
    settings = Settings.from_env({"DB_STORAGE": str(tmp_path / "worker.sqlite")})
    assert settings.timezone == "America/Sao_Paulo"

    with pytest.raises(ConfigurationError):
        Settings.from_env({"DB_STORAGE": "relative.sqlite"})


def test_settings_reject_non_sao_paulo(tmp_path):
    with pytest.raises(ConfigurationError):
        Settings.from_env({"DB_STORAGE": str(tmp_path / "db"), "WORKER_TIMEZONE": "UTC"})
