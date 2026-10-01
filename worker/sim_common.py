"""Phần dùng chung của hai CLI mô phỏng: ``kinematic_sim.py`` và ``run_variant.py``.

Hai CLI nhận **cùng tham số**, đọc **cùng file JSON** web xuất ra và ghi **cùng
``result.json``** — nên backend gọi CLI nào cũng được, tầng trên không cần biết
bên dưới là CARLA hay mô hình động học (ADR-027).

Lõi (AEB cần kiểm thử, luật chấm, định dạng file) nằm ở ``src/services/vehicsim/``
và chỉ dùng thư viện chuẩn, nên venv CARLA (Python 3.10) import thẳng được: file
này chỉ thêm gốc repo vào ``sys.path``. Không kéo thêm dependency nào vào worker.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.services.vehicsim.bundle import BundleError, RunSpec, read_spec, result_document  # noqa: E402
from src.services.vehicsim.evaluation import evaluate  # noqa: E402
from src.services.vehicsim.simulator import SimulationOutcome  # noqa: E402

# Tiến trình chạy xong mô phỏng thì thoát 0 — kể cả khi AEB FAIL (đó là kết quả
# kiểm thử, không phải lỗi). Khác 0 nghĩa là không có kết quả để đọc.
EXIT_BAD_INPUT = 2
EXIT_SIMULATOR_ERROR = 3
EXIT_STOPPED = 4  # bị yêu cầu dừng (backend hết thời gian chờ) — đã dọn dẹp xong mới thoát


def install_stop_handlers() -> None:
    """SIGTERM (Linux) / CTRL_BREAK (Windows) -> ``SystemExit`` để các khối ``finally`` kịp chạy.

    Backend dừng CLI quá hạn bằng các tín hiệu này trước khi giết cứng. Nếu bị giết
    cứng giữa chừng, CARLA giữ lại xe/người đi bộ/cảm biến và kẹt ở chế độ đồng bộ —
    đã tái hiện trên 0.9.16 ngày 01/10/2026.
    """

    def _stop(signum, _frame) -> None:
        raise SystemExit(EXIT_STOPPED)

    for name in ("SIGTERM", "SIGBREAK"):
        if hasattr(signal, name):
            signal.signal(getattr(signal, name), _stop)


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("bundle", type=Path, help="file JSON biến thể web xuất ra (hoặc Scenario IR trần)")
    parser.add_argument("--aeb", type=Path, help="file JSON cấu hình AEB, ghi đè AEB trong bundle")
    parser.add_argument("--seed", type=int, help="ghi đè seed trong bundle")
    parser.add_argument(
        "--out", type=Path, help="thư mục ghi result.json (mặc định: thư mục cùng tên file, cạnh file JSON)"
    )
    parser.add_argument("--fast", action="store_true", help="chạy nhanh nhất có thể, không chờ theo thời gian thực")


def _console_safe() -> None:
    # Console Windows (cp1252) không in được "·", "²", chữ Việt -> thay ký tự thay vì chết.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass


def load_spec(args: argparse.Namespace) -> RunSpec:
    """Đọc bundle (+ file AEB nếu có). Lỗi đầu vào thì in lý do và thoát mã 2."""
    _console_safe()
    try:
        doc = json.loads(args.bundle.read_text(encoding="utf-8"))
        aeb = json.loads(args.aeb.read_text(encoding="utf-8")) if args.aeb else None
        return read_spec(doc, aeb=aeb, seed=args.seed)
    except (OSError, json.JSONDecodeError, BundleError) as exc:
        print(f"Không đọc được đầu vào: {exc}", file=sys.stderr)
        raise SystemExit(EXIT_BAD_INPUT) from exc


def out_dir(args: argparse.Namespace) -> Path:
    path = args.out or args.bundle.with_suffix("")
    path.mkdir(parents=True, exist_ok=True)
    return path


def finish(
    args: argparse.Namespace,
    spec: RunSpec,
    outcome: SimulationOutcome,
    *,
    simulator: str,
    artifacts: dict | None = None,
) -> int:
    """Ghi ``result.json`` rồi in tóm tắt PASS/FAIL bằng đúng luật chấm của backend."""
    target = out_dir(args) / "result.json"
    doc = result_document(spec, outcome, simulator=simulator, artifacts=artifacts)
    target.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    ev = evaluate(outcome, spec.params)
    m = outcome.metrics
    case = spec.case
    print(f"Bộ mô phỏng : {simulator}")
    print(
        f"Biến thể    : {case.ego_speed_kmh:g} km/h, kích hoạt {case.trigger_distance_m:g} m, "
        f"người đi bộ {case.pedestrian_speed_mps:g} m/s{' (dừng ở lề)' if case.stops_at_curb else ''}, "
        f"{case.weather}/{case.time_of_day}, seed {spec.seed}"
    )
    print(f"AEB         : {spec.aeb_label or '(không tên)'} · TTC {spec.params.ttc_threshold:g} s")
    print(f"Kết quả     : {ev.verdict} · {ev.outcome} · kết thúc {outcome.end_reason} sau {outcome.duration_s:g} s")
    if m["collision"]:
        print(f"Va chạm     : {m['impact_speed_mps'] * 3.6:.1f} km/h")
    else:
        print(f"Khoảng cách nhỏ nhất: {m['min_distance_m']} m")
    if ev.headline:
        print(f"Nhận định   : {ev.headline}")
    for name, path in (artifacts or {}).items():
        print(f"{name:<12}: {path}")
    print(f"Đã ghi      : {target}")
    return 0
