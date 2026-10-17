@AGENTS.md

# Ghi chú vận hành khó suy ra cho VSOS

Chỉ giữ ở đây những bẫy đã gặp ngoài thực tế mà đọc code khó biết được. Hướng
dẫn thông thường nằm trong `README.md` và README của từng thư mục.

## CARLA trên máy dev này

CARLA 0.9.15 chạy native Ubuntu ở `~/CARLA_0.9.15`; ScenarioRunner 0.9.15 ở
`~/scenario_runner`. Bản Linux từng phải lấy từ mirror
`carla-releases.s3.us-east-005.backblazeb2.com/Linux/`, vì GitHub release
0.9.15 không có asset tương ứng.

Máy có Intel iGPU cạnh NVIDIA dGPU. Khi tự bật server, **phải ép Vulkan dùng
NVIDIA**:

```bash
cd ~/CARLA_0.9.15
__NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only \
    ./CarlaUE4.sh -carla-rpc-port=2000 -windowed -ResX=800 -ResY=600
```

Thiếu hai biến trên có thể khiến CARLA chọn Intel rồi rất chậm hoặc chết. Kiểm
tra bằng `vulkaninfo --summary | grep deviceName`. **Không thêm
`-quality-level=Low`**: cờ này từng làm server sập trên Town04.

Các thư viện hệ thống đã từng thiếu và gây lỗi `.so` khó hiểu:

```bash
sudo apt install -y libomp5 libsdl2-2.0-0 libxerces-c3.2 vulkan-tools
```

## Máy dùng CARLA 0.9.16 (`/opt/carla-simulator`)

Kiểm chứng ngày 17/10/2026: CARLA 0.9.16 + ScenarioRunner v0.9.16 trên RTX 5060
Laptop (Ubuntu, Python 3.10), đủ 6 file trong `fixtures/xosc/generated/` chạy
xong và `cut_in`, `wrong_way` tái hiện được va chạm.

- `CARLA_ROOT` tự rơi về `/opt/carla-simulator` khi không có `~/CARLA_0.9.15`
  (`worker/sr_cli.py::default_carla_root`, `scripts/demo.sh`).
- Client phải **cùng bản** với server. `worker/.venv` ghim `carla==0.9.15`, nên
  trỏ `WORKER_PYTHON` sang một Python 3.10 có `carla==0.9.16` cùng các
  dependency trong `~/scenario_runner/requirements.txt`. `make demo-check` báo
  lỗi nếu hai bản lệch nhau.
- ScenarioRunner v0.9.16 crash với mọi `AssignRouteAction` (kịch bản
  `wrong_way`): `TypeError: object of type 'NoneType' has no len()` trong
  `ChangeActorWaypoints`. Áp bản vá một lần:

```bash
git -C ~/scenario_runner apply \
    "$PWD/worker/patches/scenario_runner-0.9.16-assign-route.patch"
WORKER_PYTHON=/usr/bin/python3 make demo   # hoặc make demo-check
```

## Thu dữ liệu sensor từ CARLA

`worker/sensor_recorder.py` gắn radar, obstacle, IMU, collision (và camera RGB nếu
`--camera`) lên ego — toàn sensor built-in của CARLA, không gọi dịch vụ ngoài. Chạy
tay song song với scenario, hoặc đặt `SENSOR_RECORD_DIR=<dir>` (thêm
`SENSOR_CAMERA=1`) cho `worker/runner.py`. Ánh xạ cột dữ liệu ↔ 10 tham số AEB ở
[docs/vehicsim/aeb-parameter-ranges.md](docs/vehicsim/aeb-parameter-ranges.md).

Hai bẫy số liệu đã gặp: nửa giây đầu ScenarioRunner đặt lại tốc độ ego (IMU ~47
m/s²), và sau va chạm IMU đo xung lực đâm xe (~40 m/s²). `summary.json` loại cả hai
khỏi chỉ số phanh; `frames.csv` giữ nguyên số thô.

Ego trong `fixtures/xosc` dùng controller giữ tốc độ, **không có AEB**: lệnh brake
trong dữ liệu là controller giữ tốc độ, không phải AEB phanh khẩn cấp.

## Khi chạy ScenarioRunner thủ công

Dùng `worker/.venv` (Python 3.10), không dùng `.venv` của backend. Thêm cả
PythonAPI CARLA và ScenarioRunner vào `PYTHONPATH`, đồng thời luôn chọn Traffic
Manager port khác 8000 vì backend dev dùng cổng đó:

```bash
export PYTHONPATH="$HOME/CARLA_0.9.15/PythonAPI/carla:$HOME/scenario_runner"
cd ~/scenario_runner
/home/cong/code/P-130/worker/.venv/bin/python scenario_runner.py \
    --openscenario /duong/dan/toi.xosc --output --timeout 60 \
    --trafficManagerPort 8005
```

Nếu quên `--trafficManagerPort`, ScenarioRunner thường chỉ báo lỗi bind RPC
không nói rõ cổng 8000 đang trùng.

ScenarioRunner không tự di chuyển spectator. Khi chạy tay, bật
`worker/follow_hero.py` ở terminal khác trước khi chạy scenario; nếu không cửa
sổ CARLA có thể chỉ hiện đường trống dù scenario vẫn chạy. `make demo` và
`worker/dev_ui.py` đã tự làm việc này.

## Đọc kết quả ScenarioRunner

Trong mục tiêu của dự án, `CollisionTest = FAILURE` thường là **kết quả mong
muốn**: scenario đã tái hiện va chạm (`adversarial`). `CollisionTest = SUCCESS`
nghĩa là chạy xong nhưng không có va chạm (`ran_no_hazard`).

Không suy ra điều đó từ `GLOBAL RESULT`: đây là AND của mọi criterion, nên
`CheckDrivenDistance` hoặc `CheckMaximumVelocity` cũng có thể làm nó thành
`FAILURE`. Giữ tách biệt hai khái niệm:

- `run_succeeded`: tiến trình chạy xong, không crash/timeout;
- `had_collision`: riêng `CollisionTest` báo `FAILURE`.

Scenario kết thúc sớm hơn nhiều so với `duration_s` thường là storyboard hết
event sớm, không phải chạy nhanh; xem `_add_hold_open_event` trong converter.

## Lệnh có thể gọi LLM trả phí

Pytest mặc định chặn `call_with_escalation`; chỉ bật gọi thật có chủ đích bằng
`RUN_LLM_TESTS=1`. Ngược lại, `prompt_ab/runner.py` luôn gọi API thật và không
đi qua công tắc này. Artifact benchmark là bằng chứng tái lập, không sửa tay và
không tự động cho phép thay prompt production; quy trình đầy đủ ở
`prompt_ab/README.md`.
