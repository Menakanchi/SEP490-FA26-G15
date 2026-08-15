# Ghi chú vận hành cho P-130

Những thứ không suy ra được từ code, và mất thời gian nếu phải mò lại.

## Chạy CARLA

Server là app GPU chạy trên **Windows**, không phải trong WSL. Bật từ WSL được:

```bash
powershell.exe -NoProfile -Command "Start-Process -FilePath 'C:\CARLA_0.9.15\WindowsNoEditor\CarlaUE4.exe' -ArgumentList '-carla-rpc-port=2000','-windowed','-ResX=640','-ResY=480'"
```

Mất khoảng 30-60 giây mới mở cổng. Kiểm bằng:

```bash
python3 -c "import socket;s=socket.socket();s.settimeout(2);print(s.connect_ex(('127.0.0.1',2000))==0)"
```

**KHÔNG thêm `-quality-level=Low`** — cờ đó làm server sập trên Town04.

## Chạy một file .xosc

Cần `PythonAPI/carla` của CARLA trên `PYTHONPATH`, nếu không ScenarioRunner
chết ở `ModuleNotFoundError: No module named 'agents'`:

```bash
export PYTHONPATH="/mnt/c/CARLA_0.9.15/WindowsNoEditor/PythonAPI/carla:$HOME/scenario_runner"
cd ~/scenario_runner
/home/cong/code/P-130/worker/.venv/bin/python scenario_runner.py \
    --openscenario /đường/dẫn/tới.xosc --output --timeout 60
```

Dùng `worker/.venv`, **không** dùng `.venv` của repo: venv worker ghim
`carla==0.9.15` và `setuptools<81`, còn `src/` thì không bao giờ được import
carla (ADR-001).

## Không nhìn thấy gì trong cửa sổ CARLA

ScenarioRunner **không** di chuyển spectator camera. Kịch bản chạy ở một góc
nào đó của Town04 còn cửa sổ vẫn nhìn vào chỗ map vừa load — nhìn vào đó thấy
đường trống và tưởng scenario không chạy.

Bật song song ở terminal khác, **trước** khi chạy scenario:

```bash
PYTHONPATH="/mnt/c/CARLA_0.9.15/WindowsNoEditor/PythonAPI/carla" \
    worker/.venv/bin/python worker/follow_hero.py          # bám sau xe
    # hoặc: --view bird                                     # nhìn từ trên
```

Nó chỉ đọc vị trí xe rồi đặt spectator, không gọi `world.tick()` nên không phá
chế độ synchronous mà ScenarioRunner đang giữ.

## Đọc kết quả ScenarioRunner

`CollisionTest = FAILURE` là **tin tốt**: nghĩa là kịch bản đã dựng được tình
huống nguy hiểm — đúng thứ ta muốn (`adversarial_found`). `GLOBAL RESULT =
FAILURE` đi kèm nó cũng vậy.

Ngược lại, `CollisionTest = SUCCESS` (0 va chạm) nghĩa là kịch bản **chạy trót
lọt nhưng không tái hiện được nguy hiểm nào** — về mặt sản phẩm đó mới là thất
bại. Đừng đọc ngược.

## Test gọi LLM

`pytest` mặc định **chặn** mọi lần gọi `call_with_escalation` (fixture autouse
trong `tests/conftest.py`). Muốn chạy thật:

```bash
RUN_LLM_TESTS=1 pytest tests/test_agents/test_nodes/
```

Có lý do: lỗi "test âm thầm gọi API trả phí" đã lọt vào repo ba lần, mỗi lần
đều xanh trên máy người viết vì họ có sẵn key.

## Gate trước khi push

`bash scripts/pre_push_check.sh` — ruff + pytest, cộng eslint/`next build` nếu
`frontend/` có thay đổi. Bỏ qua khi thật sự cần: `SKIP_CHECK=1 git push`.
