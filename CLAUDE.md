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

## Máy dùng CARLA 0.9.16 trên Ubuntu (`/opt/carla-simulator`)

Kiểm chứng ngày 17/10/2026: CARLA 0.9.16 + ScenarioRunner v0.9.16 trên RTX 5060 Laptop (Ubuntu, Python 3.10), chạy xong và `cut_in`, `wrong_way` tái hiện được va chạm.

- `CARLA_ROOT` tự rơi về `/opt/carla-simulator` khi không có `~/CARLA_0.9.15`.
- Client phải **cùng bản** với server (`carla==0.9.16`).
- ScenarioRunner v0.9.16 crash với mọi `AssignRouteAction` (kịch bản `wrong_way`): `TypeError: object of type 'NoneType' has no len()` trong `ChangeActorWaypoints`. Áp bản vá một lần:

```bash
git -C ~/scenario_runner apply "$PWD/worker/patches/scenario_runner-0.9.16-assign-route.patch"
```

## Thu dữ liệu sensor từ CARLA

`worker/sensor_recorder.py` gắn radar, obstacle, IMU, collision (và camera RGB nếu `--camera`) lên ego — toàn sensor built-in của CARLA, không gọi dịch vụ ngoài. Ánh xạ cột dữ liệu ↔ 4 tham số AEB chỉnh được + 6 hằng số ở [docs/vehicsim/aeb-parameter-ranges.md](docs/vehicsim/aeb-parameter-ranges.md).

Hai bẫy số liệu đã gặp: nửa giây đầu ScenarioRunner đặt lại tốc độ ego (IMU ~47 m/s²), và sau va chạm IMU đo xung lực đâm xe (~40 m/s²). `summary.json` và `TelemetryMetricsService.java` loại cả hai khỏi chỉ số phanh và 3 mục tiêu MOBO; `frames.csv` giữ nguyên số thô.

## CARLA trên máy Windows dev (TrungDQ)

Khác máy Ubuntu ở trên: server **0.9.16** ở `C:\Carla_package`, client là Python 3.12
hệ thống (`py -3.12`, gói `carla 0.9.16` khớp server). Chạy batch ở đây thì đặt
`VEHICSIM_CARLA_VERSION=0.9.16`, nếu không mọi run CARLA FAILED vì lệch phiên bản.

```bat
C:\Carla_package\CarlaUE4.exe -windowed -ResX=800 -ResY=600 -quality-level=Low
py -3.12 worker\run_variant.py vehicsim-run-42.json
```

Máy chỉ có GPU tích hợp AMD: `-quality-level=Low` chạy ổn với Town10HD_Opt mặc định
(cảnh báo về cờ này ở trên là của Linux/Town04). Server ăn ~3 GB RAM; ngày 01/10 Docker
Desktop tự thoát trong lúc CARLA chạy (chưa rõ nguyên nhân) — bật lại bằng
`scripts\dev-up.cmd`. Máy chưa có `ffmpeg` nên `--video` chỉ ra ảnh PNG từng khung.

Kết quả CARLA khác bộ động học là **bình thường**: phanh xe CARLA yếu hơn và người đi
bộ tăng tốc dần (số đo ở TD-17, exec plan 2026-10-01). Đừng "sửa" cho khớp số.

Lúc nạp map server lên tới ~8 GB RAM rồi mới hạ về ~4 GB; máy còn ít RAM (Docker đang
chạy) thì nó có thể thoát ngay sau khi mở mà không để log. Nếu cửa sổ CARLA **đứng hình**
sau khi một lượt `run_variant.py` bị giết (Ctrl+C hai lần, đóng terminal, timeout), server
đang kẹt chế độ đồng bộ: chạy lại bất kỳ JSON nào — runner tự gỡ và xoá actor
`vehicsim_*` sót lại. Không giết `run_variant.py` bằng Task Manager khi chưa cần.

## Khi chạy ScenarioRunner thủ công

Dùng để kiểm một file `.xosc` do bộ sinh OpenSCENARIO (`src/services/openscenario`, ADR-032)
xuất ra — vòng VehicSim tự nó chạy CARLA bằng `worker/run_variant.py`, không qua ScenarioRunner.

Dùng `worker/.venv` (Python 3.10), không dùng `.venv` của backend. Thêm cả
PythonAPI CARLA và ScenarioRunner vào `PYTHONPATH`, đồng thời luôn chọn Traffic
Manager port khác 8000 vì backend dev dùng cổng đó:

```bash
export PYTHONPATH="$HOME/CARLA_0.9.15/PythonAPI/carla:$HOME/scenario_runner"
cd ~/scenario_runner
<repo>/worker/.venv/bin/python scenario_runner.py \
    --openscenario /duong/dan/toi.xosc --output --timeout 60 \
    --trafficManagerPort 8005
```

Nếu quên `--trafficManagerPort`, ScenarioRunner thường chỉ báo lỗi bind RPC
không nói rõ cổng 8000 đang trùng.

ScenarioRunner không tự di chuyển spectator. Khi chạy tay, bật
`worker/follow_hero.py` ở terminal khác trước khi chạy scenario; nếu không cửa
sổ CARLA có thể chỉ hiện đường trống dù scenario vẫn chạy.

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
`RUN_LLM_TESTS=1`. Ngoài test, chỉ một đường gọi LLM thật: bước "Sinh từ mô tả"
(`describe.py`), đi qua `src/services/llm.py` (Meomeo Agent đã gỡ — ADR-035).
