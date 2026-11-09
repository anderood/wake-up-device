import json

import pytest

from ec2_worker.regions import RegionError, load_regions


def test_loads_shared_region_shape(tmp_path):
    path = tmp_path / "regions.json"
    path.write_text(json.dumps({"regions": [{"name": "sa-east-1", "partition": "aws"}]}))
    regions = load_regions(path)
    assert regions.validate("sa-east-1").partition == "aws"
    with pytest.raises(RegionError):
        regions.validate("sa-east-1a")


def test_rejects_endpoint_and_unknown_partition(tmp_path):
    path = tmp_path / "regions.json"
    path.write_text(json.dumps([{"name": "ec2.sa-east-1.amazonaws.com", "partition": "aws"}]))
    with pytest.raises(RegionError):
        load_regions(path)
