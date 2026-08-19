"""UI nhỏ để chạy một file .xosc bằng ScenarioRunner — công cụ dev, không phải sản phẩm.

Mục đích: thay chuỗi lệnh dài lúc demo bằng một trang web upload file rồi bấm Chạy.
Cũng là bản nháp của ``worker/runner.py``: chỗ map ``ExecutionResult`` ở đây
(hàm ``to_execution_result``) chính là logic worker thật sẽ dùng.

Chỉ dùng thư viện chuẩn. **Không cài thêm gì vào ``worker/.venv``** — venv đó ghim
``carla==0.9.15`` và ``setuptools<81``, thêm dependency vào là mời gãy toolchain.

Chạy:

    python worker/dev_ui.py

CARLA server vẫn phải bật riêng (nó là app GPU trên Windows, UI không thay được):

    C:\\CARLA_0.9.15\\WindowsNoEditor\\CarlaUE4.exe -carla-rpc-port=2000 -windowed -ResX=640 -ResY=480

KHÔNG thêm ``-quality-level=Low`` — cờ đó làm server sập trên Town04, xem fixtures/README.md.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import sr_cli

# --- Cấu hình: sửa bằng biến môi trường nếu máy khác ------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
CARLA_ROOT = Path(os.environ.get("CARLA_ROOT", "/mnt/c/CARLA_0.9.15/WindowsNoEditor"))
SR_ROOT = Path(os.environ.get("SR_ROOT", str(Path.home() / "scenario_runner")))
WORKER_PYTHON = Path(os.environ.get("WORKER_PYTHON", str(REPO_ROOT / "worker/.venv/bin/python")))
OUT_DIR = Path(os.environ.get("OUT_DIR", str(REPO_ROOT / "out")))

CARLA_HOST = os.environ.get("CARLA_HOST", "127.0.0.1")
CARLA_PORT = int(os.environ.get("CARLA_PORT", "2000"))

UI_PORT = int(os.environ.get("UI_PORT", "8765"))
RUN_TIMEOUT_S = float(os.environ.get("RUN_TIMEOUT_S", "300"))
SR_TIMEOUT_S = os.environ.get("SR_TIMEOUT_S", "60")  # Town04 to, mặc định 10s của SR hay hụt
TM_PORT = os.environ.get("CARLA_TM_PORT", "8005")  # 8000 trùng cổng backend lúc dev, xem runner.py


# --- Chạy ScenarioRunner ----------------------------------------------------


def carla_reachable() -> bool:
    """Server có đang nghe cổng RPC không. Không import carla — chỉ mở socket."""
    try:
        with socket.create_connection((CARLA_HOST, CARLA_PORT), timeout=2):
            return True
    except OSError:
        return False


def start_follower(view: str, env: dict) -> subprocess.Popen | None:
    """Bật ``follow_hero.py`` để camera CarlaUE4 bám ego trong lúc chạy.

    ScenarioRunner không đụng vào spectator camera, nên nếu không có cái này thì
    cửa sổ CARLA vẫn nhìn vào chỗ map được load — thấy đường trống và tưởng
    scenario không chạy, trong khi nó đang diễn ra cách đó vài trăm mét.

    Chạy như tiến trình riêng chứ không phải thread: ``follow_hero`` cần
    ``import carla`` nên phải dùng python của worker, còn file này thì không.
    """
    if view == "off":
        return None
    follower = Path(__file__).resolve().parent / "follow_hero.py"
    if not follower.is_file():
        return None
    # Ghi ra file thay vì DEVNULL: follower chết câm thì triệu chứng là "camera
    # đứng im", không phân biệt được với "chưa bật". Có log mới debug được.
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    log = (OUT_DIR / "follow_hero.log").open("w", encoding="utf-8")
    return subprocess.Popen(
        [
            str(WORKER_PYTHON),
            str(follower),
            "--host",
            CARLA_HOST,
            "--port",
            str(CARLA_PORT),
            "--view",
            view,
        ],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )


def run_scenario(xosc_path: Path, view: str = "chase") -> dict:
    """Chạy một file .xosc, trả về log + JSON criteria (nếu có)."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    started_at = time.time()

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

    follower = start_follower(view, env)
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(SR_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT_S,
        )
        returncode, stdout, stderr = proc.returncode, proc.stdout, proc.stderr
        timed_out = False
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

    criteria_path, criteria_json, read_error = sr_cli.newest_criteria_json(OUT_DIR, started_at)
    if read_error:
        stderr += f"\n[dev_ui] {read_error}"

    log_path = OUT_DIR / "scenario_runner.log"
    log_text = f"$ {' '.join(cmd)}\n\n--- stdout ---\n{stdout}\n--- stderr ---\n{stderr}"
    log_path.write_text(log_text, encoding="utf-8")

    follow_log = OUT_DIR / "follow_hero.log"
    follow_text = ""
    if view != "off" and follow_log.is_file():
        follow_text = follow_log.read_text(encoding="utf-8", errors="replace").strip()

    return {
        "returncode": returncode,
        "timed_out": timed_out,
        "log": log_text,
        "log_path": str(log_path),
        "follow_log": follow_text,
        "criteria_json": criteria_json,
        "criteria_path": str(criteria_path) if criteria_path else None,
        "execution_result": to_execution_result(returncode, criteria_json),
        "duration_s": round(time.time() - started_at, 1),
    }


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


# --- Web UI -----------------------------------------------------------------

PAGE = """<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scenario Forge — chạy .xosc</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#111;--mut:#666;--line:#ddd;--ok:#0a7;--bad:#c33;--warn:#c80}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--mut:#999;--line:#333}}
*{box-sizing:border-box}
body{margin:0;padding:2rem 1rem;background:var(--bg);color:var(--fg);
  font:15px/1.6 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto}
h1{font-size:1.35rem;margin:0 0 .25rem}
.sub{color:var(--mut);margin:0 0 1.5rem}
.card{border:1px solid var(--line);border-radius:10px;padding:1rem;margin-bottom:1rem}
.row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mut);flex:none}
.dot.on{background:var(--ok)}.dot.off{background:var(--bad)}
button{font:inherit;padding:.5rem 1.1rem;border-radius:8px;border:1px solid var(--line);
  background:var(--fg);color:var(--bg);cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}
input[type=file]{font:inherit;max-width:100%}
pre{background:rgba(128,128,128,.1);padding:.8rem;border-radius:8px;overflow-x:auto;
  font:12.5px/1.5 ui-monospace,monospace;max-height:340px;white-space:pre-wrap;word-break:break-word}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid var(--line)}
th{color:var(--mut);font-weight:600}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.note{font-size:13px;color:var(--mut);border-left:3px solid var(--line);padding-left:.8rem;margin-top:.8rem}
code{font:12.5px ui-monospace,monospace;background:rgba(128,128,128,.14);padding:.1rem .35rem;border-radius:4px}
.hide{display:none}
</style></head><body><main>

<h1>Chạy file <code>.xosc</code> bằng ScenarioRunner</h1>
<p class="sub">Công cụ dev. CARLA server phải bật sẵn trên Windows.</p>

<div class="card">
  <div class="row"><span class="dot" id="dot"></span><span id="carla">đang kiểm tra CARLA…</span></div>
  <div class="note" id="paths"></div>
</div>

<div class="card">
  <div class="row">
    <input type="file" id="file" accept=".xosc,.xml">
    <label for="view" style="color:var(--mut)">Camera</label>
    <select id="view">
      <option value="chase">Bám sau ego</option>
      <option value="bird">Nhìn từ trên xuống</option>
      <option value="off">Không bám</option>
    </select>
    <button id="run" disabled>Chạy</button>
    <span id="hint" style="color:var(--mut)"></span>
  </div>
  <div class="note">Mặc định dùng <code>fixtures/xosc/sample_001_cut_in.xosc</code> nếu không chọn file —
    bấm Chạy luôn là được.<br>
    ScenarioRunner không tự di chuyển camera của CARLA. Không bám thì cửa sổ CarlaUE4 vẫn nhìn vào chỗ
    map được load, thấy đường trống dù kịch bản đang chạy cách đó vài trăm mét.
    <b>Nhìn từ trên xuống</b> dễ thấy đổi làn nhất.</div>
</div>

<div class="card hide" id="res">
  <h2 style="font-size:1.05rem;margin:.2rem 0 .8rem">Kết quả</h2>
  <table id="summary"></table>
  <div class="note" id="trap"></div>
  <h3 style="font-size:.95rem;margin:1.2rem 0 .4rem">Criteria</h3>
  <table id="crit"></table>
  <h3 style="font-size:.95rem;margin:1.2rem 0 .4rem">Log</h3>
  <pre id="log"></pre>
  <div id="followBox" class="hide">
    <h3 style="font-size:.95rem;margin:1.2rem 0 .4rem">Camera bám ego</h3>
    <pre id="followLog"></pre>
  </div>
</div>

<script>
const $ = s => document.querySelector(s);
let busy = false;

async function status(){
  try{
    const r = await (await fetch('/status')).json();
    $('#dot').className = 'dot ' + (r.carla ? 'on':'off');
    $('#carla').textContent = r.carla
      ? `CARLA đang chạy — ${r.host}:${r.port}`
      : `Không thấy CARLA ở ${r.host}:${r.port} — bật CarlaUE4.exe trước`;
    $('#paths').innerHTML =
      `ScenarioRunner: <code>${r.sr_root}</code><br>Python: <code>${r.python}</code><br>Output: <code>${r.out_dir}</code>`;
    if(!busy) $('#run').disabled = !r.carla;
  }catch(e){ $('#carla').textContent = 'không gọi được /status'; }
}
status(); setInterval(status, 4000);

$('#run').onclick = async () => {
  busy = true; $('#run').disabled = true; $('#hint').textContent = 'đang chạy, có thể mất vài phút…';
  const f = $('#file').files[0];
  const url = '/run?view=' + $('#view').value
            + '&name=' + encodeURIComponent(f ? f.name : 'sample_001_cut_in.xosc');
  const body = f ? await f.arrayBuffer() : new ArrayBuffer(0);
  try{
    const r = await (await fetch(url, {method:'POST', body})).json();
    render(r);
  }catch(e){
    $('#res').classList.remove('hide'); $('#log').textContent = 'Lỗi gọi /run: ' + e;
  }
  busy = false; $('#hint').textContent = ''; status();
};

function render(r){
  $('#res').classList.remove('hide');
  const x = r.execution_result || {};
  const yes = v => v ? '<span class="ok">có</span>' : '<span class="bad">không</span>';
  $('#summary').innerHTML = `
    <tr><th>ExecutionResult.success</th><td>${x.success ? '<span class="ok">true</span> — chạy xong, không crash'
        : '<span class="bad">false</span> — crash / timeout / lỗi XML'}</td></tr>
    <tr><th>had_collision</th><td>${yes(x.had_collision)} ${x.had_collision
        ? '<span class="ok">← dựng được nguy hiểm, đây là kết quả tốt</span>' : ''}</td></tr>
    <tr><th>Số criteria</th><td>${x.criteria_count ?? 0}</td></tr>
    <tr><th>Thời gian</th><td>${r.duration_s}s</td></tr>
    <tr><th>Exit code</th><td>${r.returncode}${r.timed_out ? ' (timeout)' : ''}</td></tr>
    <tr><th>File log</th><td><code>${r.log_path}</code></td></tr>
    <tr><th>File criteria</th><td>${r.criteria_path ? '<code>'+r.criteria_path+'</code>' : '—'}</td></tr>`;

  // Đơn vị: ScenarioRunner trả về m/s cho tốc độ, m cho quãng đường, s cho thời
  // lượng. Người đọc có trực giác về km/h chứ không có về m/s — và chính nhờ vậy
  // một lỗi đổi đơn vị trong converter (60 m/s = 216 km/h) sẽ đập vào mắt ngay.
  // Chỉ đổi ở TẦNG HIỂN THỊ; criteria_json giữ nguyên số gốc.
  function unitOf(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('velocity') || n.includes('speed')) return 'kmh';
    if (n.includes('distance')) return 'm';
    if (n.includes('duration') || n.includes('time')) return 's';
    return '';
  }
  function fmtVal(v, u) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    if (u === 'kmh') return (n * 3.6).toFixed(1) + ' km/h';
    if (u === 'm') return n.toFixed(1) + ' m';
    if (u === 's') return n.toFixed(2) + ' s';
    return String(n);
  }
  function rawHint(v, u) { return u === 'kmh' ? ` · gốc ${v} m/s` : ''; }

  const srs = x.sr_success_field;
  $('#trap').innerHTML = srs === undefined || srs === null ? '' :
    `<b>Bẫy:</b> JSON của ScenarioRunner có trường <code>success: ${srs}</code> —
     nó là AND của mọi criteria, <b>không phải</b> <code>ExecutionResult.success</code>.
     ${srs === false ? 'Ở đây <code>false</code> nghĩa là có tiêu chí không đạt — thường chính là va chạm đã xảy ra, tức kịch bản <b>thành công</b>.' : ''}`;

  const cs = (r.criteria_json || {}).criteria || [];
  $('#crit').innerHTML = cs.length
    ? '<tr><th>Tên</th><th>Kết quả</th><th>Đạt</th></tr>' + cs.map(c => {
        // Ngưỡng kỳ vọng chỉ hiện KHI TRƯỢT. Lúc đạt thì con số thực tế đã tự nói
        // lên mọi thứ (211,7 m thì khỏi cần biết vạch là 50), và ba ngưỡng vệ sinh
        // luôn-đạt chỉ làm nhiễu bảng. Trượt thì mới cần biết trượt cách vạch bao xa.
        const u = unitOf(c.name);
        const exp = fmtVal(c.expected, u), act = fmtVal(c.actual, u);
        const miss = c.success ? '' : ` <span style="opacity:.65">(kỳ vọng ${exp})</span>`;
        return `<tr><td>${c.name}</td>
         <td title="kỳ vọng ${exp}${rawHint(c.actual, u)}">${act}${miss}</td>
         <td>${c.success ? '<span class="ok">✓</span>' : '<span class="warn">✗</span>'}</td></tr>`;
      }).join('')
      + (cs.some(c => unitOf(c.name) === 'kmh')
         ? `<tr><td colspan="3" style="opacity:.7;font-size:.85em">
              Tốc độ đổi sang <b>km/h</b>; ScenarioRunner trả về m/s. Rê chuột lên ô kết quả để xem ngưỡng kỳ vọng và số gốc.
            </td></tr>`
         : '')
    : '<tr><td>Không có criteria — kịch bản chưa chạy tới nơi</td></tr>';

  $('#log').textContent = r.log || '';

  const fl = (r.follow_log || '').trim();
  $('#followBox').classList.toggle('hide', !fl);
  $('#followLog').textContent = fl;
}
</script></main></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 — khớp chữ ký lớp cha
        """Tắt log mỗi request cho đỡ ồn; lỗi thật vẫn trả về UI."""

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            self._send(200, PAGE.encode(), "text/html; charset=utf-8")
        elif path == "/status":
            self._json(
                200,
                {
                    "carla": carla_reachable(),
                    "host": CARLA_HOST,
                    "port": CARLA_PORT,
                    "sr_root": str(SR_ROOT),
                    "python": str(WORKER_PYTHON),
                    "out_dir": str(OUT_DIR),
                },
            )
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/run":
            self._json(404, {"error": "not found"})
            return

        query = parse_qs(parsed.query)
        length = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(length) if length else b""
        name = (query.get("name") or ["upload.xosc"])[0]
        view = (query.get("view") or ["chase"])[0]
        if view not in {"chase", "bird", "off"}:
            view = "chase"

        tmp_dir = Path(tempfile.mkdtemp(prefix="forge_xosc_"))
        try:
            if data:
                xosc = tmp_dir / Path(name).name
                xosc.write_bytes(data)
            else:
                xosc = REPO_ROOT / "fixtures/xosc/sample_001_cut_in.xosc"
                if not xosc.is_file():
                    self._json(400, {"error": f"không có file mặc định: {xosc}"})
                    return
            self._json(200, run_scenario(xosc, view=view))
        except Exception as exc:  # noqa: BLE001 — công cụ dev, trả lỗi ra UI thay vì chết câm
            self._json(500, {"error": f"{type(exc).__name__}: {exc}"})
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)


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

    print(f"UI: http://127.0.0.1:{UI_PORT}")
    print(f"CARLA: {CARLA_HOST}:{CARLA_PORT} — {'đang chạy' if carla_reachable() else 'CHƯA BẬT'}")
    print("Ctrl-C để dừng.")
    with ThreadingHTTPServer(("127.0.0.1", UI_PORT), Handler) as srv:
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
