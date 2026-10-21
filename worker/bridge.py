"""Client của cầu nối Java ↔ CARLA (ADR-042, giao thức ``vsos-bridge/1``). Không có logic AEB: chỉ gửi quan sát, nhận lệnh.

Lõi (AEB, khung tọa độ, đo giảm tốc, bàn đạp phanh, chấm điểm, ``result.json``) chạy trong một tiến trình Java con của controller:

    java -cp target/classes com.vehicsim.core.bridge.BridgeMain session

Mỗi dòng stdin là một yêu cầu JSON, mỗi yêu cầu có đúng một dòng trả lời. Quy tắc:

- Mỗi yêu cầu có hạn chót; quá hạn, đứt ống hoặc ``"ok": false`` đều là lỗi — **không** rơi về giá trị mặc định (run kết thúc có lỗi, không có điểm giả).
- Java thoát khi stdin đóng, nên tiến trình Java không bao giờ mồ côi kể cả khi ScenarioRunner bị giết cứng.
- stderr của Java ghi vào ``bridge.log`` trong thư mục run.

Java và classpath lấy từ ``VEHICSIM_JAVA`` (mặc định ``java`` trên PATH) và ``VEHICSIM_CORE_CLASSPATH`` (mặc định ``<repo>/target/classes``,
cần ``mvnw compile`` trước). ``run_xosc.py`` độc lập vẫn chạy được: không cần backend đang chạy.
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
from pathlib import Path

PROTOCOL = "vsos-bridge/1"
MAIN_CLASS = "com.vehicsim.core.bridge.BridgeMain"
ROOT = Path(__file__).resolve().parent.parent
HELLO_TIMEOUT_S = 30.0  # gồm cả thời gian khởi động JVM
OPEN_TIMEOUT_S = 30.0
STEP_TIMEOUT_S = 10.0
EXIT_BAD_INPUT = 2


class BridgeError(RuntimeError):
    """Cầu nối lỗi: không có kết quả hợp lệ để đọc."""


def java_command() -> list[str]:
    java = os.environ.get("VEHICSIM_JAVA") or shutil.which("java")
    if not java:
        raise BridgeError("không tìm thấy Java: cài JDK 21 hoặc đặt VEHICSIM_JAVA")
    classpath = os.environ.get("VEHICSIM_CORE_CLASSPATH") or str(ROOT / "target" / "classes")
    if not Path(classpath.split(os.pathsep)[0]).exists():
        raise BridgeError(f"chưa có lõi Java tại {classpath}: chạy `.\\mvnw.cmd compile` (hoặc đặt VEHICSIM_CORE_CLASSPATH)")
    # SerialGC + Xshare: khởi động nhanh; tiến trình nhỏ, sống đúng bằng một run.
    return [java, "-XX:+UseSerialGC", "-Xshare:auto", "-cp", classpath, MAIN_CLASS]


def xosc_info(xosc: Path, timeout: float = 30.0) -> dict:
    """Profile thời gian của file ``.xosc`` (``suffix``, ``step_s``, ``perception_period_s``); đồng thời kiểm file theo hợp đồng của lõi.

    Ném ``ValueError`` (kèm lý do) khi file không hợp lệ, ``BridgeError`` khi không chạy được Java.
    """
    try:
        done = subprocess.run([*java_command(), "info", str(xosc)], capture_output=True, text=True, encoding="utf-8", timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise BridgeError(f"Java đọc .xosc quá {timeout:g} s") from exc
    if done.returncode == EXIT_BAD_INPUT:
        raise ValueError(done.stderr.strip() or "file .xosc không hợp lệ")
    if done.returncode != 0 or not done.stdout.strip():
        raise BridgeError(f"Java thoát mã {done.returncode}: {done.stderr.strip()[-400:]}")
    return json.loads(done.stdout.strip().splitlines()[-1])


class Bridge:
    """Một phiên với tiến trình Java. Dùng trong thread của controller ScenarioRunner; không an toàn khi gọi từ nhiều thread."""

    def __init__(self, log: Path) -> None:
        log.parent.mkdir(parents=True, exist_ok=True)
        self._log = log.open("w", encoding="utf-8")
        try:
            self._proc = subprocess.Popen(java_command() + ["session"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._log,
                                          text=True, encoding="utf-8", bufsize=1)
        except OSError as exc:
            self._log.close()
            raise BridgeError(f"không chạy được Java: {exc}") from exc
        self._lines: queue.Queue[str | None] = queue.Queue()
        threading.Thread(target=self._pump, name="vsos-bridge-reader", daemon=True).start()
        hello = self.request("hello", timeout=HELLO_TIMEOUT_S, protocol=PROTOCOL)
        self.core = hello.get("core")

    def _pump(self) -> None:
        assert self._proc.stdout is not None
        for line in self._proc.stdout:
            self._lines.put(line)
        self._lines.put(None)  # EOF: Java đã thoát

    def request(self, op: str, timeout: float = STEP_TIMEOUT_S, **fields) -> dict:
        proc = self._proc
        if proc.poll() is not None and self._lines.empty():
            raise BridgeError(f"tiến trình Java đã thoát (mã {proc.returncode}); xem {self._log.name}")
        try:
            assert proc.stdin is not None
            proc.stdin.write(json.dumps({"op": op, **fields}) + "\n")
            proc.stdin.flush()
        except (OSError, ValueError) as exc:
            raise BridgeError(f"đứt ống tới Java khi gửi {op}: {exc}") from exc
        try:
            line = self._lines.get(timeout=timeout)
        except queue.Empty:
            self.kill()
            raise BridgeError(f"Java không trả lời {op} trong {timeout:g} s") from None
        if line is None:
            raise BridgeError(f"Java đóng ống khi chờ trả lời {op}; xem {self._log.name}")
        reply = json.loads(line)
        if not reply.get("ok"):
            raise BridgeError(f"Java báo lỗi cho {op}: {reply.get('error')}")
        return reply

    def kill(self) -> None:
        if self._proc.poll() is None:
            self._proc.kill()

    def close(self, grace_s: float = 5.0) -> None:
        """Đóng stdin (Java thoát khi EOF), chờ ngắn rồi giết nếu còn."""
        try:
            if self._proc.stdin and not self._proc.stdin.closed:
                self._proc.stdin.close()
        except OSError:
            pass
        try:
            self._proc.wait(timeout=grace_s)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait(timeout=grace_s)
        finally:
            self._log.close()
