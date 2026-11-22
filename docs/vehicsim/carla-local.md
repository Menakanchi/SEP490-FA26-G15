# OpenSCENARIO và CARLA 0.9.16 trên Windows

Web xuất `.xosc` OpenSCENARIO 1.0 và gọi ScenarioRunner để chạy trên máy Windows đang chạy backend.
Controller Python chỉ đọc trạng thái CARLA và áp bàn đạp; `AebStack` và bộ chấm của lõi Java quyết định qua cầu nối `vsos-bridge/1`. Cửa sổ CARLA bám theo xe; web xem ảnh RGB và số đo sau khi run xong.
Phạm vi hiện tại là **CP_CROSSING** (người đi bộ băng ngang hoặc dừng ở lề), đúng IR mà web đang hỗ trợ.

## Chuẩn bị một lần

- CARLA 0.9.16 ở `C:\Carla_package` (đổi bằng `-CarlaRoot` nếu đặt nơi khác).
- Python 3.12 (`py -3.12`), Git, JDK 21, Docker Desktop và frontend đã `npm ci`.

```powershell
.\scripts\setup-carla.ps1
.\scripts\dev-carla.ps1 -RestartBackend
```

Setup tạo `worker/.venv-carla/`, cài dependencies từ `worker/requirements-carla-0.9.16.txt` và lấy ScenarioRunner tag
v0.9.16 vào `~/scenario_runner`; không sửa venv CARLA 0.9.15 cũ. Script dev đặt biến môi trường cho phiên chạy,
chọn `VEHICSIM_SIMULATOR=carla-xosc`, phiên bản 0.9.16 và timeout 300 s. `.env` và DB không bị ghi lại.
`-RestartBackend` chỉ dừng Java đang phục vụ :8001 khi command line thuộc repo này; ứng dụng khác không bị dừng.
Các dịch vụ app do script CARLA khởi động chạy nền; mở `http://localhost:3000/analysis/carla` để sử dụng.

## Dùng trên web

1. Đăng nhập bằng ADMIN, ENGINEER hoặc EXPERIENCER; MANAGER/REVIEWER vẫn xem được nhưng không khởi chạy.
2. Tạo một họ nhỏ ở **Kịch bản**, hoặc chọn họ đã có. Mỗi biến thể là một run CARLA, chạy lần lượt trên một server.
3. Vào **Phân tích → Dữ liệu CARLA**; kiểm tra kết nối, chọn họ rồi bấm **Chạy trên CARLA**.
4. Chờ trạng thái **Hoàn thành**, bấm **Xem cảm biến**: 3 số đo, ảnh RGB có thanh chọn khung, tải CSV/JSON va chạm.
5. **Phát lại** dùng dữ liệu AEB/ground truth cùng định dạng với vòng MVP. **Tải .xosc** lấy XML của đúng run.
6. Từ chi tiết một run cũ, **Chạy trên CARLA** tạo run mới giữ đúng biến thể, xe, AEB và seed; không ghi đè kết quả cũ.

IR ở màn **Sinh từ mô tả** cũng tải `.xosc` để chạy thử, nhưng chưa gắn run trong DB. Muốn nộp kết quả từ máy khác,
phải tải `.xosc` của run CARLA PENDING/FAILED để file mang đầy đủ seed/source hợp lệ.

## Chạy file ngoài web

```powershell
worker\.venv-carla\Scripts\python.exe worker\run_xosc.py vehicsim-run-42.xosc --out data\manual-run --camera
```

`SR_ROOT` trỏ tới ScenarioRunner, `CARLA_ROOT` trỏ tới gói CARLA; mặc định là `~/scenario_runner` và `C:/Carla_package`.
Wrapper kiểm client/server cùng phiên bản, chỉ gắn đường dẫn controller vào bản `scenario.runtime.xosc`; artifact
tải xuống không bị sửa. Module controller phải đi cùng repo; controller mặc định của ScenarioRunner không phải AEB của dự án.

File kết quả nội bộ vẫn là `result.json` để Java kiểm metadata và lưu cùng một luật chấm. Thư mục mỗi run có:
`scenario.xosc`, `scenario.runtime.xosc`, `result.json`, log ScenarioRunner, `sensors/frames.csv`, `collisions.json`,
`sensors/ground_truth.csv` (vector vị trí/vận tốc/gia tốc world của ego và mục tiêu mỗi tick; tải qua `carla-files`) và
`sensors/camera/*.png`, cùng `core/vsos-core.jar` (bản lõi Java chụp lúc bắt đầu run; `lifecycle.json` ghi SHA-256 của nó, nên `mvnw clean`
giữa run không làm hỏng run). Không có livestream/video giả: nếu không ghi camera thì giao diện nói rõ không có ảnh.

`scenario_runner.log` có dòng `ERROR: failed to destroy actor <id> : … not found` ngay sau `Destroying ego vehicle <id>` ở mọi run:
lỗi của ScenarioRunner 0.9.16 (`ScenarioManager.cleanup` đã xoá ego qua `CarlaDataProvider.cleanup`, rồi `ScenarioRunner._cleanup` xoá lần nữa).
Vô hại, không phải dấu hiệu run hỏng.

### Xem số trực tiếp trong cửa sổ CARLA (HUD, dev, 15/11/2026)

**Bật mặc định từ 16/11/2026.** `dev-carla.ps1` bật server có cửa sổ 1280×720 (server đã chạy ẩn thì hiện lại cửa sổ) và thêm `--hud`
vào lệnh chạy của backend; `run_xosc.py` ngoài web cũng vẽ HUD mặc định. Tắt: `dev-carla.ps1 -RestartBackend -NoHud` (server mới chạy ẩn
800×600, như trước 15/11) hoặc `run_xosc.py ... --no-hud`. Backend cũ giữ lệnh cũ cho tới khi chạy lại với `-RestartBackend`.
`follow_hero.py` hiện một ô số ở **góc trên trái bên trong cửa sổ CarlaUE4**: tốc độ, gia tốc dọc thân xe, bàn đạp ga/phanh
(phanh do controller AEB áp, dòng chuyển đỏ), thời gian từ lúc thấy ego, khoảng cách **tâm-tâm** tới người đi bộ/xe gần nhất.

- Số đọc từ snapshot của **từng tick** (`wait_for_tick`, không tick), nên khớp khung xe đang hiện. Mô phỏng có render chạy chậm hơn giờ thật
  (~0,2–0,3×), số cũng đổi theo nhịp đó.
- Ô số là cửa sổ Tk **thuộc về** cửa sổ CARLA (owner, kiểm 16/11): đi theo cửa sổ, bị cửa sổ khác che và ẩn cùng CARLA, không nổi riêng trên
  màn hình. Không thấy cửa sổ CARLA (chạy ẩn, thu nhỏ, Linux) thì ô số không hiện. Tiêu đề thật là `"CarlaUE4  "` (có dấu cách cuối) nên
  phải so tiền tố, `FindWindow("CarlaUE4")` không thấy. Ô số không thuộc world nên không thể vào ảnh `sensors/camera`.
- Chỉ là số vật lý đọc từ CARLA. TTC, quyết định AEB và chỉ số chấm điểm ở lõi Java; muốn xem thì dùng **Phát lại** sau run.
- Trước khi AEB can thiệp, ego được giữ tốc độ bằng `enable_constant_velocity` nên `Ga 0.00` là bình thường.
  Gia tốc HUD (`get_acceleration`) khác cột `imu_accel_x_ms2`: IMU đo lực riêng, gồm cả trọng lực trên đường dốc.
- Bản 15/11 vẽ chữ bằng `world.debug.draw_string` cạnh xe và đã bỏ: CARLA chỉ vẽ ở toạ độ 3D (không ghim được góc màn hình), lệnh vẽ đua với
  tick của ScenarioRunner nên khung có hai bản số chồng lệch nhau. Nếu sau này cần vẽ trong world: `draw_string` không vào ảnh camera RGB,
  còn `draw_point`/`draw_box`/`draw_line` **có** (kiểm 15/11) — sẽ làm bẩn `sensors/camera`.

## Hợp đồng và giới hạn

- Profile hiện tại ghi `carla-0.9.16-xosc9` (định dạng `vehicsim.xosc/v9`, bước **0,01 s = 100 Hz**, mô-men phanh đã hiệu chuẩn — ADR-051,
  lệnh giảm tốc ra bàn đạp kẹp ở μ·g — ADR-052, dưới 6 m/s adapter đặt tốc độ thay cú dừng gấp — ADR-053, bảng bàn đạp e-tron và người đi bộ khởi hành sớm — ADR-054, AEB của ca người đi bộ nhận perception từ radar 90° gắn mũi xe, ground truth chạy bóng — ADR-043/ADR-055; `result.json` ghi
  `case.carla.perception_source` và `perception_radar`), khác runner trực tiếp
  `carla-0.9.16`, bản v8 `-xosc8` (AEB dùng ground truth), bản v7 `-xosc7` (bàn đạp tuyến tính), bản v6 `-xosc6` (còn cú dừng gấp), bản v5 `-xosc5` (chưa kẹp μ·g), bản v4 `-xosc4` (phanh CARLA chưa hiệu chuẩn, ~4,6 m/s² — TD-17), bản v3 `-xosc3` (người "dừng ở lề"
  đi tiếp vào làn — TD-47), bản 20 Hz `-xosc2` và bản quỹ đạo lỗi `-xosc1`; regression không ghép các profile. File v1 cần xuất lại từ web.
  Backend không còn chạy lại run `-xosc1`…`-xosc8` (báo FAILED, tạo lượt mới); `run_xosc.py` vẫn chạy được file v2 (20 Hz) … v8 ngoài
  web để tái lập bằng chứng cũ, kèm identity của nó.
- Hiệu chuẩn phanh (ADR-051): xe có `carla_vehicle_models.max_brake_torque_nm` được ép mô-men đó cho mọi bánh; e-tron 1800 N·m cho phanh
  100% ~9,5 m/s² ở 40–70 km/h. Đo xe khác bằng `worker/measure_brake.py --mass <kg> --brake-torque <N·m> --pedals 0.5 0.85 1.0`.
  Dưới ~6 m/s CARLA vẫn dừng gần như tức thì và ma sát lốp không giới hạn lực phanh (TD-17 còn mở phần này).
- Bước thời gian nằm trong file `.xosc` (`vs_fixed_delta_seconds`, `vs_perception_period_s`); `run_xosc.py` truyền
  `--frameRate 100` cho ScenarioRunner, controller/recorder/`DecelMeter` dùng cùng bước và `result.json` ghi
  `case.carla.measured_step_s` đo từ timestamp khung thật. `simulation_runs.fixed_delta_seconds` = 0,0100 cho xosc3 … xosc9.
- Perception và quyết định AEB vẫn chạy theo chu kỳ cảm biến **0,05 s**; chỉ lệnh phanh, đo và ghi dữ liệu theo 0,01 s. Nhiễu
  và bộ lọc của perception rút theo từng lần cảm biến nên đổi bước không đổi thống kê của AEB; bộ động học giữ nguyên 20 Hz.
- RMS jerk (`Δa/dt`) ở 100 Hz **không so sánh được** với số 20 Hz. `case.carla.jerk_filtered` là số lọc Butterworth 10 Hz **bậc 2 một chiều (causal)** thực
  nghiệm (xem exec plan 2026-10-20), chưa phải objective chính thức và **không khớp** "12-pole phaseless" của Euro NCAP 4.4.1.2
  ([sổ kiểm chứng](nguon-va-kiem-chung-du-lieu.md) R14, R19).
- XML dùng LanePosition trên đoạn thẳng road 40/lane -4 của Town04, lấy cao độ từ map; không chiếu người đi bộ lên
  mặt phẳng sai cao độ. Dải tốc độ/khoảng cách hiện có nằm trong đoạn road đã chọn.
- Không đặt Orientation trên LanePosition của người đi bộ: ScenarioRunner 0.9.16 dùng góc đã xoay để tính offset,
  biến độ lệch ngang thành dịch chuyển dọc. Hướng đi được controller lấy từ hai điểm quỹ đạo ngang.
- Một backend local dùng một server CARLA; không chạy ScenarioRunner tay song song với web trên cùng server.
- Phanh CARLA chưa hiệu chuẩn (TD-17). Chỉ số là quan sát/đối chiếu, không phải chứng nhận an toàn hoặc bằng chứng regression chính thức.
- Sáu category còn lại trong schema vẫn theo TD-42; không tự biến chúng thành CP_CROSSING.

API: `GET /runs/{id}/xosc`, `POST /scenarios/xosc`, `POST /runs/{id}/carla`, `GET /carla/status`, `GET /carla/runs`,
`GET /runs/{id}/carla-data`, `GET /runs/{id}/carla-files/{name}` dưới tiền tố `/api/v1/vehicsim`.

### Radar chạy bóng, chạy lặp và đo phanh (22/10)

- Mỗi run gắn thêm radar 90°/80 m ở mũi xe; `RadarTracker` (Java) bám người đi bộ. File ≤ v8: một `AebStack` bóng quyết định theo radar, `result.json`
  có `case.carla.perception_shadow`, **AEB thật dùng ground truth** (ADR-043 giai đoạn 1). Từ v9 (ADR-055; làm 13/11/2026 ở nhánh, lúc đó gọi là v6) đảo lại: AEB thật của ca người đi bộ quyết định
  theo radar, ground truth chạy bóng, `result.json` có `perception_source = radar` và `perception_radar` (thời điểm phát hiện/FCW/quyết định của hai đường,
  sai số vị trí/vận tốc so với ground truth). Bộ bám nhiều mục tiêu, bù tốc độ radar từ cảnh tĩnh và chỉ báo vật chuyển động so với mặt đất (ADR-043).
- Chẩn đoán bộ bám: `VSOS_RADAR_DUMP=1` khi chạy `run_xosc.py` ghi `radar_dump.jsonl` (điểm radar thô + ground truth mỗi tick, ~2–11 MB/run) để phát
  lại `RadarTracker` ngoài CARLA; mặc định tắt, không đổi kết quả.
- Xuất `.xosc` offline từ IR/bundle để đo nhiều ca không cần backend: `java -cp target/classes com.vsos.core.bridge.BridgeMain export <ir.json> <ra.xosc>`
  (cùng `XoscExport` của web; file này không gắn run trong DB nên không dùng để nộp kết quả).
- `case.carla.physics_check`: so thông số xe yêu cầu với số CARLA đọc lại; trường ép được phải khớp (`forced_ok`), kích thước mesh chỉ báo lệch > 0,05 m
  (`dimensions_ok`). Không chặn run.
- Chạy lặp: `worker\.venv-carla\Scripts\python.exe worker\repeat_xosc.py <file>.xosc --runs 5 --out data\repeat-…` → `repeat_summary.json`.
- Kiểm profile hiện hành trên bộ ca người đi bộ, so với bộ động học: `worker\.venv-carla\Scripts\python.exe worker\verify_cases.py --out data\kiem-xosc9`
  (cần `mvnw compile`; [exec plan 22/11](../exec-plans/active/2026-11-22-kiem-xosc9-carla-that.md)).
- Đo phanh 100% của một xe: `worker\.venv-carla\Scripts\python.exe worker\measure_brake.py --blueprint vehicle.audi.etron --mass 2100 --out data\brake-…`
  (tự tick, chỉ chạy khi server rảnh). Chỉ ghi file đo, không ghi DB. Số đo và quyết định ở
  [exec plan 22/10](../exec-plans/active/2026-10-22-chay-baseline-thanh-vien-2.md).
- Thí nghiệm 4 xe (sedan, SUV, van, truck; PDF §10.1): `worker\.venv-carla\Scripts\python.exe worker\vehicle_study.py --out data\vehicle-study`
  → `vehicle_study.json` và `vehicle_study.md`. Mỗi xe đọc physics thực dùng, phanh hết lực ở ma sát lốp mặc định và giảm, rồi kiểm tăng khối lượng /
  giảm mô-men phanh thì quãng dừng phải tăng. Dựng trên `measure_brake.py`, cùng điều kiện chạy (tự tick, server rảnh), không ghi DB. Đã chạy trên CARLA thật 22/10, kết quả ở exec plan 22/10 mục 6.

### Hủy, timeout và dọn world

- `POST /runs/{id}/cancel`: run PENDING thành STOPPED ngay; run RUNNING chỉ hủy được khi luồng chạy thuộc backend đang chạy
  (sau khi backend khởi động lại, run mồ côi do `recoverUnfinished` xử lý). Run của regression/tối ưu bị từ chối vì bộ so sánh
  cần đủ cặp. Run bị hủy không có điểm hợp lệ và không ghi `result.json`. Nút **Hủy** ở `/analysis/carla`.
- `POST /families/{id}/cancel`: hủy mọi run đang chờ/đang chạy của một họ bằng đúng luật trên cho từng run (run chờ trước, bỏ qua
  run của regression/tối ưu), trả `{stopped, stopping}`. Nút **Hủy N lượt** ở `/scenarios` và panel CARLA.
- `result.json` ghi `outcome.case.carla.physics_applied`: thông số CARLA thực sự áp cho xe (đọc lại sau khi ép: khối lượng, trọng tâm,
  từng bánh, kích thước mesh, chiều dài cơ sở), để đối chiếu với thông số xe trong DB. Đo 21/10 với e-tron: khối lượng khớp 2100 kg,
  nhưng chiều cao mesh 1,649 m (DB 1,67) và chiều dài cơ sở 2,896 m (DB 2,95).
- Backend bị giết giữa run: worker CARLA mồ côi vẫn sống (Windows không giết tiến trình con khi cha chết). Backend ghi `worker.pid`
  (PID + thời điểm khởi động, để không nhầm PID bị tái dùng) vào thư mục run. Lúc khởi động mọi run RUNNING là mồ côi: backend
  dừng worker còn sống bằng `stop.requested` (quá 15 s mới giết cả cây), rồi đưa run về PENDING để **chạy lại từ đầu**; không
  nhận `result.json` mồ côi. `Hủy` trên run mồ côi (khi `VEHICSIM_RECOVER_ON_STARTUP=false`) dừng worker rồi đóng run STOPPED.
  Giả định một backend cho mỗi DB: nhiều backend chung DB sẽ dừng nhầm worker của nhau.
- Backend ghi file cờ `stop.requested` vào thư mục run, hoặc ghi khi hết thời gian; `run_xosc.py` thấy cờ trong 0,5 s thì dừng
  ScenarioRunner, dọn world rồi thoát mã 4. Windows không có tín hiệu mềm cho tiến trình con (`Process.destroy()` là giết cứng),
  nên cờ là đường dừng duy nhất trong 15 giây ân hạn trước khi giết cả cây tiến trình.
- `run_xosc.py` đưa server về không đồng bộ và xoá actor `vehicle.* walker.* sensor.* controller.*` **trước và sau** mỗi run.
  Số actor đã xoá ghi trong `lifecycle.json` (`destroyed_before` khác 0 nghĩa là lần trước bị ngắt giữa chừng).
  Một server chỉ dành cho run của VehicSim; đừng dùng chung với thử nghiệm tay có xe/người đang chạy.
- Chạy tay vào thư mục đã từng bị dừng: xoá `stop.requested` cũ trước, nếu không run dừng ngay.

