# Port lõi AEB, mô phỏng và chấm điểm sang Java (21/10/2026)

**Trạng thái:** đang làm (M0–M5 xong; còn việc 1–5 của kế hoạch 20/10). Quyết định ở [ADR-042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (Accepted 21/10/2026).
Các việc 1–5 của phần "Chạy baseline" trong [kế hoạch 20/10](../../vehicsim/ke-hoach-sua-theo-pdf-va-quyet-dinh-2026-10-20.md)
(perception từ radar, định nghĩa pha phanh, đọc physics, AEB tắt, chạy lặp) làm **sau** khi port, trực tiếp bằng Java.

## Quyết định của chủ dự án (21/10/2026)

- Phạm vi: tất cả logic thuần (AEB stack, bộ mô phỏng động học, luật chấm, bộ lọc, bundle, xuất `.xosc`). Lớp gọi API `carla` ở lại Python.
- Cầu nối: tiến trình Java con qua stdin/stdout JSON từng dòng, một tiến trình cho mỗi run CARLA.
- Thứ tự: port lõi trước (đối chiếu bằng fixture sinh từ Python và một run CARLA thật), rồi làm việc 1–5 bằng Java.

## Quy tắc trong lúc port

- **Python đã commit là bản chuẩn.** Không sửa logic Python trong lúc port. Gặp lỗi Python: tái hiện y nguyên ở Java để giữ parity, ghi vào mục
  "Lỗi Python phát hiện khi port", sửa sau bằng định danh mới.
- Không đổi định nghĩa chỉ số khi port. Sai khác ở một trường đã lưu ⇒ đổi `KINEMATIC_SIMULATOR` và `RunService`, không sửa số cho khớp.
- Không định tuyến web sang Java cho đến khi đạt parity **và** run CARLA thật qua cầu nối.
- Không commit nếu chưa được yêu cầu; thay đổi của người khác trong `git status` (AGENTS.md, CLAUDE.md, tài liệu phân chia, `api.ts`, `.codex/`) giữ nguyên.

## Mốc

| Mốc | Nội dung | Điều kiện đạt |
|---|---|---|
| M0 | ADR-042, kế hoạch này, hoàn tác sửa Python dở, sinh fixture từ Python | Fixture + hash golden 1296 ca ghi lại; `RepoDocsTest` xanh |
| M1 | Lõi Java: RNG tương thích CPython, làm tròn kiểu Python, `AebParams`, `AebStack`, bộ động học, `evaluation`, bộ lọc, `bundle` | Test parity xanh trên toàn bộ fixture; `mvnw -B clean test` xanh |
| M2 | Bộ động học chạy trong tiến trình qua `RunService`; quyết định định danh simulator | Run web kinematic cho cùng kết quả; hủy ngắt được luồng |
| M3 | Cầu nối stdio `vsos-bridge/1`, controller Python mỏng, test vòng đời, run 1584 trên CARLA thật | Thời điểm quyết định/phanh trùng tham chiếu 100 Hz; không sót tiến trình `java` khi hủy/timeout/giết cứng |
| M4 | Port bộ xuất `.xosc` (phải trước việc 1 và 5 vì cả hai thêm tham số xosc) | Hash `.xosc` trùng bản Python trên các bundle mẫu |
| M5 | Xóa AEB/mô phỏng/chấm điểm Python; viết lại luật cứng 2 và 8; test kiến trúc cấm AEB dưới `worker/` | `AGENTS.md` ≤ 150 dòng, `RepoDocsTest` xanh |
| Sau | Việc 1, 2, 4, 5 bằng Java; việc 3 (chạy lặp) cuối cùng trên profile cuối | Theo kế hoạch 20/10 |

## Bẫy parity đã biết (phải có test trước khi viết lõi)

1. **RNG.** Python dùng `random.Random(seed)` và `rng.gauss`. Phải port MT19937 và cách CPython gieo từ số nguyên (giá trị tuyệt đối, tách khối 32 bit,
   `init_by_array`), `random()` 53 bit và `gauss` có nhớ giá trị thứ hai. Kiểm bằng chuỗi sinh từ Python cho seed nhỏ, 48846, lớn hơn 2^32, 2^63−1 và âm.
2. **`round(x, n)`.** Python làm tròn giá trị nhị phân đúng, hòa thì chẵn. `Math.round(x * 10^n) / 10^n` sai ở ca hòa và do sai số nhân. Dùng
   `BigDecimal(x).setScale(n, HALF_EVEN)` và chứng minh bằng ca hòa sinh từ Python.
3. **libm.** `sin/cos/log/tan/hypot` có thể lệch 1 ulp giữa Java và CPython. Làm tròn che hầu hết, nhưng giá trị sát ngưỡng có thể đổi quyết định; fixture phải phủ ca sát ngưỡng.
4. **So sánh số thực.** So theo số, không so chuỗi (Python in `1e-05`, Java in `1.0E-5`).

## Cầu nối (thiết kế để chốt ở M3)

- Gói đóng: lõi không phụ thuộc Spring/DB; có test kiến trúc. **Đã chọn (21/10):** mỗi run `run_xosc.py` chụp gói `com/vehicsim/core` từ `target/classes`
  thành `<run>/core/vsos-core.jar` (`bridge.snapshot_core`) và mọi JVM của run dùng jar đó; `lifecycle.json` ghi `core.sha256`. Không cần bước Maven riêng,
  `mvnw clean`/IDE ghi class lỗi giữa run không ảnh hưởng run đang chạy, và jar nằm trong thư mục run nên Windows khóa file không chặn build.
- Java và classpath truyền qua biến môi trường (như `VEHICSIM_WORKER_PYTHON`); `run_xosc.py` độc lập vẫn chạy được.
- Bắt tay phiên bản giao thức + phiên bản lõi để lớp cũ báo lỗi rõ. Một yêu cầu một đáp án, hạn chót mỗi tick, flush từng dòng; EOF ⇒ Java thoát.
- Đứt ống/timeout ⇒ run lỗi, không về giá trị mặc định. stderr của Java ghi vào log trong thư mục run.
- Java là cháu của `run_xosc`: kiểm hủy, timeout và giết cứng không để lại `java` mồ côi hay server kẹt đồng bộ.
- `result.json`: Java sở hữu trạng thái AEB, frames, sự kiện, chỉ số và ghi đúng hợp đồng cũ; Python gửi quan sát thô. Ghi phiên bản lõi vào `result.json`
  để phân biệt run Java và Python kể cả khi định danh simulator không đổi.

## Nhật ký bằng chứng

### M0 (21/10/2026)

- Hoàn tác sửa Python dở: `git checkout worker/vehicsim_core/aeb_stack.py`; thiết kế bộ theo dõi radar giữ ngoài repo làm ghi chú.
- Hash golden bộ động học (1296 ca = 3 tốc độ × 3 khoảng kích hoạt × 2 tốc độ đi bộ × {dừng ở lề, không} × 3 thời tiết × 2 thời điểm × 3 seed × 2 bộ tham số):
  `fdf360dbd2720e6b2a6259117eacd82001901c7304dc9c29ed52173bb7c1027c`, giống hệt trước và sau khi hoàn tác.

### M1 (21/10/2026): lõi Java `com.vehicsim.core`

Đã port 1:1: `Py` (round/format/hypot/repr kiểu CPython), `PyRandom` (MT19937 + `gauss`), `AebParams`, `VehicleSpec`, `CrossingCase`, `AebStack`,
`Simulator`, `Evaluation`, `Filters`, `Bundle`. Không sửa dòng Python nào.

| Kiểm | Kết quả |
|---|---|
| Chuỗi `random()` theo 16 seed (gồm 2^63−1 và âm) | khớp từng bit |
| `gauss` (cos/sin/log) | 36/≈700 giá trị lệch bit cuối (≤ 4 ulp); **không** ảnh hưởng số lưu |
| `round(x, n)` 2.000+ ca (hòa nhị phân, −0.0), `f"{x:.nf}"`, `{x:g}`, `hypot` 3.200 cặp, `tan` | khớp tuyệt đối |
| 238 ca fixture (đủ COLLISION/EGO_STOPPED/TARGET_CLEARED/TIMEOUT): mọi khung, sự kiện, chỉ số, kết quả chấm | **0 sai khác** |
| Cả lưới 1296 ca (đối chiếu rộng, ngoài repo, `-Dvsos.parity.full=...`) | **0 sai khác** |
| 50 tài liệu bundle (19 hợp lệ, 31 lỗi): `read_spec`, `make_bundle`, `result_document`, đúng từng câu thông báo | khớp |
| Bộ lọc Butterworth và RMS jerk đã lọc | khớp từng bit |
| Kiểm test không rỗng: đổi seed Java +1 | test báo hàng chục sai khác |
| `mvnw -B clean test` | 146 test, 0 lỗi (1 bỏ qua: đối chiếu rộng) |

Hệ quả cho định danh: parity chính xác ⇒ **giữ nguyên** `KINEMATIC_SIMULATOR = vehicsim-kinematic-1.0`; không cần đổi `RunService`.
Cửa ngõ: lõi chỉ chạy được khi `mvnw` có JDK 21; test cô lập `CoreIsolationTest` cấm lõi import Spring/DB/carla/phần còn lại của backend.

### M2 (21/10/2026): bộ động học chạy trong tiến trình

`RunService.runKinematic` gọi `Bundle.readSpec` → `Simulator.simulate` → `Evaluation.evaluate` → `Bundle.resultDocument` (kèm khóa `engine = vsos-core-java/1`), rồi qua `checkResult`
như cũ. Giữ định danh `vehicsim-kinematic-1.0` (parity chính xác). `KinematicInProcessTest` (4 test). Hủy kiểm trước khi chạy (một lần chạy vài ms).

### M4 (21/10/2026): bộ xuất và bộ đọc `.xosc`

`Xosc` (đọc `vs_*`, profile) và `XoscExport` (xuất): XML **trùng từng byte** với `export_xosc` của Python trên 18 spec; đọc/profile khớp 30 file gồm cả file lỗi và thông báo.
`RunService.exportXosc` và nhánh ghi `scenario.xosc` dùng bộ xuất Java; `openscenario_export.py` không còn được gọi từ backend.

### M3 (21/10/2026): cầu nối CARLA `vsos-bridge/1`

Java: `MiniJson` (JSON chỉ dùng JDK, ghi kiểu Python), `CrossingFrame`, `DecelMeter` (+ bàn đạp), `CarlaSession` (toàn bộ logic controller cũ: khung tọa độ, đo giảm tốc, AEB, điều kiện
kết thúc, ghi `result.json`), `bridge.BridgeMain` (chế độ `session`, `info`, `kinematic`), `bridge.KinematicCli` (chạy lại bundle bằng Java, thay `kinematic_sim.py`).
Python còn lại là adapter: `worker/bridge.py` (client JVM con), `vehicsim_aeb_control.py` (chỉ đọc trạng thái CARLA, gửi, áp bàn đạp), `carla_physics.py`, `run_xosc.py` (dùng `bridge.xosc_info`).
Chạy Java: `VEHICSIM_JAVA` (mặc định `java`), classpath `VEHICSIM_CORE_CLASSPATH` (mặc định `target/classes`, cần `mvnw compile`; `dev-carla.ps1` tự biên dịch nếu thiếu).

**Bằng chứng trên CARLA 0.9.16 thật** (Town04, file `data/hz100-20261020/scenario.xosc`: 40 km/h, kích hoạt 25 m, người đi bộ 3 m/s, seed 48846, AEB mặc định; dữ liệu ở `data/bridge-m3/`, ngoài git):

| Chỉ số | Qua cầu nối Java (n = 10) | 10 lần Python tham chiếu 100 Hz |
|---|---|---|
| Quyết định AEB / bắt đầu phanh / FCW | 2,25 / 2,50 / 1,95 s ở 9 lần; **một lần 2,30 / 2,55** (xem dưới) | 2,25 / 2,50 / 1,95 s ở 10/10 |
| Quãng dừng (m) | 10,203–10,345 (lần 2,30 s: 10,323) | 10,203–10,378 |
| RMS jerk `Δa/dt` (m/s³) | 38,209–38,389 (lần 2,30 s: 38,450) | 38,206–38,400 |
| Khoảng cách tối thiểu (m) | 3,455–3,578 (lần 2,30 s: 3,008) | 3,426–3,578 |
| Bước đo | đúng 0,01 s trên mọi khung (381–382 khung) | như vậy |
| Jerk đã lọc 10 Hz (thực nghiệm) | 19,918 (run đầu) = bản tham chiếu `final100` | 19,918 |

- Quan sát chưa giải thích được: **một** lần chạy (ngay sau lần giết cứng đầu tiên) quyết định muộn 0,05 s (một chu kỳ perception). Lần giết cứng thứ hai và lần hủy mềm đều cho 2,25 s, các lần chạy sau đó cũng vậy. Chưa có cách tách "hiệu ứng CARLA" khỏi "hiệu ứng cầu nối" cho một mẫu; đưa vào việc 3 (chạy lặp) với n lớn hơn.
- Vòng đời: hủy bằng `stop.requested` → `lifecycle.json {stopped:true}`, không `result.json`, không `java` sót. Giết cứng `run_xosc` + ScenarioRunner + `follow_hero` (không kill `java`) → `java` tự thoát vì stdin đóng, không `result.json`;
  lần chạy kế dọn 8 actor và cho kết quả hợp lệ.
- Sửa trong lúc làm: lúc đầu Java ghi `result.json` dở dang khi stdin đóng; bỏ vì run bị ngắt không được có điểm hợp lệ (`BridgeProtocolTest.theProcessExitsWhenStdinClosesAndWritesNoResult`).

### M5 (21/10/2026): xóa lõi Python

Đã xóa bằng `git rm` (khôi phục được từ commit `6af5ed2ad5275eba9c029499711e637ad801448e`, commit cuối còn lõi Python):
`worker/vehicsim_core/` (6 file), `kinematic_sim.py`, `sim_common.py`, `openscenario_export.py`, `run_variant.py` và 6 file test Python
(`test_run_variant`, `test_simulator`, `test_filters`, `test_openscenario_export`, `test_sim_contract`, `test_step_100hz`). Hành vi của chúng đã có test Java
tương ứng (`SimulatorBehaviorTest`, `FiltersBehaviorTest`, `CarlaSessionLogicTest`, `XoscExportTest`, `KinematicCliTest`, `AebParameterSeedTest`).

- `run_xosc.py` tự giữ hàm dừng/mã thoát (2 = đầu vào sai, 3 = lỗi simulator, 4 = bị dừng); `.json` bị từ chối mã 2 kèm lệnh `BridgeMain kinematic`.
  Backend chỉ đưa `.json` cho runner khi `simulator_version` không có hậu tố `-xosc3` (profile `carla` trực tiếp đời cũ); nay các run đó báo lỗi rõ.
- Test mới: `worker/tests/test_run_xosc.py` (bản sao runtime, controller thiếu, mã thoát, tín hiệu dừng) trên fixture `.xosc` do bộ xuất Java sinh.
- Luật cứng 8 thành test: `ArchitectureRulesTest#pythonWorkerHoldsNoAebLogic`, `#thePythonCoreStaysDeleted` và bản Python `test_no_aeb_logic_lives_in_the_python_worker`.
  Kiểm không rỗng: chạy khi lõi Python còn thì đúng hai test Java này đỏ. `thePythonCoreStaysDeleted` chỉ tính file `.py`, vì thư mục `worker/vehicsim_core/`
  còn lại với `__pycache__` (gitignore) trên máy từng chạy lõi cũ; lỗi này lộ ra khi chạy trên repo thật, không lộ trên bản sao sạch.
- Tài liệu: `AGENTS.md` (137 dòng) luật 2 và 8, `CLAUDE.md`, `architecture.md` (bảng máy kiểm trỏ test Java), `carla-local.md`, `aeb-parameter-ranges.md`,
  `database-schema.md`, `README.md`, link trong kế hoạch 20/10, `src/test/resources/parity/README.md`.
- Mất theo `run_variant.py`: bảng đối chiếu xe `vehicle_check` (ADR-033), `weather_parameters`, dựng cảnh trực tiếp. Web và Java không đọc chúng.
  Cần lại thì lấy từ git history; chưa có việc nào trong kế hoạch dùng đến.

| Kiểm (repo thật, sau khi xóa) | Kết quả |
|---|---|
| `mvnw -B clean test` | 219 test, 0 lỗi, 1 bỏ qua (đối chiếu rộng) |
| `pytest worker/tests` | 28 qua (trước 112: phần còn lại đã chuyển thành test Java) |
| `ruff check worker` | Sạch |
| `run_xosc.py x.json`, `--status` không có CARLA, không tham số | mã 2 kèm thông báo; JSON `connected:false`; mã 2 |
| `BridgeMain kinematic` trên bundle fixture | `result.json` hợp lệ, `engine = vsos-core-java/1` |

Chưa kiểm lại trên CARLA 0.9.16 thật sau M5 (máy làm M5 không có CARLA); bằng chứng CARLA vẫn là của M3.

### Rà code CARLA sau M3–M5 (21/10/2026)

Rà toàn bộ đường CARLA rồi sửa từng mục; mỗi mục kiểm trên CARLA 0.9.16 thật (Town04, file `hz100-20261020/scenario.xosc`; dữ liệu
`data/claude-check-20261021*`, ngoài git). Run kiểm đầu tiên trùng bằng chứng M3: FCW/quyết định/phanh 1,95/2,25/2,50 s, quãng dừng 10,203 m,
RMS jerk 38,387, 381 khung bước 0,01 s, jerk lọc 19,918.

- **Chụp lõi theo run** (mục "Cầu nối"). Dời `target/classes/com/vehicsim/core` đi khi `BridgeMain` đang chạy → run thoát 0, kết quả trùng run thường.
  Test: `test_snapshot_core_packs_only_the_core_package`, `test_snapshot_core_refuses_missing_or_ambiguous_sources`, `test_a_run_keeps_working_after_target_classes_disappears`.
- **Giảm tốc phanh 100% theo xe (xoá TD-32).** `carla_vehicle_models.carla_full_brake_decel_mps2` → `RunService.carlaVehicle` → bundle
  `vehicle.carla.full_brake_decel_mps2` (`Bundle` kiểm (0, 15]) → `.xosc` `vs_full_brake_decel_mps2` → `Xosc.read` → `CarlaSession.open`; thuộc tính controller
  `full_brake_decel` vẫn ghi đè được. Xe chưa đo (NULL, gồm xe seed): XML trùng từng byte bản cũ (golden + parity xanh), vẫn 4,6. Trang "Dữ liệu CARLA" ngoại suy
  quãng phanh bằng cùng số đo. Kiểm thật: `.xosc` gắn 9,2 → `result.json` ghi 9,2, bàn đạp nhẹ hơn: dừng 3,89 s (3,80), quãng dừng 11,21 m (10,203),
  khoảng cách nhỏ nhất 2,741 m (3,578). Test: `XoscExportTest.measuredFullBrakeDecelTravelsFromBundleToTheCarlaController`, `implausibleFullBrakeDecelIsRejected`.
- **Góc lái đúng tick.** `vehicsim_aeb_control.py` lấy lệnh LocalPlanner vừa tính trong tick thay vì `actor.get_control()` (CARLA trả lệnh tick trước).
  `test_brake_override_keeps_this_ticks_steering` (trượt với bản cũ: lái 0,0 thay vì 0,1). Kiểm thật: thời điểm/chỉ số giữ nguyên, RMS jerk 38,387 → 38,390,
  trong nhiễu chạy lặp 100 Hz (sd 0,061, khoảng 0,194; [đo dung sai](2026-10-20-do-dung-sai-va-vong-doi-run-carla.md)) nên **giữ** định danh `-xosc3`.
- **Log ScenarioRunner đúng thứ tự.** `run_xosc.environment` đặt `PYTHONUNBUFFERED=1`. Dòng `failed to destroy actor <ego> : not found` là ScenarioRunner xoá ego
  hai lần (`ScenarioManager.cleanup` rồi `ScenarioRunner._cleanup`), vô hại; ghi ở `carla-local.md`. Đã loại bằng thử thật hai giả thuyết: Traffic Manager
  dựng trước ở `release_world`, và cảm biến va chạm bị xoá theo xe.
- **Chế độ `carla` đã gỡ được chặn sớm.** Sau M5 `run_xosc.py` từ chối bundle JSON nhưng backend vẫn tạo run `carla-<x.y.z>` ở `VEHICSIM_SIMULATOR=carla`.
  Nay `simulatorForNewRuns` từ chối và run cũ chưa chạy của profile đó báo lỗi trước khi gọi worker
  (`CarlaWebTest.removedDirectRunnerModeCannotCreateNewRuns`, `queuedDirectRunnerRunFailsBeforeLaunchingWorker`).
- **Image backend không còn Python.** `Dockerfile` bỏ `python3`, `COPY worker`, `VEHICSIM_WORKER_PYTHON` (comment đã ghi worker không vào image);
  `.dockerignore` thêm `worker/`. `docker build` đầy đủ qua; image chỉ có JRE 21 + `app.jar` + `curl`, chạy bằng `appuser`.
- CLAUDE.md §6 còn ghi artifact `v2`/`-xosc2`: sửa thành `v3`/`-xosc3`. TD-34 viết lại theo cơ chế `stop.requested` (còn đúng cho nhánh tắt backend).
- Kiểm trên CARLA thật sau M5, đúng cờ backend (`--camera --fast`): thoát 0 (66 s), 16 ảnh, `bridge.log` trống, không sót actor; FCW/quyết định/phanh
  1,95/2,25/2,50 s, quãng dừng 10,318 m, khoảng cách nhỏ nhất 3,481 m, RMS jerk 38,365 — trong dải chạy lặp 100 Hz.

### Màn chạy baseline: lỗ hổng so với phân chia §4 và kế hoạch 20/10 (21/10/2026)

- **Chuyển sang màn 3 không nhập lại.** `/scenarios` và panel CARLA có "Tiếp tục: Phân tích kết quả →" tới `/analysis/failures?scenario_id=<id>`;
  màn lỗi đọc `scenario_id` từ URL trước lần tải đầu (trước đó chỉ có link "Failures" không mang họ).
- **Hiện bộ mô phỏng sẽ dùng.** `GET /context` thêm `simulator` (= `RunService.configuredSimulator()`); `/scenarios` có dải "Chạy cơ sở sẽ dùng:
  xe · AEB · bộ mô phỏng", panel CARLA ghi "Lượt mới chạy bằng …".
- **Hủy cả họ + đếm run đã hủy.** `POST /families/{id}/cancel` → `RunService.cancelFamilyRuns` gọi `cancelRun` cho từng run (run chờ trước, bỏ qua
  regression/tối ưu; họ ngoài project → 404). `/scenarios` có nút "Hủy N lượt" khi có run chờ/chạy và đếm STOPPED.
  Test: `CarlaWebTest.cancellingAFamilyStopsEachActiveBaselineRunThroughTheSingleRunRules`, `cancellingAFamilyOfAnotherProjectIsNotFoundAndTouchesNothing`.
- **Đọc lại physics (kế hoạch 20/10, việc 4 — phần ghi nhận).** Controller gửi `physics_snapshot` của xe CARLA trong `init`; `CarlaSession` ghi
  `case.carla.physics_applied` (`BridgeProtocolTest.aSyntheticCrossingRunsThroughTheProtocolAndWritesResultJson`). CARLA thật: e-tron khối lượng 2100 kg
  khớp yêu cầu; chiều cao mesh 1,649 m (DB 1,67), chiều dài cơ sở 2,896 m (DB 2,95). Chưa tự so sánh/cảnh báo lệch — để thành viên 3 hiển thị.
- UI kiểm bằng Edge headless (tài khoản thử, đã xoá): dải thông tin "Xe Audi e-tron · AEB v1.0 · Bộ động học (vehicsim-kinematic-1.0)", "43 đã hủy",
  nút "Tiếp tục" → `?scenario_id=14`, mọi request danh sách lỗi đều mang `scenario_id=14`; không lỗi console/API.

## Trạng thái bàn giao (cuối ngày 21/10/2026)

Đã xong và có test: M0–M5. `mvnw -B clean test`: 219 test (1 bỏ qua: đối chiếu rộng `-Dvsos.parity.full`); `pytest worker/tests`: 28; `ruff` sạch. Lõi Python đã xóa (mục M5 ở trên); chưa kiểm lại trên CARLA thật sau M5.

**Việc còn lại, theo thứ tự**

1. **Việc 1 (perception từ radar)**, **việc 2 (định nghĩa nguồn gia tốc và pha phanh; nhóm tự định nghĩa, viết ADR Proposed trước)**, 4. **việc 4 (đọc lại physics)**, 5. **việc 5 (AEB tắt, chế độ rõ ràng trong xosc/result,
   không bao giờ thành baseline regression)**, rồi **việc 3 (chạy lặp)** trên profile cuối. Tất cả bằng Java; những việc đổi hành vi CARLA đi cùng bump `-xosc3` → `-xosc4` (chạm `RunService.XOSC_SUFFIX`, `stepFor`, nhánh từ chối run cũ,
   `Xosc.SIMULATOR_SUFFIX`, `CarlaRunnerPanel.tsx:60`, `CarlaWebTest`). Thiết kế radar đã được rà (Doppler không phân biệt người băng ngang với vật tĩnh; khởi tạo track bằng phần dư Doppler, bám bằng cổng vị trí; radar riêng toàn FOV,
   không dùng radar ±4° của recorder; ghi `perception_source` và sai số perceived−ground truth; một run âm tính phải cho thấy AEB không quyết định khi mục tiêu ngoài FOV). Bản phác thiết kế cũ ở ngoài repo, viết lại bằng Java.
2. Chưa nối web → DB cho việc 5 (cần cột mới ⇒ quy trình schema đầy đủ: `01_schema.sql`, `Queries`, `database-schema.md`, migration; hỏi chủ dự án trước).

**Cách chạy lại bằng chứng** (cần JDK 21, CARLA 0.9.16 ở `C:\Carla_package`, `scripts\setup-carla.ps1` đã chạy): `mvnw compile`; bật server (`CarlaUE4.exe /Game/Carla/Maps/Town04 -windowed -ResX=800 -ResY=600 -quality-level=Low`);
`worker\.venv-carla\Scripts\python.exe worker\run_xosc.py <file.xosc> --out <thư mục>`.

## Lỗi Python phát hiện khi port

(chưa có)
