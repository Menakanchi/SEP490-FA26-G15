"""Kiểm profile CARLA hiện hành trên một bộ ca người đi bộ: xuất .xosc, chạy lặp trên CARLA, chạy bộ động học cùng bundle, so ba phía.

    mvnw compile                                   # cần target/classes cho bộ xuất và bộ động học
    worker/.venv-carla/Scripts/python worker/verify_cases.py --out data/kiem-xosc9 [--runs 3] [--only c1,c5] [--skip-carla]

Mặc định dùng bộ ca ``worker/cases/pedestrian-v9`` (c1–c6 của ADR-043 + c7 = c1 trời mưa). Mỗi ca:

1. ``BridgeMain export`` → ``<out>/<ca>/scenario.xosc`` (đúng bộ xuất của web, định dạng hiện hành);
2. ``BridgeMain kinematic`` → ``<out>/<ca>/bundle/result.json`` (bộ động học, cùng bundle và seed);
3. ``repeat_xosc.py`` → ``<out>/<ca>/carla/run-NN`` + ``repeat_summary.json`` (bỏ qua khi ``--skip-carla``).

Cuối cùng ghi ``<out>/so-sanh.md`` và ``<out>/so-sanh.json``: CARLA (trung bình ± độ lệch chuẩn), bộ động học, và số CARLA thật 13/11/2026
(radar trước khi gộp v7/v8, ADR-043) để đối chiếu. Chỉ đọc số đã có trong ``result.json`` — không chấm lại (luật chấm ở lõi Java, ADR-042).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import repeat_xosc

WORKER = Path(__file__).resolve().parent
REPO = WORKER.parent
DEFAULT_CASES = WORKER / "cases" / "pedestrian-v9"
BRIDGE = "com.vsos.core.bridge.BridgeMain"

# Số CARLA thật 13/11/2026 (ADR-043 "Giai đoạn 2", radar điều khiển AEB, chưa có kẹp μ·g / vùng thấp / bảng bàn đạp của v7–v8).
REFERENCE_2026_11_13 = {
    "c1": {"end_reason": "EGO_STOPPED", "aeb_decision_t": 2.25, "stopping_distance_m": 11.413, "min_distance_m": 2.609},
    "c2": {"end_reason": "COLLISION", "aeb_decision_t": 2.35, "ego_impact_speed_mps": 16.627},
    "c3": {"aeb_decision_t": 2.10, "min_distance_m": 0.99},
    "c4": {"end_reason": "EGO_STOPPED", "aeb_decision_t": 4.25, "min_distance_m": 5.692},
    "c5": {"end_reason": "COLLISION", "aeb_decision_t": 2.05, "ego_impact_speed_mps": 11.577},
    "c6": {"end_reason": "TARGET_CLEARED", "aeb_decision_t": None, "min_distance_m": 14.135},
}

COLUMNS = ("aeb_decision_t", "brake_onset_t", "min_distance_m", "stopping_distance_m", "impact_speed_mps", "ego_impact_speed_mps",
           "radar_first_detection_t", "ground_truth_aeb_decision_t")


def java(classpath: str, java_bin: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([java_bin, "-Dstdout.encoding=UTF-8", "-cp", classpath, BRIDGE, *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", check=False)


def xosc_format(xosc: Path) -> str | None:
    text = xosc.read_text(encoding="utf-8")
    marker = 'name="vs_format" parameterType="string" value="'
    start = text.find(marker)
    return text[start + len(marker):text.find('"', start + len(marker))] if start >= 0 else None


def carla_cell(summary: dict, name: str) -> str:
    s = summary.get(name) or {}
    if not s.get("n"):
        return "—"
    return f"{s['mean']:.3f} ± {s['sd']:.3f}" if s["n"] > 1 else f"{s['mean']:.3f}"


def number(value) -> str:
    return "—" if value is None else (f"{value:.3f}" if isinstance(value, (int, float)) else str(value))


def compare_rows(case: str, carla: dict | None, kinematic: dict) -> list[dict]:
    """Một dòng cho mỗi chỉ số: CARLA, bộ động học, tham chiếu 13/11."""
    ref = REFERENCE_2026_11_13.get(case, {})
    summary = (carla or {}).get("summary", {})
    rows = [{"case": case, "metric": "end_reason",
             "carla": ", ".join(f"{k} ×{v}" for k, v in summary.get("end_reason", {}).items()) or "—",
             "kinematic": kinematic.get("end_reason"), "ref_2026_11_13": ref.get("end_reason") or ""}]
    for name in COLUMNS:
        rows.append({"case": case, "metric": name, "carla": carla_cell(summary, name), "kinematic": number(kinematic.get(name)),
                     "ref_2026_11_13": number(ref.get(name)) if name in ref else ""})
    return rows


def markdown(rows: list[dict], formats: dict[str, str | None], runs: int, skipped: bool) -> str:
    lines = ["# So sánh CARLA (profile hiện hành) với bộ động học — ca người đi bộ", "",
             f"Mỗi ca CARLA chạy {runs} lần (trung bình ± độ lệch chuẩn)." if not skipped else "CARLA bỏ qua (`--skip-carla`).",
             "Định dạng .xosc: " + ", ".join(f"{c} {f}" for c, f in formats.items()), "",
             "| Ca | Chỉ số | CARLA | Bộ động học | CARLA 13/11 (radar, trước v7/v8) |", "|---|---|---|---|---|"]
    lines += [f"| {r['case']} | {r['metric']} | {r['carla']} | {r['kinematic']} | {r['ref_2026_11_13']} |" for r in rows]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--only", help="vd. c1,c5")
    parser.add_argument("--classpath", default=str(REPO / "target" / "classes"))
    parser.add_argument("--java", default="java")
    parser.add_argument("--camera", action="store_true")
    parser.add_argument("--skip-carla", action="store_true", help="chỉ xuất .xosc và chạy bộ động học (kiểm trước, không cần CARLA)")
    args = parser.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):  # PowerShell chuyển hướng ra file dùng mã trang cũ: không để tiếng Việt làm hỏng lần chạy dài
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    if not Path(args.classpath).exists():
        parser.error(f"không thấy {args.classpath} — chạy mvnw compile trước")
    wanted = set(args.only.split(",")) if args.only else None
    bundles = sorted(p for p in args.cases.glob("*.json") if wanted is None or p.stem in wanted)
    if not bundles:
        parser.error(f"không có ca nào trong {args.cases}")

    rows, formats, failures = [], {}, []
    for bundle in bundles:
        case = bundle.stem
        folder = args.out / case
        folder.mkdir(parents=True, exist_ok=True)
        local = folder / "bundle.json"
        shutil.copyfile(bundle, local)
        xosc = folder / "scenario.xosc"
        exported = java(args.classpath, args.java, "export", str(local), str(xosc))
        if exported.returncode != 0 or not xosc.is_file():
            failures.append({"case": case, "step": "export", "stderr": exported.stderr.strip()})
            print(f"{case}: xuất .xosc LỖI — {exported.stderr.strip()}", file=sys.stderr)
            continue
        formats[case] = xosc_format(xosc)
        kin = java(args.classpath, args.java, "kinematic", str(local))
        kin_result = folder / "bundle" / "result.json"
        if kin.returncode != 0 or not kin_result.is_file():
            failures.append({"case": case, "step": "kinematic", "stderr": kin.stderr.strip()})
            print(f"{case}: bộ động học LỖI — {kin.stderr.strip()}", file=sys.stderr)
            continue
        kinematic = repeat_xosc.extract(json.loads(kin_result.read_text(encoding="utf-8")))
        carla = None
        if not args.skip_carla:
            command = [str(WORKER / "repeat_xosc.py"), str(xosc), "--runs", str(args.runs), "--out", str(folder / "carla")]
            if args.camera:
                command.append("--camera")
            code = subprocess.run([sys.executable, *command], check=False).returncode
            summary_file = folder / "carla" / "repeat_summary.json"
            if summary_file.is_file():
                carla = json.loads(summary_file.read_text(encoding="utf-8"))
            if code != 0:
                failures.append({"case": case, "step": "carla", "exit_code": code})
        rows += compare_rows(case, carla, kinematic)
        print(f"{case}: {formats[case]} · bộ động học {kinematic['end_reason']}"
              + ("" if carla is None else f" · CARLA {carla.get('succeeded')}/{carla.get('runs')} run"))

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "so-sanh.json").write_text(json.dumps({"formats": formats, "runs": args.runs, "skip_carla": args.skip_carla,
                                                         "failures": failures, "rows": rows}, indent=1, ensure_ascii=False),
                                            encoding="utf-8")
    (args.out / "so-sanh.md").write_text(markdown(rows, formats, args.runs, args.skip_carla), encoding="utf-8")
    print(f"Đã ghi {args.out / 'so-sanh.md'}")
    return 0 if not failures else 3


if __name__ == "__main__":
    raise SystemExit(main())
