"""Chạy lặp một file .xosc N lần trên CARLA để đo dung sai chạy lặp (kế hoạch 20/10, việc 3 của thành viên 2).

    worker/.venv-carla/Scripts/python worker/repeat_xosc.py scenario.xosc --runs 5 --out data/repeat-xyz [--camera]

Mỗi lần là một tiến trình ``run_xosc.py`` riêng (dọn world trước/sau như chạy từ web), thư mục ``<out>/run-01`` …; cuối cùng ghi
``<out>/repeat_summary.json`` và in bảng trung bình / độ lệch chuẩn / khoảng. Chỉ tổng hợp số đã có trong ``result.json`` — không chấm lại
(luật chấm ở lõi Java, ADR-042). Lần chạy lỗi được đếm riêng, không bị bỏ qua lặng lẽ.
"""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parent

# (tên hiển thị, đường dẫn trong result.json)
METRICS = (
    ("fcw_t", ("events", "fcw")),
    ("aeb_decision_t", ("events", "aeb_decision")),
    ("brake_onset_t", ("events", "brake_onset")),
    ("min_distance_m", ("metrics", "min_distance_m")),
    ("min_ttc_s", ("metrics", "min_ttc_s")),
    ("stopping_distance_m", ("metrics", "stopping_distance_m")),
    ("rms_jerk_mps3", ("metrics", "rms_jerk_mps3")),
    ("impact_speed_mps", ("metrics", "impact_speed_mps")),
    ("radar_shadow_aeb_decision_t", ("shadow", "aeb_decision_t")),
    ("radar_shadow_first_detection_t", ("shadow", "first_detection_t")),
)


def extract(result: dict) -> dict:
    """Chỉ số của một run từ ``result.json``; thiếu thì None (không thay bằng 0)."""
    outcome = result["outcome"]
    first_event: dict[str, float] = {}
    for event in outcome["events"]:
        first_event.setdefault(event["kind"], event["t"])
    sources = {"events": first_event, "metrics": outcome["metrics"],
               "shadow": outcome.get("case", {}).get("carla", {}).get("perception_shadow") or {}}
    row = {name: sources[group].get(key) for name, (group, key) in METRICS}
    row["end_reason"] = outcome["end_reason"]
    return row


def summarise(rows: list[dict]) -> dict:
    """Trung bình, độ lệch chuẩn mẫu, nhỏ nhất, lớn nhất, khoảng cho từng chỉ số (bỏ None, ghi số mẫu)."""
    summary = {}
    for name, _ in METRICS:
        values = [r[name] for r in rows if isinstance(r.get(name), (int, float))]
        if not values:
            summary[name] = {"n": 0}
            continue
        summary[name] = {
            "n": len(values),
            "mean": round(statistics.fmean(values), 4),
            "sd": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
            "min": min(values),
            "max": max(values),
            "range": round(max(values) - min(values), 4),
        }
    summary["end_reason"] = {reason: sum(r["end_reason"] == reason for r in rows) for reason in sorted({r["end_reason"] for r in rows})}
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("xosc", type=Path)
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--camera", action="store_true")
    args = parser.parse_args(argv)
    if args.runs < 2:
        parser.error("--runs phải ≥ 2 để có độ lệch chuẩn")
    rows, failures = [], []
    for i in range(1, args.runs + 1):
        run_dir = args.out / f"run-{i:02d}"
        command = [sys.executable, str(WORKER / "run_xosc.py"), str(args.xosc), "--out", str(run_dir), "--fast"]
        if args.camera:
            command.append("--camera")
        code = subprocess.run(command, check=False).returncode
        result_file = run_dir / "result.json"
        if code != 0 or not result_file.is_file():
            failures.append({"run": i, "exit_code": code})
            print(f"run {i}: LỖI (mã {code})", file=sys.stderr)
            continue
        row = extract(json.loads(result_file.read_text(encoding="utf-8")))
        row["run"] = i
        rows.append(row)
        print(f"run {i}: {row['end_reason']} · quyết định {row['aeb_decision_t']} s · quãng dừng {row['stopping_distance_m']} m")
    report = {"xosc": str(args.xosc.resolve()), "runs": args.runs, "succeeded": len(rows), "failures": failures,
              "rows": rows, "summary": summarise(rows) if rows else {}}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "repeat_summary.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    for name, _ in METRICS:
        s = report["summary"].get(name, {})
        if s.get("n"):
            print(f"{name:32s} n={s['n']} mean={s['mean']} sd={s['sd']} range={s['range']} [{s['min']} … {s['max']}]")
    print(f"Đã ghi {args.out / 'repeat_summary.json'}")
    return 0 if not failures else 3


if __name__ == "__main__":
    raise SystemExit(main())
