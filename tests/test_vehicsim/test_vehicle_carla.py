"""DB lái thông số xe của cả hai bộ mô phỏng.

Phiên bản xe đang dùng (``vehicle_versions`` + ``carla_vehicle_models``) đi vào bundle: kích thước + phanh cho bộ động học,
``vehicle.carla`` (blueprint, vật lý, kích thước) cho runner CARLA. Khối ``vehicle.carla``
được kiểm chặt: thứ CARLA không ép được thì báo lỗi, không lặng lẽ bỏ qua.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from src.services.vehicsim import tables as t
from src.services.vehicsim.bundle import BundleError, read_spec
from src.services.vehicsim.common import engine

API = "/api/v1/vehicsim"
TINY_FAMILY = {
    "name": "Pedestrian Crossing",
    "ego_speeds_kmh": [40, 60],
    "trigger_distances_m": [20],
    "pedestrian_speeds_mps": [1.5],
    "stops_at_curb": [False],
    "weathers": ["CLEAR"],
    "times_of_day": ["DAY"],
}


@pytest.mark.asyncio
async def test_bundle_carries_the_main_vehicle_into_carla(client, engineer):
    res = await client.post(f"{API}/families", json=TINY_FAMILY, headers=engineer["headers"])
    assert res.status_code == 201, res.text
    with engine().connect() as conn:
        run = conn.execute(
            select(t.simulation_runs)
            .where(t.simulation_runs.c.scenario_id == res.json()["scenario_id"])
            .order_by(t.simulation_runs.c.id)
        ).first()
    doc = (await client.get(f"{API}/runs/{run.id}/bundle", headers=engineer["headers"])).json()

    assert doc["vehicle"]["carla"] == {
        "blueprint": "vehicle.audi.etron",
        "physics": {"mass": 2100.0},
        "dimensions": {"height_m": 1.67, "wheelbase_m": 2.95},
    }
    assert read_spec(doc).vehicle_carla == doc["vehicle"]["carla"]


@pytest.mark.parametrize(
    ("carla", "message"),
    [
        ({"blueprint": "walker.pedestrian.0001"}, "blueprint xe"),
        ({"physics": {"length": 5.0}}, "không ép được vào CARLA"),
        ({"physics": {"mass": -1}}, "phải dương"),
        ({"physics": {"wheels": {"grip": 2}}}, "wheels[0].grip không tồn tại"),
        ({"physics": {"center_of_mass": {"x": 0}}}, "center_of_mass"),
        ({"dimensions": {"length_m": 4.9}}, "dimensions.length_m không tồn tại"),
        ({"colour": "red"}, "vehicle.carla.colour không tồn tại"),
    ],
)
def test_vehicle_carla_block_rejects_what_carla_cannot_take(carla, message):
    doc = {"ego_speed_kmh": 40, "trigger_distance_m": 20, "pedestrian_speed_mps": 1.5, "vehicle": {"carla": carla}}
    with pytest.raises(BundleError, match=message.replace("[", r"\[").replace("]", r"\]")):
        read_spec(doc)


def test_vehicle_carla_block_round_trips_per_wheel_values():
    carla = {
        "blueprint": "vehicle.audi.etron",
        "physics": {"mass": 2400, "center_of_mass": {"x": 0.1, "y": 0, "z": -0.2}, "wheels": [{"radius": 37}] * 4},
        "dimensions": {"height_m": 1.67},
    }
    doc = {"ego_speed_kmh": 40, "trigger_distance_m": 20, "pedestrian_speed_mps": 1.5, "vehicle": {"carla": carla}}
    assert read_spec(doc).vehicle_carla == {
        "blueprint": "vehicle.audi.etron",
        "physics": {
            "mass": 2400.0,
            "center_of_mass": {"x": 0.1, "y": 0.0, "z": -0.2},
            "wheels": [{"radius": 37.0}] * 4,
        },
        "dimensions": {"height_m": 1.67},
    }
