"""Worker GPU: kéo job từ backend, chạy CARLA, trả ``ExecutionResult``.

Issue #27. Chạy trên máy có GPU và có CARLA — **không** phải trên backend.

    worker/.venv/bin/python worker/runner.py
    worker/.venv/bin/python worker/runner.py --once      # chạy đúng một job rồi thoát

Vì sao **pull** chứ không phải backend push xuống
-------------------------------------------------
Máy GPU là máy cá nhân sau NAT, không có IP công khai và không mở cổng. Backend
chạy trên Render, nó không thể gọi tới đây. Nên chiều gọi phải ngược: worker hỏi
backend "có việc không". Đổi lại, backend không cần biết worker đang ở đâu, và
tắt/bật worker không ảnh hưởng gì tới web (NFR-02).

Ranh giới với ``src/``
----------------------
File này **được phép** ``import carla``; ``src/`` thì không bao giờ (ADR-001).
Thứ đi qua ranh giới hai máy là chuỗi XML trong ``ScenarioJob.xosc_content``, và
JSON của ``ExecutionResult`` đi ngược lại — không phải object Python, vì hai venv
ghim hai bản Python khác nhau.

Phụ thuộc: chỉ thư viện chuẩn. ``worker/.venv`` ghim ``carla==0.9.15`` và
``setuptools<81``; thêm dependency vào đó là mời gãy toolchain.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import ego_controllers
import sr_cli
import trajectory

BACKEND = os.environ.get("FORGE_BACKEND", "http://localhost:8000").rstrip("/")
CARLA_ROOT = Path(os.environ.get("CARLA_ROOT", str(Path.home() / "CARLA_0.9.15")))
SR_ROOT = Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner")))
WORKER_PYTHON = Path(os.environ.get("WORKER_PYTHON", sys.executable))
CARLA_HOST = os.environ.get("CARLA_HOST", "127.0.0.1")
CARLA_PORT = os.environ.get("CARLA_PORT", "2000")

TM_PORT = os.environ.get("CARLA_TM_PORT", "8005")
"""Cổng TrafficManager của CARLA.

**Không để mặc định.** ScenarioRunner mặc định 8000, mà 8000 cũng là cổng
backend chạy trên cùng máy lúc dev — và đó đúng là cấu hình khi demo. Trùng cổng
thì ScenarioRunner chết bằng một thông báo chẳng liên quan gì tới nguyên nhân:

    RuntimeError: trying to create rpc server for traffic manager;
    but the system failed to create because of bind error
"""

SR_TIMEOUT_S = os.environ.get("SR_TIMEOUT_S", "60")
"""Timeout CARLA chờ tick, truyền cho ScenarioRunner."""

RUN_TIMEOUT_S = int(os.environ.get("RUN_TIMEOUT_S", "300"))
"""Trần cứng cho cả tiến trình. ScenarioRunner có lúc treo mà không tự thoát."""

NO_RENDER = os.environ.get("CARLA_NO_RENDER", "0") not in ("0", "false", "no")
"""Tắt dựng hình. **Mặc định TẮT tính năng này** — đo rồi, không đáng.

Giả thuyết ban đầu: kịch bản không dùng camera sensor nào (mọi criteria và
``trajectory.TrajectoryRecorder`` chỉ đọc ``get_location()``/``get_velocity()``),
nên dựng hình là công việc bỏ đi và bỏ nó sẽ nhẹ GPU.

Đo trên máy này ngày 23/08/2026, ``sc_001``, lấy mẫu ``nvidia-smi`` mỗi 200 ms:

    render bật   GPU trung bình 0,6%   đỉnh 16%   thời gian tường 15,4 s
    render tắt   GPU trung bình 0,5%   đỉnh 16%   thời gian tường 15,9 s

Tức là **không có gì để tiết kiệm**: cửa sổ 800x600 gần như không làm RTX 4060
bận, nút cổ chai nằm ở physics phía CPU. Đổi lại cái giá rất thật — cửa sổ CARLA
đứng im, đúng cái bẫy CLAUDE.md cảnh báo ("nhìn thấy đường trống rồi kết luận
không chạy").

Giữ lại cờ vì nó có thể có ích ở cấu hình khác (màn 4K, GPU yếu, chạy nhiều
server song song trên một máy), nhưng bật nó thì phải đo lại trước.
"""

POLL_INTERVAL_S = int(os.environ.get("POLL_INTERVAL_S", "5"))

OUT_DIR = Path(os.environ.get("WORKER_OUT_DIR", str(Path(__file__).parent / "outputs")))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("worker")


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{BACKEND}{path}", timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BACKEND}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Chạy một job
# ---------------------------------------------------------------------------


def to_execution_result(job: dict, returncode: int, criteria_json: dict | None, error: str | None) -> dict:
    """Output ScenarioRunner -> payload ``ExecutionResult`` gửi về backend.

    Cách đọc output — cái gì là "chạy xong" và cái gì là "có nguy hiểm" — nằm ở
    ``sr_cli``, dùng chung với ``dev_ui.py``. Đọc docstring của
    ``sr_cli.run_succeeded`` trước khi đụng vào đây.
    """
    results = sr_cli.criteria_results(criteria_json)
    success = sr_cli.run_succeeded(returncode, criteria_json, error)

    metrics: dict[str, float] = {"criteria_count": float(len(results))}

    payload = {
        "scenario_id": job["scenario_id"],
        "xosc_path": job.get("xosc_path") or f"{job['scenario_id']}.xosc",
        "success": success,
        "criteria_results": results,
        "metrics": metrics,
        "ego_controller": job.get("ego_controller", ego_controllers.CONSTANT_SPEED),
    }
    if not success:
        # `ExecutionResult` từ chối success=False mà không có error — một lần
        # chạy hỏng không nói vì sao là một con số mất tích trong báo cáo.
        payload["error"] = error or f"ScenarioRunner thoát với mã {returncode}"
    return payload


def attach_trajectory(result: dict, metrics: dict, points: list) -> dict:
    """Gắn số quỹ đạo vào kết quả — **chỉ khi lượt chạy thành công**.

    Recorder bám vào actor mang ``role_name='hero'`` đang có trong world. Nếu
    ScenarioRunner không spawn được (``Error: Unable to add actors``) thì actor
    còn sót từ lượt TRƯỚC vẫn nằm đó và recorder đo nhầm sang lượt cũ.

    Đo được ngày 22/08: bốn lượt spawn hỏng liên tiếp vẫn trả về "khe hở nhỏ nhất
    29,04 m" và "lệch làn 63,88 m" — số trông hoàn toàn như thật, cho những kịch
    bản chưa bao giờ bắt đầu. Số đó mà đi vào báo cáo thì không ai lần ra được.

    Một lượt chạy hỏng phải nói là hỏng, không mang theo số của người khác.
    """
    if result.get("success"):
        result["metrics"].update(metrics)
        result["trajectory"] = points
    elif metrics:
        log.warning("  -> bỏ số quỹ đạo: lượt chạy hỏng nên chúng thuộc về actor còn sót")
    return result


def run_job(job: dict) -> dict:
    """Ghi .xosc ra file tạm, chạy ScenarioRunner, đọc JSON criteria."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    started_at = time.time()

    controller = job.get("ego_controller", ego_controllers.CONSTANT_SPEED)
    try:
        runtime_xosc = ego_controllers.prepare_xosc(job["xosc_content"], controller)
    except (OSError, ValueError) as exc:
        result = to_execution_result(job, -1, None, f"không chuẩn bị được ego controller: {exc}")
        result["metrics"]["wall_clock_s"] = round(time.time() - started_at, 1)
        return result

    with tempfile.NamedTemporaryFile("w", suffix=".xosc", delete=False, encoding="utf-8") as fh:
        fh.write(runtime_xosc)
        xosc_path = Path(fh.name)

    env = sr_cli.scenario_runner_env(CARLA_ROOT, SR_ROOT)
    cmd = sr_cli.scenario_runner_cmd(
        WORKER_PYTHON,
        xosc_path,
        host=CARLA_HOST,
        port=CARLA_PORT,
        timeout_s=SR_TIMEOUT_S,
        out_dir=OUT_DIR,
        tm_port=TM_PORT,
    )

    # Ghi quỹ đạo song song. Criteria của ScenarioRunner chỉ nói CÓ VA CHẠM
    # KHÔNG; nó không phân biệt được "tạt đầu đúng ý" với "tông đuôi ego", cũng
    # không phân biệt "suýt quẹt thật" với "chẳng có gì xảy ra". Xem
    # `trajectory.summarise`.
    recorder = trajectory.TrajectoryRecorder(CARLA_HOST, CARLA_PORT)
    recorder.start()

    error: str | None = None
    try:
        proc = subprocess.run(cmd, cwd=str(SR_ROOT), env=env, capture_output=True, text=True, timeout=RUN_TIMEOUT_S)
        returncode, stdout, stderr = proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        returncode, stdout, stderr = -1, "", ""
        error = f"quá {RUN_TIMEOUT_S}s, đã giết tiến trình"
    except OSError as exc:
        returncode, stdout, stderr = -1, "", ""
        error = f"không chạy được ScenarioRunner: {exc}"
    finally:
        xosc_path.unlink(missing_ok=True)
        # Đo hỏng không được làm hỏng lượt chạy: `stop()` nuốt lỗi và trả dict
        # rỗng, còn `recorder.error` chỉ đi vào log.
        trajectory_metrics, trajectory_points = recorder.stop()
        if recorder.error:
            log.warning("  -> không đo được quỹ đạo: %s", recorder.error)

    _, criteria_json, read_error = sr_cli.newest_criteria_json(OUT_DIR, started_at)
    error = error or read_error
    # Thứ tự quan trọng: stderr thật phải thắng thông báo chung. Bản trước đặt
    # "không sinh file JSON criteria" trước, nên nó che mất nguyên nhân thật
    # (lỗi XML, CARLA chưa sẵn sàng, ...) và người đọc log không biết vì sao.
    if error is None and returncode != 0:
        tail = (stderr or stdout or "").strip().splitlines()[-3:]
        error = "; ".join(tail) or f"mã thoát {returncode}"
    if error is None and criteria_json is None:
        error = "ScenarioRunner không sinh file JSON criteria"

    result = to_execution_result(job, returncode, criteria_json, error)
    attach_trajectory(result, trajectory_metrics, trajectory_points)
    result["metrics"]["wall_clock_s"] = round(time.time() - started_at, 1)
    return result


# ---------------------------------------------------------------------------
# Vòng lặp
# ---------------------------------------------------------------------------


def _log_trajectory(metrics: dict) -> None:
    """In số quỹ đạo ra log, kèm cách đọc — người trực worker đọc log chứ không đọc DB."""
    if "min_distance_m" not in metrics:
        return
    parts = [f"khe hở nhỏ nhất {metrics['min_distance_m']:.2f}m"]
    if "ttc_min_s" in metrics:
        parts.append(f"TTC {metrics['ttc_min_s']:.2f}s")
    if "adversary_lane_deviation_m" in metrics:
        parts.append(f"lệch làn {metrics['adversary_lane_deviation_m']:.2f}m")
    if "contact_longitudinal_m" in metrics:
        who = "ADVERSARY TÔNG ĐUÔI EGO" if metrics["contact_longitudinal_m"] < 0 else "ego đâm vào adversary"
        parts.append(who)
    log.info("  -> quỹ đạo: %s", " | ".join(parts))


def poll_once() -> bool:
    """Lấy một job và chạy. Trả ``True`` nếu có việc để làm."""
    try:
        jobs = _get("/api/v1/internal/jobs").get("jobs", [])
    except (urllib.error.URLError, OSError) as exc:
        log.warning("Không gọi được backend %s: %s", BACKEND, exc)
        return False

    if not jobs:
        return False

    # Kiểm CARLA TRƯỚC khi nhận job. Không có bước này thì một server treo biến
    # cả hàng đợi thành "kịch bản hỏng": job vẫn được lấy, ScenarioRunner vẫn
    # chết, và lỗi môi trường đi thẳng vào tỷ lệ hợp lệ của báo cáo.
    if not sr_cli.carla_is_ready(CARLA_HOST, CARLA_PORT):
        log.warning("CARLA chưa sẵn sàng ở %s:%s — để job nằm lại hàng đợi", CARLA_HOST, CARLA_PORT)
        return False

    # Đặt lại trước mỗi job: `load_world` đưa settings về mặc định.
    sr_cli.apply_no_rendering(CARLA_HOST, CARLA_PORT, NO_RENDER)

    job = jobs[0]
    log.info(
        "Nhận job %s cho %s | ego=%s",
        job.get("job_id"),
        job.get("scenario_id"),
        job.get("ego_controller", ego_controllers.CONSTANT_SPEED),
    )

    result = run_job(job)
    verdict = "chạy được" if result["success"] else f"HỎNG ({result.get('error')})"
    collided = any(
        c["name"].lower().startswith("collision") and c["result"] == "FAILURE" for c in result["criteria_results"]
    )
    log.info("  -> %s | va chạm: %s", verdict, "CÓ (tốt)" if collided else "không")
    _log_trajectory(result["metrics"])

    try:
        _post(f"/api/v1/internal/jobs/{job['job_id']}/result", result)
        log.info("  -> đã gửi kết quả về backend")
    except (urllib.error.URLError, OSError) as exc:
        # Không retry ở đây: job vẫn ở `pending` phía backend nên vòng sau lấy
        # lại được. Tự giữ trong RAM để gửi lại là dựng một hàng đợi thứ hai
        # không ai quan sát được.
        log.error("  -> gửi kết quả thất bại, job sẽ được lấy lại: %s", exc)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Worker GPU cho Scenario Forge")
    parser.add_argument("--once", action="store_true", help="Chạy đúng một job rồi thoát")
    args = parser.parse_args()

    log.info(
        "Worker khởi động. Backend=%s CARLA=%s:%s TM=%s render=%s",
        BACKEND, CARLA_HOST, CARLA_PORT, TM_PORT, "TẮT" if NO_RENDER else "bật",
    )
    if NO_RENDER:
        log.info("  (tắt dựng hình để nhẹ GPU — cửa sổ CARLA sẽ đứng im. Demo thì đặt CARLA_NO_RENDER=0)")
    if not (SR_ROOT / "scenario_runner.py").is_file():
        sys.exit(f"Không thấy scenario_runner.py trong {SR_ROOT} — đặt SR_ROOT cho đúng.")
    if not (CARLA_ROOT / "PythonAPI/carla").is_dir():
        sys.exit(f"Không thấy PythonAPI/carla trong {CARLA_ROOT} — đặt CARLA_ROOT cho đúng.")

    while True:
        had_work = poll_once()
        if args.once:
            if not had_work:
                log.info("Không có job nào đang chờ.")
            return
        if not had_work:
            time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
