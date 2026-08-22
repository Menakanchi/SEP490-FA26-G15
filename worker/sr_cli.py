"""Cách gọi ScenarioRunner và cách đọc kết quả nó trả về. **Dùng chung.**

``runner.py`` (worker thật, kéo job từ backend) và ``dev_ui.py`` (công cụ dev,
chạy một file .xosc bằng tay) làm cùng ba việc: dựng ``PYTHONPATH``, dựng dòng
lệnh ScenarioRunner, rồi đọc file JSON criteria mới nhất. Cả ba từng được viết
hai lần, và đã lệch: ``dev_ui`` không truyền ``--trafficManagerPort``, và bản
``to_execution_result`` của nó bỏ mất tham số ``error``.

Chỉ thư viện chuẩn — ``worker/.venv`` ghim ``carla==0.9.15`` và ``setuptools<81``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path


def scenario_runner_env(carla_root: Path, sr_root: Path, base: dict[str, str] | None = None) -> dict[str, str]:
    """Env cho tiến trình ScenarioRunner, với ``PYTHONPATH`` đã có PythonAPI/carla.

    Thiếu đường dẫn đó thì ScenarioRunner chết ở ``No module named 'agents'`` —
    một thông báo không trỏ về nguyên nhân thật, nên nó tốn hàng giờ mỗi lần
    một máy mới thiếu nó.
    """
    env = dict(os.environ if base is None else base)
    env["PYTHONPATH"] = os.pathsep.join(
        [str(carla_root / "PythonAPI/carla"), str(sr_root), env.get("PYTHONPATH", "")]
    ).rstrip(os.pathsep)
    return env


def scenario_runner_cmd(
    python: Path,
    xosc_path: Path,
    *,
    host: str,
    port: str | int,
    timeout_s: str,
    out_dir: Path,
    tm_port: str | int | None = None,
) -> list[str]:
    """Dòng lệnh ScenarioRunner.

    ``tm_port`` **nên** được truyền: mặc định của ScenarioRunner là 8000, trùng
    cổng backend lúc dev, và va cổng làm nó chết bằng một ``bind error`` không
    nói gì về nguyên nhân.
    """
    cmd = [
        str(python),
        "scenario_runner.py",
        "--openscenario",
        str(xosc_path),
        "--host",
        host,
        "--port",
        str(port),
        "--timeout",
        timeout_s,
    ]
    if tm_port is not None:
        cmd += ["--trafficManagerPort", str(tm_port)]
    return cmd + ["--json", "--outputDir", str(out_dir)]


def newest_criteria_json(out_dir: Path, started_at: float) -> tuple[Path | None, dict | None, str | None]:
    """File JSON criteria mới nhất sinh sau ``started_at``, đã parse.

    ScenarioRunner đặt tên file theo ``<config><timestamp>.json`` nên không đoán
    tên được — phải quét theo thời gian sửa. Trả về ``(path, data, error)``;
    ``error`` khác ``None`` nghĩa là có file nhưng đọc không nổi.
    """
    candidates = [p for p in out_dir.glob("*.json") if p.stat().st_mtime >= started_at - 1]
    if not candidates:
        return None, None, None
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    try:
        return newest, json.loads(newest.read_text(encoding="utf-8")), None
    except (OSError, json.JSONDecodeError) as exc:
        return newest, None, f"đọc {newest.name} hỏng: {exc}"


def criteria_results(criteria_json: dict | None) -> list[dict]:
    """Criteria của ScenarioRunner -> danh sách ``CriterionResult``.

    ``CriterionResult`` chỉ có ba trường và ``ForgeModel`` cấm trường lạ — gửi
    thừa ``expected`` là backend trả 422 và cả lần chạy CARLA thành công vẫn mất
    kết quả. Giữ đúng hợp đồng, đừng gửi "cho đầy đủ".
    """
    return [
        {
            "name": str(c.get("name") or "unknown"),
            # ScenarioRunner dùng `success: bool`; từ vựng của ta là SUCCESS/FAILURE.
            "result": "SUCCESS" if c.get("success", False) else "FAILURE",
            "actual": str(c.get("actual", "")),
        }
        for c in (criteria_json or {}).get("criteria", []) or []
    ]


def run_succeeded(returncode: int, criteria_json: dict | None, error: str | None = None) -> bool:
    """Lần chạy có **hoàn tất** không. **Đây là chỗ dễ sai nhất của cả worker.**

    JSON của ScenarioRunner *cũng* có trường ``success``, nhưng nó là AND của
    mọi criteria — tức ``false`` khi **có va chạm**, mà va chạm chính là thứ
    Forge muốn dựng ra. Chép thẳng trường đó sang ``ExecutionResult.success`` sẽ
    đếm mọi kịch bản thành công thành "chạy hỏng": kéo tụt validity rate và làm
    mất luôn ``adversarial_found``.

    ``ExecutionResult.success`` chỉ có nghĩa **chạy xong, không crash / timeout /
    lỗi XML**. Việc kịch bản có tái hiện được nguy hiểm hay không nằm ở
    ``criteria_results``, là một trục hoàn toàn khác.
    """
    return returncode == 0 and criteria_json is not None and error is None


def had_collision(results: list[dict]) -> bool:
    """Ego có va chạm không — tức kịch bản **đã dựng được** tình huống nguy hiểm."""
    return any("collision" in r["name"].lower() and r["result"] == "FAILURE" for r in results)


def carla_is_ready(host: str, port: int, timeout_s: float = 5.0) -> bool:
    """CARLA có **trả lời** không — không phải chỉ có mở cổng.

    Phân biệt này tốn tiền thật để học. Ngày 22/08, server treo sau ~25 lượt chạy
    liên tiếp: tiến trình còn sống, cổng 2000 vẫn mở, nhưng mọi lời gọi API
    time-out. Worker không biết nên vẫn lấy job, ScenarioRunner chết, và **4 kịch
    bản bị đánh dấu hỏng vì lỗi môi trường** — chúng đi thẳng vào tỷ lệ M1 như thể
    kịch bản có vấn đề.

    Một lần bắt tay ``get_server_version()`` phân biệt được hai trạng thái đó.
    """
    import socket

    with socket.socket() as probe:
        probe.settimeout(timeout_s)
        if probe.connect_ex((host, int(port))) != 0:
            return False
    try:
        import carla  # noqa: PLC0415 — chỉ worker mới có, và chỉ cần ở đây
    except ImportError:
        return True  # không kiểm được thì đừng chặn; ScenarioRunner sẽ tự báo lỗi

    try:
        client = carla.Client(host, int(port))
        client.set_timeout(timeout_s)
        client.get_server_version()
    except RuntimeError:
        return False
    return True
