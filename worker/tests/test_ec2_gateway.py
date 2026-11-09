import pytest

from ec2_worker.ec2_gateway import Boto3Ec2Gateway, GatewayError
from ec2_worker.regions import load_regions


def test_gateway_rejects_region_before_client_creation(tmp_path):
    path = tmp_path / "regions.json"
    path.write_text('[{"name":"sa-east-1","partition":"aws"}]')
    gateway = Boto3Ec2Gateway(load_regions(path), client_factory=lambda *args, **kwargs: pytest.fail("client created"))
    with pytest.raises(Exception):
        gateway.describe("i-12345678", "us-east-1")


def test_gateway_maps_uncertain_mutation_error(tmp_path):
    path = tmp_path / "regions.json"
    path.write_text('[{"name":"sa-east-1","partition":"aws"}]')

    class Client:
        def start_instances(self, **kwargs):
            raise TimeoutError("credential should not appear in output")

    gateway = Boto3Ec2Gateway(load_regions(path), client_factory=lambda *args, **kwargs: Client())
    with pytest.raises(GatewayError) as error:
        gateway.start("i-12345678", "sa-east-1")
    assert error.value.uncertain
    assert "credential" not in str(error.value)
