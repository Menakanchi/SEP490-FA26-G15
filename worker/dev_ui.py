"""UI dev: mô tả kịch bản → sinh ``.xosc`` → chạy CARLA → xem dữ liệu sensor. Không phải sản phẩm.

Bốn bước trên một trang (``worker/dev_ui_static/``):

1. **Mô tả** — câu tiếng Việt, mỗi dòng một kịch bản. Gửi sang pipeline 7 node của
   backend (``POST /api/v1/generate``) qua proxy ở đây, nên cần backend đang chạy và
   ``OPENAI_API_KEY``/``DEEPSEEK_API_KEY`` trong ``.env``. Không có key thì vẫn chọn
   được kịch bản mẫu trong ``fixtures/xosc/`` hoặc tải file ``.xosc`` lên.
2. **Kịch bản** — mỗi ``.xosc`` sinh ra kèm nhãn ODD, giả định, nút tải về.
3. **Chạy CARLA** — ScenarioRunner + camera bám ego + ``sensor_recorder`` gắn radar,
   obstacle, IMU, collision, camera RGB lên ego.
4. **Dữ liệu sensor** — trang ``/sensor?run=<id>``.

Chạy trực tiếp ở đây **không qua cổng duyệt** và không ghi kết quả vào thư viện;
kịch bản sinh ra vẫn nằm ở hàng chờ Cổng 1 của web chính. Mỗi lượt chạy lưu ở
``out/runs/<run_id>/`` (log, criteria, ``sensors/frames.csv``, ảnh camera).

Chỉ dùng thư viện chuẩn (cộng ``carla`` cho ``sensor_recorder``). **Không cài thêm gì
vào ``worker/.venv``** — venv đó ghim ``carla==0.9.15`` và ``setuptools<81``.

    WORKER_PYTHON=/usr/bin/python3 python3 worker/dev_ui.py     # máy CARLA 0.9.16
    worker/.venv/bin/python worker/dev_ui.py                     # máy CARLA 0.9.15

CARLA server vẫn phải bật riêng (nó là app GPU, UI không thay được), xem CLAUDE.md.
KHÔNG thêm ``-quality-level=Low`` — cờ đó làm server sập trên Town04.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import sensor_recorder
import sr_cli

# --- Cấu hình: sửa bằng biến môi trường nếu máy khác ------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "dev_ui_static"
CARLA_ROOT = sr_cli.default_carla_root()
SR_ROOT = Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner")))
WORKER_PYTHON = Path(os.environ.get("WORKER_PYTHON", str(REPO_ROOT / "worker/.venv/bin/python")))
OUT_DIR = Path(os.environ.get("OUT_DIR", str(REPO_ROOT / "out")))
RUNS_DIR = OUT_DIR / "runs"
BACKEND = os.environ.get("FORGE_BACKEND", "http://127.0.0.1:8000").rstrip("/")

CARLA_HOST = os.environ.get("CARLA_HOST", "127.0.0.1")
CARLA_PORT = int(os.environ.get("CARLA_PORT", "2000"))

UI_PORT = int(os.environ.get("UI_PORT", "8765"))
RUN_TIMEOUT_S = float(os.environ.get("RUN_TIMEOUT_S", "300"))
SR_TIMEOUT_S = os.environ.get("SR_TIMEOUT_S", "60")  # Town04 to, mặc định 10s của SR hay hụt
TM_PORT = os.environ.get("CARLA_TM_PORT", "8005")  # 8000 trùng cổng backend lúc dev, xem runner.py

SAMPLE_DIRS = ("fixtures/xosc/variants", "fixtures/xosc/generated", "fixtures/xosc")
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")

RUN_LOCK = threading.Lock()
"""Một CARLA chỉ chạy được một kịch bản một lúc; lượt thứ hai trả 409 thay vì chen vào."""


# --- Chạy ScenarioRunner ----------------------------------------------------


def carla_reachable() -> bool:
    """Server có đang nghe cổng RPC không. Không import carla — chỉ mở socket."""
    try:
        with socket.create_connection((CARLA_HOST, CARLA_PORT), timeout=2):
            return True
    except OSError:
        return False


def start_follower(view: str, env: dict, log_path: Path) -> subprocess.Popen | None:
    """Bật ``follow_hero.py`` để camera CarlaUE4 bám ego trong lúc chạy.

    ScenarioRunner không đụng vào spectator camera, nên nếu không có cái này thì
    cửa sổ CARLA vẫn nhìn vào chỗ map được load — thấy đường trống và tưởng
    scenario không chạy, trong khi nó đang diễn ra cách đó vài trăm mét.

    Chạy như tiến trình riêng chứ không phải thread: ``follow_hero`` cần
    ``import carla`` nên phải dùng python của worker.
    """
    if view == "off":
        return None
    follower = Path(__file__).resolve().parent / "follow_hero.py"
    if not follower.is_file():
        return None
    # Ghi ra file thay vì DEVNULL: follower chết câm thì triệu chứng là "camera
    # đứng im", không phân biệt được với "chưa bật". Có log mới debug được.
    log = log_path.open("w", encoding="utf-8")
    return subprocess.Popen(
        [str(WORKER_PYTHON), str(follower), "--host", CARLA_HOST, "--port", str(CARLA_PORT), "--view", view],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )


def _slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", text).strip("-.")[:48] or "run"


def run_scenario(xosc_path: Path, *, view: str = "chase", camera: bool = True, meta: dict | None = None) -> dict:
    """Chạy một file .xosc kèm sensor, lưu mọi thứ vào ``out/runs/<run_id>/``."""
    meta = dict(meta or {})
    run_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{_slug(meta.get('scenario_id') or xosc_path.stem)}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(xosc_path, run_dir / "scenario.xosc")
    started_at = time.time()

    env = sr_cli.scenario_runner_env(CARLA_ROOT, SR_ROOT)
    cmd = sr_cli.scenario_runner_cmd(
        WORKER_PYTHON,
        xosc_path,
        host=CARLA_HOST,
        port=CARLA_PORT,
        timeout_s=SR_TIMEOUT_S,
        out_dir=run_dir,
        tm_port=TM_PORT,
    )

    recorder = sensor_recorder.SensorRecorder(CARLA_HOST, CARLA_PORT, run_dir / "sensors", camera=camera)
    recorder.start()
    follower = start_follower(view, env, run_dir / "follow_hero.log")
    try:
        proc = subprocess.run(cmd, cwd=str(SR_ROOT), env=env, capture_output=True, text=True, timeout=RUN_TIMEOUT_S)
        returncode, stdout, stderr, timed_out = proc.returncode, proc.stdout, proc.stderr, False
    except subprocess.TimeoutExpired as exc:
        returncode, timed_out = -1, True
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = (exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")) + (
            f"\n[dev_ui] quá {RUN_TIMEOUT_S}s, đã giết tiến trình."
        )
    finally:
        if follower is not None:
            follower.terminate()
            try:
                follower.wait(timeout=5)
            except subprocess.TimeoutExpired:
                follower.kill()
        recorder.stop()

    _, criteria_json, read_error = sr_cli.newest_criteria_json(run_dir, started_at)
    if read_error:
        stderr += f"\n[dev_ui] {read_error}"
    log_text = f"$ {' '.join(cmd)}\n\n--- stdout ---\n{stdout}\n--- stderr ---\n{stderr}"
    (run_dir / "scenario_runner.log").write_text(log_text, encoding="utf-8")

    execution = to_execution_result(returncode, criteria_json)
    result = {
        **meta,
        "run_id": run_id,
        "xosc_name": xosc_path.name,
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(started_at)),
        "duration_s": round(time.time() - started_at, 1),
        "returncode": returncode,
        "timed_out": timed_out,
        "execution_result": execution,
        "criteria_json": criteria_json,
        "log": log_text,
        "run_dir": str(run_dir),
        # Lượt chạy hỏng thì sensor có thể đã bám actor còn sót của lượt trước —
        # cùng lý do với `runner.attach_trajectory`. Vẫn giữ file, nhưng không vẽ.
        "sensor_data": recorder.payload() if execution["success"] else None,
        "sensor_error": recorder.error,
        "camera_frames": recorder.camera_frames() if execution["success"] else [],
    }
    (run_dir / "run.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def to_execution_result(returncode: int, criteria_json: dict | None) -> dict:
    """Tóm tắt một lần chạy để hiện lên trang dev.

    Cách đọc output là của ``sr_cli`` — dùng chung với ``runner.py``, để bản dev
    và worker thật không bao giờ nói hai điều khác nhau về cùng một lần chạy.
    ``sr_success_field`` bày ra ở đây **cố ý**: nó là trường dễ đọc nhầm nhất,
    và nhìn thấy nó cạnh ``had_collision`` là cách nhanh nhất để thấy hai thứ đó
    không phải một (xem docstring ``sr_cli.run_succeeded``).
    """
    results = sr_cli.criteria_results(criteria_json)
    return {
        "success": sr_cli.run_succeeded(returncode, criteria_json),
        "criteria_count": len(results),
        "had_collision": sr_cli.had_collision(results),
        "sr_success_field": (criteria_json or {}).get("success"),
    }


def list_runs(limit: int = 30) -> list[dict]:
    runs = []
    for path in sorted(RUNS_DIR.glob("*/run.json"), reverse=True)[:limit]:
        try:
            r = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        execution = r.get("execution_result") or {}
        runs.append(
            {
                "run_id": r.get("run_id"),
                "title": r.get("title") or r.get("xosc_name"),
                "started_at": r.get("started_at"),
                "success": execution.get("success"),
                "had_collision": execution.get("had_collision"),
                "has_sensor": bool(r.get("sensor_data")),
            }
        )
    return runs


def list_samples() -> list[dict]:
    samples, seen = [], set()
    for rel in SAMPLE_DIRS:
        for path in sorted((REPO_ROOT / rel).glob("*.xosc")):
            if path.name in seen:
                continue
            seen.add(path.name)
            sample = {"name": path.name, "group": rel.removeprefix("fixtures/xosc").strip("/") or "gốc"}
            # Biến thể có spec JSON cùng tên: kèm tiêu đề, mô tả, ODD để màn chạy đọc được.
            spec_file = REPO_ROOT / "fixtures/scenario_specs" / sample["group"] / f"{path.stem}.json"
            if spec_file.is_file():
                try:
                    spec = json.loads(spec_file.read_text(encoding="utf-8"))
                    sample.update(
                        title=spec.get("title"),
                        description_vi=spec.get("description_vi"),
                        odd=spec.get("odd"),
                        time_of_day=spec.get("time_of_day"),
                    )
                except (OSError, json.JSONDecodeError):
                    pass
            samples.append(sample)
    return samples


def sample_path(name: str) -> Path | None:
    if not SAFE_NAME.match(name):
        return None
    for rel in SAMPLE_DIRS:
        path = REPO_ROOT / rel / name
        if path.is_file():
            return path
    return None


# --- Proxy tới backend Scenario Forge ---------------------------------------


def backend(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    """Gọi API backend. Proxy qua đây vì CORS của backend chỉ mở cho cổng 3000."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{BACKEND}/api/v1{path}", data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8") or "{}")
        except json.JSONDecodeError:
            body = {}
        return exc.code, {"error": body.get("detail") or body.get("error") or f"HTTP {exc.code}"}
    except (urllib.error.URLError, OSError) as exc:
        return 502, {"error": f"Không gọi được backend {BACKEND}: {exc}. Bật bằng `make demo` hoặc `make run`."}


def explain_generation_error(error: str | None) -> str | None:
    """Lỗi 401 của provider là lỗi cấu hình, không phải lỗi câu mô tả — nói thẳng ra."""
    if not error:
        return None
    if "invalid_api_key" in error or "Incorrect API key" in error or "401" in error:
        return (
            "Backend chưa có API key LLM hợp lệ. Điền OPENAI_API_KEY (hoặc LLM_PROVIDER=deepseek + "
            "DEEPSEEK_API_KEY) vào .env rồi khởi động lại backend. Trong lúc chờ, dùng kịch bản mẫu bên dưới."
        )
    return None


def llm_configured(env_file: Path | None = None) -> bool:
    """``.env`` có API key LLM thật chưa — chỉ đọc file, không gọi provider.

    Dùng để chọn màn mở đầu: chưa có key thì vào thẳng phần chạy kịch bản mẫu
    thay vì để người dùng gõ mô tả rồi mới nhận lỗi 401.
    """
    env_file = env_file or REPO_ROOT / ".env"
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    env = {}
    for line in lines:
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            env[key.strip()] = value.split("#", 1)[0].strip().strip('"').strip("'")
    key_name = "DEEPSEEK_API_KEY" if env.get("LLM_PROVIDER", "openai") == "deepseek" else "OPENAI_API_KEY"
    value = env.get(key_name, "")
    return bool(value) and "your" not in value and not value.endswith("here")


def scenario_brief(scenario_id: str) -> tuple[int, dict]:
    code, sc = backend("GET", f"/scenarios/{quote(scenario_id)}")
    if code != 200:
        return code, sc
    return 200, {
        "scenario_id": sc.get("scenario_id"),
        "title": sc.get("title"),
        "description_vi": sc.get("description_vi"),
        "odd": sc.get("odd") or {},
        "time_of_day": sc.get("time_of_day"),
        "assumptions": sc.get("assumptions") or [],
        "status": sc.get("status"),
        "xosc_bytes": len(sc.get("xosc_content") or ""),
    }


# --- HTTP -------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 — khớp chữ ký lớp cha
        """Tắt log mỗi request cho đỡ ồn; lỗi thật vẫn trả về UI."""

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict | list) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _static(self, name: str) -> None:
        path = STATIC_DIR / name
        ctype = {".html": "text/html", ".css": "text/css", ".js": "text/javascript"}.get(path.suffix, "text/plain")
        self._send(200, path.read_bytes(), f"{ctype}; charset=utf-8", {"Cache-Control": "no-store"})

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def do_GET(self) -> None:  # noqa: C901 — một bảng route phẳng dễ đọc hơn tách nhỏ
        path = urlparse(self.path).path
        parts = [p for p in path.split("/") if p]

        if path == "/":
            self._static("index.html")
        elif path == "/sensor":
            self._static("sensor.html")
        elif len(parts) == 1 and parts[0] in {"app.css", "common.js"}:
            self._static(parts[0])
        elif path == "/api/status":
            code, _ = backend("GET", "/scenarios?limit=1")
            self._json(
                200,
                {
                    "carla": carla_reachable(),
                    "host": CARLA_HOST,
                    "port": CARLA_PORT,
                    "backend": BACKEND,
                    "backend_ok": code == 200,
                    "llm_configured": llm_configured(),
                    "busy": RUN_LOCK.locked(),
                    "sr_root": str(SR_ROOT),
                    "python": str(WORKER_PYTHON),
                    "runs_dir": str(RUNS_DIR),
                },
            )
        elif path == "/api/samples":
            self._json(200, list_samples())
        elif path == "/api/runs":
            self._json(200, list_runs())
        elif len(parts) == 3 and parts[:2] == ["api", "generate"]:
            code, st = backend("GET", f"/status/{quote(parts[2])}")
            if code == 200:
                st["hint"] = explain_generation_error(st.get("error"))
                if st.get("step") == "done" and st.get("scenario_id"):
                    _, st["scenario"] = scenario_brief(st["scenario_id"])
            self._json(code, st)
        elif len(parts) == 3 and parts[:2] == ["api", "scenario"]:
            self._json(*scenario_brief(parts[2]))
        elif len(parts) == 4 and parts[:2] == ["api", "scenario"] and parts[3] == "xosc":
            code, sc = backend("GET", f"/scenarios/{quote(parts[2])}")
            xosc = (sc.get("xosc_content") or "") if code == 200 else ""
            if not xosc:
                self._json(404, {"error": "Kịch bản chưa có .xosc (ngoài phạm vi converter, ADR-016)"})
                return
            self._send(
                200,
                xosc.encode("utf-8"),
                "application/xml; charset=utf-8",
                {"Content-Disposition": f'attachment; filename="{_slug(parts[2])}.xosc"'},
            )
        elif len(parts) == 3 and parts[:2] == ["api", "runs"] and SAFE_NAME.match(parts[2]):
            run_file = RUNS_DIR / parts[2] / "run.json"
            if run_file.is_file():
                self._send(200, run_file.read_bytes(), "application/json; charset=utf-8")
            else:
                self._json(404, {"error": "không có lượt chạy này"})
        elif len(parts) == 4 and parts[0] == "runs" and parts[2] == "camera" and all(map(SAFE_NAME.match, parts[1:])):
            img = RUNS_DIR / parts[1] / "sensors" / "camera" / parts[3]
            if img.is_file():
                self._send(200, img.read_bytes(), "image/png", {"Cache-Control": "max-age=3600"})
            else:
                self._json(404, {"error": "không có ảnh"})
        elif len(parts) == 3 and parts[0] == "runs" and parts[2] in {"frames.csv", "scenario.xosc"}:
            if not SAFE_NAME.match(parts[1]):
                self._json(404, {"error": "not found"})
                return
            file = RUNS_DIR / parts[1] / ("sensors/frames.csv" if parts[2] == "frames.csv" else "scenario.xosc")
            if file.is_file():
                self._send(
                    200,
                    file.read_bytes(),
                    "text/csv; charset=utf-8" if parts[2] == "frames.csv" else "application/xml; charset=utf-8",
                    {"Content-Disposition": f'attachment; filename="{parts[1]}-{parts[2]}"'},
                )
            else:
                self._json(404, {"error": f"lượt chạy không có {parts[2]}"})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/api/generate":
            try:
                body = json.loads(self._body() or b"{}")
            except json.JSONDecodeError:
                self._json(400, {"error": "body không phải JSON"})
                return
            prompt = str(body.get("prompt") or "").strip()
            if not prompt:
                self._json(400, {"error": "Câu mô tả trống"})
                return
            self._json(*backend("POST", "/generate", {"prompt": prompt, "created_by": "dev_ui"}))
            return

        if parsed.path != "/api/run":
            self._json(404, {"error": "not found"})
            return

        view = (query.get("view") or ["chase"])[0]
        view = view if view in {"chase", "bird", "off"} else "chase"
        camera = (query.get("camera") or ["1"])[0] != "0"
        scenario_id = (query.get("scenario_id") or [""])[0]
        sample = (query.get("sample") or [""])[0]
        upload_name = (query.get("name") or ["upload.xosc"])[0]
        data = self._body()

        if not RUN_LOCK.acquire(blocking=False):
            self._json(409, {"error": "CARLA đang chạy một kịch bản khác — đợi lượt đó xong."})
            return
        tmp_dir = RUNS_DIR / ".tmp"
        try:
            tmp_dir.mkdir(parents=True, exist_ok=True)
            if scenario_id:
                code, sc = backend("GET", f"/scenarios/{quote(scenario_id)}")
                if code != 200 or not sc.get("xosc_content"):
                    self._json(400, {"error": sc.get("error") or "Kịch bản chưa có .xosc (ngoài phạm vi converter)"})
                    return
                xosc = tmp_dir / f"{_slug(scenario_id)}.xosc"
                xosc.write_text(sc["xosc_content"], encoding="utf-8")
                meta = {
                    "scenario_id": scenario_id,
                    "title": sc.get("title"),
                    "description_vi": sc.get("description_vi"),
                    "odd": sc.get("odd"),
                    "source": "generated",
                }
            elif sample:
                path = sample_path(sample)
                if path is None:
                    self._json(400, {"error": f"không có kịch bản mẫu {sample}"})
                    return
                xosc, meta = path, {"title": path.stem, "source": "sample"}
            elif data:
                xosc = tmp_dir / _slug(Path(upload_name).name)
                xosc.write_bytes(data)
                meta = {"title": Path(upload_name).stem, "source": "upload"}
            else:
                self._json(400, {"error": "Chưa chọn kịch bản để chạy"})
                return
            if not carla_reachable():
                self._json(503, {"error": f"Không thấy CARLA ở {CARLA_HOST}:{CARLA_PORT} — bật CarlaUE4 trước."})
                return
            self._json(200, run_scenario(xosc, view=view, camera=camera, meta=meta))
        except Exception as exc:  # noqa: BLE001 — công cụ dev, trả lỗi ra UI thay vì chết câm
            self._json(500, {"error": f"{type(exc).__name__}: {exc}"})
        finally:
            RUN_LOCK.release()


def main() -> int:
    problems = []
    if not WORKER_PYTHON.is_file():
        problems.append(f"không thấy python của worker: {WORKER_PYTHON}")
    if not (SR_ROOT / "scenario_runner.py").is_file():
        problems.append(f"không thấy scenario_runner.py trong: {SR_ROOT}")
    if not (CARLA_ROOT / "PythonAPI/carla").is_dir():
        problems.append(f"không thấy PythonAPI/carla trong: {CARLA_ROOT}")
    if problems:
        print("Cấu hình chưa đúng:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        print("\nSửa bằng biến môi trường: CARLA_ROOT, SR_ROOT, WORKER_PYTHON", file=sys.stderr)
        return 1

    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"UI: http://127.0.0.1:{UI_PORT}")
    print(f"CARLA: {CARLA_HOST}:{CARLA_PORT} — {'đang chạy' if carla_reachable() else 'CHƯA BẬT'}")
    print(f"Backend: {BACKEND}")
    print("Ctrl-C để dừng.")
    with ThreadingHTTPServer(("127.0.0.1", UI_PORT), Handler) as srv:
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
