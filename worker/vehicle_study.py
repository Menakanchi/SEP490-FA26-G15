"""Thí nghiệm kiểm chứng xe trên CARLA (PDF phương pháp §10.1, bước 2–6): xe nào dùng được cho VehicSim và dùng được đến đâu.

    worker/.venv-carla/Scripts/python worker/vehicle_study.py --out data/vehicle-study [--speed 50] [--repeats 3]

Mỗi xe (sedan, SUV, van, truck): đọc physics CARLA thực dùng; phanh hết lực, không AEB, ``--repeats`` lần ở ma sát lốp mặc định và ở ma sát
giảm; rồi kiểm chiều thay đổi: tăng khối lượng và giảm mô-men phanh thì quãng dừng phải tăng. Mỗi phép đo là ``measure_brake.measure_once``
(đã kiểm trên CARLA thật). Ghi ``<out>/vehicle_study.json`` và ``<out>/vehicle_study.md`` (bảng đúng cột của PDF). **Không** ghi DB, không
đổi ``carla_vehicle_models``.

Chỉ chạy khi server rảnh (công cụ tự tick ở chế độ đồng bộ 0,01 s, như ``measure_brake.py``). Các ngưỡng mặc định (``--rel-tol`` 3%, tỷ lệ đổi
physics) là đề xuất của thành viên 2, nhóm chốt sau; kết quả chỉ là bằng chứng quan sát/đối chiếu, không phải chứng nhận (TD-17).
Bước 5 của PDF (radar so với ground truth) đã được đo ở chế độ chạy bóng của radar (ADR-043); bước 7 (FollowLeadingVehicle với AEB tắt) cần
loại kịch bản chưa có trong bộ xuất ``.xosc`` (TD-42).
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections.abc import Callable
from pathlib import Path

import measure_brake
import run_xosc

# (vai trò, blueprint) theo PDF §10.1 bước 2.
DEFAULT_VEHICLES = (
    ("Sedan", "vehicle.tesla.model3"),
    ("SUV", "vehicle.nissan.patrol_2021"),
    ("Van", "vehicle.mercedes.sprinter"),
    ("Truck", "vehicle.carlamotors.european_hgv"),
)
DEFAULT_SPEED_KMH = 50.0
DEFAULT_REPEATS = 3
REL_TOL = 0.03  # đề xuất: dải/trung bình ≤ 3% thì coi là lặp lại được
FRICTION_SCALE = 0.5
MASS_SCALE = 1.3
TORQUE_SCALE = 0.5

# Biến thể physics: tên nhóm -> (nhãn hiển thị, chiều quãng dừng dự kiến). Cả ba đều dự kiến quãng dừng tăng.
VARIANTS = {
    "low_friction": "ma sát lốp giảm",
    "heavy_mass": "khối lượng tăng",
    "low_brake_torque": "mô-men phanh giảm",
}

FINDING_TEXT = {
    "NOT_STOPPED": "có lần không dừng hẳn trong thời gian đo",
    "NO_BAND": "thiếu dải đo giảm tốc (dưới 2 mẫu dùng được)",
    "NOT_REPEATABLE": "chạy lặp lệch quá ngưỡng",
    "LOW_FRICTION_NO_EFFECT": "giảm ma sát lốp không đổi quãng dừng",
    "LOW_FRICTION_WRONG_DIRECTION": "giảm ma sát lốp làm quãng dừng ngắn đi",
    "HEAVY_MASS_NO_EFFECT": "tăng khối lượng không đổi quãng dừng",
    "HEAVY_MASS_WRONG_DIRECTION": "tăng khối lượng làm quãng dừng ngắn đi",
    "LOW_BRAKE_TORQUE_NO_EFFECT": "giảm mô-men phanh không đổi quãng dừng",
    "LOW_BRAKE_TORQUE_WRONG_DIRECTION": "giảm mô-men phanh làm quãng dừng ngắn đi",
}


def _stats(values: list[float]) -> dict | None:
    if not values:
        return None
    return {"n": len(values), "mean": round(statistics.fmean(values), 4),
            "sd": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
            "min": min(values), "max": max(values), "range": round(max(values) - min(values), 4)}


def aggregate(rows: list[dict]) -> dict:
    """Tóm tắt các lần đo của một nhóm. Giảm tốc chỉ lấy lần có dải đo đủ dài; quãng dừng chỉ lấy lần đã dừng hẳn. Thiếu thì ``None``, không bằng 0."""
    usable = [r for r in rows if r.get("decel_mps2") is not None and (r.get("duration_s") or 0) >= measure_brake.MIN_BAND_S]
    stopped = [r["stopping_distance_m"] for r in rows if r.get("stopped")]
    return {"runs": len(rows), "usable_decel_runs": len(usable),
            "decel_mps2": _stats([r["decel_mps2"] for r in usable]),
            "stopping_distance_m": _stats(stopped),
            "all_stopped": bool(rows) and all(r.get("stopped") for r in rows)}


def repeatable(agg: dict, rel_tol: float = REL_TOL) -> bool | None:
    """Giảm tốc và quãng dừng đều có dải ≤ ``rel_tol`` · trung bình. ``None`` khi chưa đủ dữ liệu (cần ≥ 2 mẫu mỗi số)."""
    checked = []
    for key in ("decel_mps2", "stopping_distance_m"):
        s = agg.get(key)
        if not s or s["n"] < 2:
            return None
        checked.append(s["range"] <= rel_tol * abs(s["mean"]))
    return all(checked)


def direction_verdict(base: dict | None, changed: dict | None, rel_min_effect: float = REL_TOL) -> str | None:
    """Quãng dừng sau khi đổi physics so với nhóm gốc, dự kiến **tăng**.

    ``OK`` = tăng vượt dao động chạy lặp; ``NO_EFFECT`` = chênh trong dao động (không phân biệt được); ``WRONG_DIRECTION`` = giảm vượt dao động.
    ``None`` khi thiếu số liệu.
    """
    if not base or not changed:
        return None
    delta = changed["mean"] - base["mean"]
    threshold = max(base["range"], changed["range"], rel_min_effect * abs(base["mean"]))
    if abs(delta) <= threshold:
        return "NO_EFFECT"
    return "OK" if delta > 0 else "WRONG_DIRECTION"


def scaled_wheels(wheels: list[dict], field: str, factor: float) -> list[dict]:
    """Danh sách ép theo từng bánh (giữ chênh lệch trước/sau của xe): ``field`` của bánh i nhân ``factor``."""
    return [{field: w[field] * factor} for w in wheels]


def findings_for(groups: dict[str, dict], checks: dict[str, str | None], rel_tol: float = REL_TOL) -> list[str]:
    base = groups["base"]
    found = []
    if not base["all_stopped"]:
        found.append("NOT_STOPPED")
    if base["usable_decel_runs"] < 2:
        found.append("NO_BAND")
    if repeatable(base, rel_tol) is False:
        found.append("NOT_REPEATABLE")
    for name in VARIANTS:
        if checks.get(name) in ("NO_EFFECT", "WRONG_DIRECTION"):
            found.append(f"{name.upper()}_{checks[name]}")
    return found


def study_vehicle(measure: Callable[[str, dict, float], dict], role: str, blueprint: str, speed_kmh: float, repeats: int,
                  rel_tol: float = REL_TOL, friction_scale: float = FRICTION_SCALE, mass_scale: float = MASS_SCALE,
                  torque_scale: float = TORQUE_SCALE) -> dict:
    """Một xe: nhóm gốc (physics mặc định, đọc lại thực dùng) và ba nhóm đổi physics, mỗi nhóm ``repeats`` lần đo."""
    base_rows = [measure(blueprint, {}, speed_kmh) for _ in range(repeats)]
    physics = base_rows[0]["physics_applied"]
    overrides = {
        "low_friction": {"wheels": scaled_wheels(physics["wheels"], "tire_friction", friction_scale)},
        "heavy_mass": {"mass": physics["mass"] * mass_scale},
        "low_brake_torque": {"wheels": scaled_wheels(physics["wheels"], "max_brake_torque", torque_scale)},
    }
    rows = {"base": base_rows}
    for name, override in overrides.items():
        rows[name] = [measure(blueprint, override, speed_kmh) for _ in range(repeats)]
    groups = {name: aggregate(group) for name, group in rows.items()}
    checks = {name: direction_verdict(groups["base"]["stopping_distance_m"], groups[name]["stopping_distance_m"], rel_tol) for name in VARIANTS}
    findings = findings_for(groups, checks, rel_tol)
    return {"role": role, "blueprint": blueprint, "speed_kmh": speed_kmh, "repeats": repeats,
            "wheel_count": len(physics["wheels"]), "mass_kg": physics["mass"], "physics_default": physics,
            "scales": {"low_friction": friction_scale, "heavy_mass": mass_scale, "low_brake_torque": torque_scale},
            "rows": rows, "groups": groups, "repeatable": repeatable(groups["base"], rel_tol), "checks": checks,
            "findings": findings}


def run_study(measure: Callable[[str, dict, float], dict], vehicles, speed_kmh: float, repeats: int, **options) -> list[dict]:
    """Chạy từng xe; một xe lỗi (blueprint không có, CARLA từ chối) được ghi lại và không chặn các xe còn lại."""
    results = []
    for role, blueprint in vehicles:
        try:
            results.append(study_vehicle(measure, role, blueprint, speed_kmh, repeats, **options))
        except (RuntimeError, IndexError, KeyError, ValueError) as exc:
            results.append({"role": role, "blueprint": blueprint, "error": f"{type(exc).__name__}: {exc}"})
    return results


def conclusion(result: dict) -> str:
    if "error" in result:
        return f"Không đo được: {result['error']}"
    if not result["findings"]:
        return "Đo được và lặp lại được; ba phép đổi physics cho quãng dừng tăng đúng chiều (phạm vi đã đo)"
    return "Cần xem xét: " + "; ".join(FINDING_TEXT[code] for code in result["findings"])


def _num(value, digits: int = 2) -> str:
    return "—" if value is None else f"{value:.{digits}f}".replace(".", ",")


def _mean_range(stats: dict | None, digits: int = 2) -> str:
    if not stats:
        return "—"
    return f"{_num(stats['mean'], digits)} (dải {_num(stats['range'], digits)})"


def markdown_report(results: list[dict], meta: dict) -> str:
    """Hai bảng: bảng kết quả theo cột của PDF §10.1 và bảng kiểm chiều thay đổi. Số thiếu hiện "—", không thay bằng 0."""
    lines = [f"# Thí nghiệm xe trên CARLA {meta.get('server', '?')} (bước {meta.get('step_s')} s)", "",
             f"Phanh hết lực từ {_num(meta.get('speed_kmh'), 0)} km/h, không AEB; mỗi nhóm đo {meta.get('repeats')} lần. "
             f"Ngưỡng lặp lại được: dải ≤ {_num(meta.get('rel_tol', REL_TOL) * 100, 0)}% trung bình (đề xuất, nhóm chốt sau). "
             "Số CARLA chưa hiệu chuẩn phanh (TD-17): chỉ để quan sát/đối chiếu, không phải chứng nhận an toàn.", "",
             "| Xe | Số bánh | Khối lượng (kg) | Giảm tốc đạt được (m/s²) | Quãng dừng (m) | Lặp lại được? | Kết luận |",
             "|---|---|---|---|---|---|---|"]
    for r in results:
        name = f"{r['role']} (`{r['blueprint']}`)"
        if "error" in r:
            lines.append(f"| {name} | — | — | — | — | — | {conclusion(r)} |")
            continue
        base = r["groups"]["base"]
        rep = {True: "Có", False: "Không", None: "—"}[r["repeatable"]]
        lines.append(f"| {name} | {r['wheel_count']} | {_num(r['mass_kg'], 0)} | {_mean_range(base['decel_mps2'])} | "
                     f"{_mean_range(base['stopping_distance_m'])} | {rep} | {conclusion(r)} |")
    lines += ["", "## Kiểm chiều thay đổi (quãng dừng dự kiến tăng)", "",
              "| Xe | " + " | ".join(VARIANTS.values()) + " |", "|---|" + "---|" * len(VARIANTS)]
    for r in results:
        if "error" in r:
            continue
        cells = []
        for name in VARIANTS:
            changed = r["groups"][name]["stopping_distance_m"]
            base = r["groups"]["base"]["stopping_distance_m"]
            verdict = {"OK": "đúng chiều", "NO_EFFECT": "không tác dụng", "WRONG_DIRECTION": "ngược chiều", None: "—"}[r["checks"][name]]
            cells.append(f"{_num(base['mean'] if base else None)} → {_num(changed['mean'] if changed else None)} m: {verdict}")
        lines.append(f"| {r['role']} | " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    run_xosc._console_safe()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--blueprints", nargs="+", help="ghi đè danh sách xe (blueprint); mặc định 4 xe theo PDF §10.1")
    parser.add_argument("--speed", type=float, default=DEFAULT_SPEED_KMH, help="tốc độ đầu của phép phanh (km/h)")
    parser.add_argument("--repeats", type=int, default=DEFAULT_REPEATS, help="số lần đo mỗi nhóm (≥ 2)")
    parser.add_argument("--rel-tol", type=float, default=REL_TOL)
    parser.add_argument("--friction-scale", type=float, default=FRICTION_SCALE)
    parser.add_argument("--mass-scale", type=float, default=MASS_SCALE)
    parser.add_argument("--torque-scale", type=float, default=TORQUE_SCALE)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=2000)
    args = parser.parse_args(argv)
    if args.repeats < 2:
        parser.error("--repeats phải ≥ 2 để biết dao động chạy lặp")
    vehicles = [(bp.split(".")[-1], bp) for bp in args.blueprints] if args.blueprints else list(DEFAULT_VEHICLES)
    import carla

    client = carla.Client(args.host, args.port)
    client.set_timeout(60.0)
    world = client.get_world()
    if world.get_map().name.split("/")[-1] != "Town04":
        world = client.load_world("Town04")
    run_xosc.release_world(client)
    settings = world.get_settings()
    settings.synchronous_mode, settings.fixed_delta_seconds = True, measure_brake.STEP_S
    world.apply_settings(settings)

    def measure(blueprint: str, physics: dict, speed_kmh: float) -> dict:
        return measure_brake.measure_once(world, carla, blueprint, physics, speed_kmh)

    try:
        results = run_study(measure, vehicles, args.speed, args.repeats, rel_tol=args.rel_tol, friction_scale=args.friction_scale,
                            mass_scale=args.mass_scale, torque_scale=args.torque_scale)
    finally:
        run_xosc.release_world(client)
    meta = {"server": client.get_server_version(), "step_s": measure_brake.STEP_S, "speed_kmh": args.speed, "repeats": args.repeats,
            "rel_tol": args.rel_tol, "map": "Town04", "min_band_s": measure_brake.MIN_BAND_S}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "vehicle_study.json").write_text(json.dumps({"meta": meta, "vehicles": results}, indent=1, ensure_ascii=False), encoding="utf-8")
    report = markdown_report(results, meta)
    (args.out / "vehicle_study.md").write_text(report, encoding="utf-8")
    print(report)
    print(f"Đã ghi {args.out / 'vehicle_study.json'} và {args.out / 'vehicle_study.md'}")
    return 0 if all("error" not in r for r in results) else 3


if __name__ == "__main__":
    sys.exit(main())
