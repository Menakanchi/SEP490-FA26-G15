# Ghi chú vận hành cho P-130

Những thứ không suy ra được từ code, và mất thời gian nếu phải mò lại.

## Chạy CARLA

Server là app GPU chạy native trên Ubuntu, giải nén ở `~/CARLA_0.9.15` (bản
`CARLA_0.9.15.tar.gz` cho Linux — GitHub release `0.9.15` không có asset nào,
tải từ mirror `carla-releases.s3.us-east-005.backblazeb2.com/Linux/`).

```bash
cd ~/CARLA_0.9.15
__NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only \
    ./CarlaUE4.sh -carla-rpc-port=2000 -windowed -ResX=800 -ResY=600
```

**Hai cờ `__NV_*` là bắt buộc.** Máy có Intel iGPU cạnh NVIDIA dGPU; thiếu chúng
thì Vulkan có thể chọn nhầm Intel và server bò hoặc chết. Kiểm GPU nào đang có:
`vulkaninfo --summary | grep deviceName`.

Cổng mở sau vài giây tới ~30 giây. Kiểm bằng:

```bash
python3 -c "import socket;s=socket.socket();s.settimeout(2);print(s.connect_ex(('127.0.0.1',2000))==0)"
```

Cổng mở chưa chắc server đã sẵn sàng — chắc ăn thì hỏi thẳng version:

```bash
PYTHONPATH="$HOME/CARLA_0.9.15/PythonAPI/carla" \
    worker/.venv/bin/python -c "import carla;print(carla.Client('127.0.0.1',2000).get_server_version())"
```

**KHÔNG thêm `-quality-level=Low`** — cờ đó làm server sập trên Town04. (Ghi
nhận từ bản Windows; chưa thử lại trên Linux, và cũng không có lý do gì để thử.)

Lib hệ thống cần có, nếu thiếu thì `CarlaUE4.sh` chết bằng lỗi `.so` khó hiểu:

```bash
sudo apt install -y libomp5 libsdl2-2.0-0 libxerces-c3.2 vulkan-tools
```

## Chạy một file .xosc

Cần `PythonAPI/carla` của CARLA trên `PYTHONPATH`, nếu không ScenarioRunner
chết ở `ModuleNotFoundError: No module named 'agents'`:

```bash
export PYTHONPATH="$HOME/CARLA_0.9.15/PythonAPI/carla:$HOME/scenario_runner"
cd ~/scenario_runner
/home/cong/code/P-130/worker/.venv/bin/python scenario_runner.py \
    --openscenario /đường/dẫn/tới.xosc --output --timeout 60 \
    --trafficManagerPort 8005
```

Dùng `worker/.venv`, **không** dùng `.venv` của repo: project uv của worker ghim
`carla==0.9.15` và `setuptools<81`, còn `src/` thì không bao giờ được import
carla (ADR-001).

**Luôn truyền `--trafficManagerPort`.** Mặc định của ScenarioRunner là 8000 —
đúng cổng backend chạy cùng máy lúc dev. Trùng cổng thì nó chết bằng một thông
báo chẳng liên quan gì tới nguyên nhân:

```text
RuntimeError: trying to create rpc server for traffic manager;
but the system failed to create because of bind error
```

`worker/runner.py` và `worker/dev_ui.py` mặc định `CARLA_ROOT=~/CARLA_0.9.15`,
`SR_ROOT=~/scenario_runner`, `CARLA_TM_PORT=8005` — đúng cho máy này, không cần
đặt gì. Giải nén CARLA chỗ khác thì override bằng biến môi trường cùng tên.

## Không nhìn thấy gì trong cửa sổ CARLA

ScenarioRunner **không** di chuyển spectator camera. Kịch bản chạy ở một góc
nào đó của Town04 còn cửa sổ vẫn nhìn vào chỗ map vừa load — nhìn vào đó thấy
đường trống và tưởng scenario không chạy.

Bật song song ở terminal khác, **trước** khi chạy scenario:

```bash
PYTHONPATH="$HOME/CARLA_0.9.15/PythonAPI/carla" \
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

## Quản lý dependency

Backend dùng `uv sync --locked` với `pyproject.toml` + `uv.lock`. Worker CARLA là
project Python 3.10 độc lập: `uv sync --project worker --locked`. Không dùng
`pip` hay `requirements.txt` cho dependency của repo.

## Gate trước khi push

`bash scripts/pre_push_check.sh` — ruff + pytest, cộng eslint/`next build` nếu
`frontend/` có thay đổi. Bỏ qua khi thật sự cần: `SKIP_CHECK=1 git push`.
