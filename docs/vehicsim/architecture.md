# Kiến trúc — VehicSim MVP

Tài liệu kiến trúc của **VehicSim**: vòng khép kín AEB trên *một* motif (người đi
bộ băng ngang, kiểu Euro NCAP CPNA). Scenario Forge — dự án gốc mà repo dựng lên từ đó —
đã gỡ ngày 04/10/2026; chỉ giữ bộ sinh OpenSCENARIO ở `src/services/openscenario/`
([ADR-032](../adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)).

> Nguồn sự thật: schema DB là [`database/mysql/01_schema.sql`](../../database/mysql/01_schema.sql)
> (code Java đọc/ghi bằng SQL thuần, không có bản mirror); lý do quyết định là ADR-023 →
> ADR-040 trong [`docs/adr/`](../adr/README.md). Tài liệu này vênh với hai nguồn đó
> thì tài liệu này sai.

> **Sau [ADR-039](../adr/ADR-039-backend-java-mo-phong-o-worker-python.md) (14/10/2026) backend là Spring Boot (Java 21)**:
> REST, nghiệp vụ và lưu trữ ở `src/main/java/com/vehicsim/vehicsim/`. Sau [ADR-042](../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (21/10/2026)
> AEB, bộ động học, luật chấm, bộ lọc, hợp đồng bundle và bộ xuất `.xosc` cũng ở Java (`src/main/java/com/vehicsim/core/`); `worker/` chỉ còn adapter CARLA.
> Phần dưới còn dùng tên module Python cũ (`describe.py`, `runs.py`…); đối chiếu sang code hiện tại:
>
> | Tên cũ | Hiện nay |
> |---|---|
> | `vehicsim_routes.py` | `VehicSimController` (+ `ApiExceptionHandler`) |
> | `describe.py`, `llm.py` | `DescribeService`, `LlmService` |
> | `family.py` | `FamilyService`, `ScenarioRules` (luật theo category) |
> | `aeb.py`, `bootstrap.py` | `AebService`, `BootstrapService` |
> | `runs.py` + Celery | `RunService` + thread pool `simulationExecutor` (`VehicSimConfig`) |
> | `regression.py` | `RegressionService` |
> | `views.py`, `common.py`, `tables.py` | `ViewsService`, `Vs` + `Queries`, SQL thuần qua `Db` (JdbcTemplate) |
> | `aeb_stack.py`, `simulator.py`, `bundle.py`, `evaluation.py`, `openscenario_export.py` | `core/AebStack`, `Simulator`, `Bundle`, `Evaluation` (+ `Filters`), `XoscExport` — port 1:1, khớp fixture ở `src/test/resources/parity` |

## Vòng MVP 6 bước

| Bước | Người dùng làm | URL (code: `frontend/src/app/<URL>/page.tsx`) | API (`/api/v1/vehicsim`) | Code chính |
|---|---|---|---|---|
| 1. Mô tả kịch bản | Câu tiếng Việt → xem/sửa Scenario IR | `/scenarios/new` | `POST /scenarios/describe` | `describe.py` |
| 2. Sinh biến thể | Lưới tham số → họ kịch bản | `/scenarios/new`, `/scenarios` | `POST /families` | `family.py` |
| 3. Chạy baseline | Xem xe/AEB/bộ mô phỏng sẽ dùng → chạy mọi biến thể với AEB baseline → theo dõi, hủy → "Tiếp tục: Phân tích kết quả" (mang `scenario_id`) | `/scenarios`, `/analysis/carla` | `GET /context` (`simulator`), `POST /families/{id}/run`, `POST /families/{id}/cancel`, `POST /runs/{id}/cancel` | `runs.py` + Celery |
| 4. Phân tích lỗi | Danh sách lỗi → chi tiết/nguyên nhân → playback → tải JSON chạy lại trên CARLA | `/analysis/failures/**` | `GET /failures`, `/runs/{id}`, `/runs/{id}/playback`, `/runs/{id}/bundle` | `evaluation.py`, `views.py`, `worker/run_variant.py` |
| 5. Cấu hình mới & chạy lại | Tạo candidate AEB → regression cùng seed | `/aeb`, `/validation/regression/new` | `POST /aeb/versions`, `GET /regression/preview`, `POST /regression` | `aeb.py`, `regression.py` |
| 6. So sánh & quyết định | Kết quả regression → khuyến nghị → **Reviewer** Accept/Reject/Request more tests | `/validation/**` | `GET /regression/{id}`, `/recommendations/{id}`, `POST /recommendations/{id}/decision` | `regression.py`, `views.py` |

Hai API phụ cho CARLA chạy ngoài backend, dùng ở trang `/analysis/carla` ("Dữ liệu CARLA",
`frontend/src/app/analysis/carla/page.tsx`; trang tự điền mã run từ `source.run_id` của `result.json`):

- `POST /runs/{id}/carla-result` — nộp `result.json` của một run **CARLA** đang `PENDING`/`FAILED`
  (`RunService.submitCarlaResult`). Từ chối run động học (luật cứng 9), run đã `COMPLETED`/`RUNNING` (409), run của
  regression test đã chốt (409) và `result.json` không qua `checkResult`; bỏ đường dẫn artifact client gửi.
  Cả kết quả upload và kết quả worker phải có seed cùng `source.run_id/scenario_id/scenario_version_id/aeb_version_id/carla_vehicle_model_id`
  khớp run; thiếu hoặc sai trả 400 khi upload. Lưu trong transaction rồi mới phát `RunFinished`, để regression đọc
  kết quả đã commit bằng transaction mới. Test: `CarlaResultSubmissionTest`.
- `POST /telemetry/evaluate` — `frames.csv` + `collisions.json` của `worker/sensor_recorder.py` → số đo sensor và 3 mục
  tiêu MOBO theo định nghĩa ADR-040, bỏ 0,5 s đầu và khung từ lúc va chạm (`TelemetryMetricsService`, chỉ tính, không
  ghi DB). Bỏ frame thiếu/sai thời gian hoặc tốc độ ego (kể cả NaN/Infinity/số âm), giữ tốc độ 0 đo được;
  thiếu cột bắt buộc hoặc không còn frame hợp lệ trả 400, không sinh số 0 giả.
  JSON trả khoá snake_case (`rms_jerk_mps3`, `impact_speed_mps`, `stopping_distance_m`…). Test:
  `TelemetryMetricsServiceTest`.

Từ ADR-041, trang này có luồng chạy trực tiếp bằng OpenSCENARIO: `GET /runs/{id}/xosc`, `POST /scenarios/xosc`
để xuất XML; `POST /runs/{id}/carla` tạo run mới giữ seed/biến thể/xe/AEB, `GET /carla/status` và `/carla/runs`
theo dõi kết nối/hàng đợi, `/runs/{id}/carla-data` + `/carla-files/{name}` đọc sensor/ảnh đã ghi, có kiểm project và
whitelist tên file. Các route ghi vẫn qua role và hạn mức. [Cách chạy Windows](carla-local.md).

Trang `/` (Tổng quan) tính trạng thái 6 bước từ dữ liệu thật và chỉ bước tiếp theo;
mỗi màn có thanh tiến trình (`components/FlowBar.tsx`, danh sách bước ở
`components/vehicsimFlow.ts`).

## Sơ đồ

```
Next.js (/, /scenarios, /aeb, /analysis/*, /validation/*)  ──JWT──▶  Spring Boot /api/v1/vehicsim/*  (VehicSimController: chỉ đổi lỗi → HTTP)
                              │
                              ▼
                  *Service (Java)  ──JdbcTemplate──▶  MySQL (29 bảng)
                              │ dispatch(run_ids) sau commit
                              ▼
              thread pool `simulationExecutor` (CARLA: 1 luồng) → executeRun(run_id) → bundleForRun() (= JSON "Tải JSON chạy CARLA")
                                           ▼  CARLA: tiến trình con có timeout, scenario.xosc → result.json (kèm kết quả chấm); động học: gọi thẳng lõi Java
        simulator_version = vehicsim-kinematic-1.0      simulator_version = carla-<x.y.z>
            trong tiến trình Java (core.Simulator)          VEHICSIM_CARLA_COMMAND <scenario.xosc> --out runs/<id> --fast
                                     │                       (worker/run_xosc.py, cần server CARLA)
                                     └──────────┬───────────────────────┘
                                                ▼  cả hai dùng chung com.vehicsim.core.AebStack + Evaluation (CARLA qua cầu nối stdio)
                        Java ghi result.json → simulation_runs + collision_events/failures/root_causes(/artifacts)
                        → sự kiện RunFinished → RegressionService.tryFinalize()
```

`VEHICSIM_RUN_MODE=inline` chạy `executeRun` ngay trong request (dùng cho test); mặc định `async` (thread pool).
CARLA luôn 1 luồng (một server CARLA chỉ chạy một lượt một lúc); khóa trong backend cũng bảo vệ nút chạy lại CARLA
khi cấu hình mặc định là động học. Profile `carla-xosc` sinh `scenario.xosc` trước khi gọi `run_xosc.py`; chỉ giữ
bundle JSON làm metadata nội bộ. Identity `carla-0.9.16-xosc3` (bước 0,01 s) tách bản 20 Hz `-xosc2`, bản sửa quỹ đạo ngang khỏi `-xosc1` và runner trực tiếp cũ.
Run `-xosc1`/`-xosc2` chưa chạy bị từ chối thay vì âm thầm chạy bằng profile mới. Mỗi người có hạn mức ghi và số run đang chờ + chạy
(`VEHICSIM_WRITES_PER_WINDOW`, `VEHICSIM_MAX_ACTIVE_RUNS_PER_USER`) vì app mở đăng ký công khai.

## Bản đồ module (`src/services/vehicsim/`)

| File | Trách nhiệm |
|---|---|
| `tables.py` | (cũ) bảng SQLAlchemy Core mirror `01_schema.sql`; nay Java dùng SQL thuần qua `Db` / `Queries` |
| `bootstrap.py` | Workspace/project mặc định (chọn sẵn xe `vehicle.audi.etron`), 4 tham số AEB chỉnh được (`AEB_PARAMETER_SEED`, ADR-040), baseline v1.0 (TTC 1,5 s) |
| `describe.py` | Câu mô tả → LLM → IR đã kiểm; sửa ≤ 3 lần; lùi về luật khi LLM lỗi |
| `family.py` | `FamilySpec` (lưới, giới hạn, ≤ 300 biến thể), tạo họ + bản gốc + biến thể trong một transaction |
| `aeb_stack.py` | **Hệ AEB cần kiểm thử**, dùng chung cho mọi bộ mô phỏng: `AebParams` (4 tham số chỉnh được; 6 tham số cũ là hằng số của lõi — ADR-040), `AebStack.step` mỗi tick = perception (độ tin cậy theo thời tiết/giờ/khoảng cách + nhiễu theo seed) → decision (TTC + hành lang) → control (trễ, actuator, tăng lực phanh). Chỉ thư viện chuẩn |
| `simulator.py` | "Thế giới" động học tất định: xe, người đi bộ, va chạm, μ·g; `make_frame` / `MotionStats` / `build_outcome` dùng chung với CARLA. `DT = 0.05 s`, tối đa 12 s |
| `bundle.py` | Hợp đồng JSON: `vehicsim.variant/v1` (biến thể + AEB + xe + seed) và `vehicsim.result/v1`; `read_spec` nhận cả Scenario IR trần |
| `evaluation.py` | Kết quả `COLLISION` / `NEAR_MISS` / `SAFE`, verdict, false/missed activation, chuỗi nguyên nhân PERCEPTION → DECISION → CONTROL → VEHICLE_DYNAMICS theo ngân sách thời gian (`parameter_code` chỉ là 1 trong 4 tham số chỉnh được, hoặc `null` khi nguyên nhân là hằng số cố định) |
| `runs.py` | Tạo run (seed = `48000 + id biến thể`, bộ mô phỏng theo cấu hình hoặc chép từ run baseline), dispatch inline/Celery, `execute_run` idempotent, `spec_for_run`/`bundle_for_run`, gọi CLI CARLA bằng tiến trình con |
| `regression.py` | Tạo test (chốt xe + bộ mô phỏng), ghép cặp, chốt verdict + `regression_test_items` + khuyến nghị, `summary` tính lại từ run, `decide`, `preview` |
| `aeb.py` | Tạo candidate: tham số trong khoảng, phải khác version cha |
| `views.py` | Payload đọc cho từng màn (failures, run detail, playback, regression, recommendation) |
| `common.py` | `NotFoundError`, `InvalidRequestError`, nhãn hiển thị, `baseline_version`, `active_vehicle` |

Hàng đợi chạy nền là thread pool của Spring (thay Celery, ADR-039); trần thời gian một run theo `SIMULATION_TIMEOUT_S`.

Các lớp `AebStack`, `Simulator`, `Bundle`, `Evaluation` trong `com.vehicsim.core` là **lõi mô phỏng**: chỉ dùng JDK, không
phụ thuộc Spring/DB (`CoreIsolationTest`). Worker Python không import lõi mà gọi qua cầu nối `vsos-bridge/1`.

## Bộ mô phỏng: động học và CARLA

Hai bộ mô phỏng thay thế nhau sau một hợp đồng (ADR-027). Cả hai nhận **cùng file
JSON**, dùng **cùng `AebStack`**, ghi **cùng `result.json`**, được chấm bằng **cùng
`Evaluation`** (Java):

| | Động học (`core.Simulator`, trong tiến trình Java) | CARLA (`worker/run_xosc.py` + cầu nối) |
|---|---|---|
| Chạy ở đâu | Máy nào cũng được, < 1 s/run | Máy có server CARLA (venv worker, `carla` khớp phiên bản server) |
| Vật lý | Điểm khối, giảm tốc tức thì theo lệnh, μ·g | Xe/lốp/va chạm của CARLA; người đi bộ tăng tốc dần |
| Perception | Mô hình tổng hợp trên ground truth | Như bên trái (chưa đọc camera/LiDAR) |
| Cảnh | Không có hình | Town04 road 40/lane -4 từ `.xosc`, camera bám xe (`--camera`) |
| Dùng khi | Dev, test tự động, batch nhanh, dự phòng khi demo | Xem tận mắt, quay video, đối chiếu |

Chạy tay một JSON tải từ web (nút **"Tải JSON chạy CARLA"** ở màn Chi tiết lỗi /
Phát lại, hoặc Scenario IR ở màn Sinh từ mô tả):

```bash
java -cp target/classes com.vehicsim.core.bridge.BridgeMain kinematic vehicsim-run-42.json   # khớp kết quả trên web (cần mvnw compile)
worker/.venv-carla/Scripts/python worker/run_xosc.py vehicsim-run-42.xosc --camera            # CARLA, file .xosc tải từ run CARLA
java -cp target/classes com.vehicsim.core.bridge.BridgeMain kinematic scenario-ir.json --aeb aeb_v1.2.json --seed 7
```

Kết quả nằm ở thư mục cùng tên file JSON (`--out` để đổi). Thoát `0` = chạy xong (dù
AEB FAIL), `2` = đầu vào sai (JSON sai in đủ mọi lỗi; `run_xosc.py` từ chối `.json`), `3` = CARLA lỗi kết nối/spawn, `4` = bị yêu cầu dừng.

Chạy cả batch trên CARLA: đặt `VEHICSIM_SIMULATOR=carla-xosc` và `VEHICSIM_CARLA_COMMAND` trên
máy có server CARLA (`scripts\dev-carla.ps1 -RestartBackend` tự đặt). Chế độ `carla` (runner JSON trực tiếp) đã gỡ: backend từ chối tạo run mới
và báo lỗi run cũ chưa chạy của profile đó trước khi gọi worker. Hủy/quá giờ: backend ghi `stop.requested`, `run_xosc.py` dừng ScenarioRunner
và dọn world, quá `STOP_GRACE_S` (15 s) mới giết cả cây; bị giết cứng thì lần chạy sau tự xoá actor sót lại. Run regression luôn chép bộ mô phỏng của run baseline; đổi cấu
hình sang CARLA thì regression tự dựng baseline CARLA mới, không ghép với baseline động học.

Đo thật trên CARLA 0.9.16 (01/10/2026, exec plan
[2026-10-01](../exec-plans/completed/2026-10-01-carla-variant-runner.md)): phanh xe CARLA yếu
hơn mô hình (~4,6 m/s²), và người đi bộ tăng tốc dần nên hay va vào **hông xe** — lộ ra
điểm mù của AEB (TD-18). Không dùng số CARLA làm bằng chứng regression cho tới khi
hiệu chuẩn xong (TD-17).

## Dữ liệu

- **Họ kịch bản = `scenarios`**; mỗi biến thể là một `scenario_versions` với
  `source = GENERATED` và `parent_version_id` trỏ về **bản gốc** của họ. Bản gốc là
  `MANUAL` (nhập tay) hoặc `NATURAL_LANGUAGE` (từ bước 1, giữ
  `natural_language_input`, `llm_model`, `scenario_ir_json.described`). Biến thể ghi điểm lưới
  vào cả IR lẫn cột lọc (`ego_speed_kmh`, `weather`, `road_friction`…). Không có bảng biến thể
  riêng — quyết định của nhóm, đừng tranh luận lại.
- **Run baseline** (`purpose = BASELINE`) và **run regression** (`REGRESSION`, có
  `regression_test_id` + `baseline_run_id`); FK composite ép run regression dùng
  đúng biến thể + seed + bộ mô phỏng + xe của run baseline, và đúng candidate / xe /
  bộ mô phỏng mà regression test đã chốt.
- **AEB**: `aeb_versions` (BASELINE/CANDIDATE/ACCEPTED/REJECTED/ARCHIVED; UNIQUE ép
  mỗi project đúng một BASELINE) + `aeb_parameter_values` cho đúng 4 tham số.
- **Xe**: `carla_vehicle_models` — danh mục xe gồm blueprint, kích thước từ mesh và thông số vật lý cố định,
  không phiên bản, app không sửa (ADR-038); project chọn xe (`projects.carla_vehicle_model_id`), run giữ đúng
  xe nó đã chạy. Bộ động học đọc
  dài/rộng/phanh tối đa; runner CARLA spawn `carla_blueprint_id`, ép khối lượng + hệ số cản + trọng tâm
  (`apply_physics_control`) và ghi bảng đối chiếu xe ↔ CARLA vào `telemetry_json.case.carla.vehicle_check`
  — kích thước không ép được (mesh của blueprint quyết định).
- **Bộ mô phỏng** của run nằm ở `simulation_runs.simulator_version`
  (`vehicsim-kinematic-1.0` hoặc `carla-<x.y.z>`; `simulator_type` để lọc); file của run CARLA (result.json,
  video) ghi đường dẫn vào `simulation_artifacts`.
- **Kết quả chấm** AEB/FCW nằm ngay trong `simulation_runs` (verdict, va chạm, min TTC, phanh oan,
  FCW…), chuỗi khung ở `telemetry_json`. Regression lưu số đếm + `regression_test_items`; bảng tổng hợp
  (`regression.summary`) tính lại từ run. Quyết định của Reviewer ở `engineering_recommendations`.
- Schema có 29 bảng (13 FE, ADR-036 → ADR-038; 5 role hệ thống, mỗi người một role, ADR-035); code đọc/ghi 19 bảng. Bảng
  chưa có code, nghĩa từng cột và lệnh nâng DB cũ ở
  [database-schema.md](database-schema.md).

## Regression và quyết định

Tiêu chí mặc định (`DEFAULT_CRITERIA` trong `regression.py`):

| Tiêu chí | Mặc định | Tắt được |
|---|---|---|
| Không kịch bản an toàn nào thành va chạm (`no_new_collision`) | bật | không |
| Tỉ lệ va chạm không tăng | bật | có |
| Phanh oan tăng ≤ 0,5 điểm % | bật | có |
| Median min TTC thay đổi ≥ −0,1 s | bật | có |
| Cùng seed cho hai version (`identical_seeds`) | bật | không |

Mọi tiêu chí đang bật phải qua thì verdict mới `PASSED`; trượt mà có ca tệ hơn baseline là `REGRESSED`,
trượt tiêu chí khác là `FAILED` (giao diện gộp hai loại thành FAILED). Chốt xong thì tạo một
`engineering_recommendations`. Chỉ **REVIEWER** được quyết định (`decide`) — Engineer / EXP tạo
regression nhưng không tự duyệt (DB còn chặn người duyệt = người tạo); project cá nhân của EXP không
có recommendation.
Quyết định cần lý do
và xác nhận; Accept chỉ khi test `PASSED`, baseline của test vẫn là BASELINE hiện hành
và candidate vẫn là CANDIDATE. Accept: hạ baseline cũ `ARCHIVED` **trước**, rồi nâng
candidate thành `BASELINE` trong cùng transaction.

Bài học đo được: trên họ demo 96 biến thể, chỉ tăng TTC (1,6 hoặc 1,8 s) luôn trượt
tiêu chí phanh oan; cấu hình qua được là TTC 1,6 + safety margin 0,5 m + prediction
horizon 1,5 s + brake delay 0,05 s (13 sửa được, 0 xấu đi).

## Bước 1: câu mô tả → Scenario IR

`describe.describe(text)`:

1. Chặn câu quá mơ hồ bằng `is_too_vague_to_generate` (trước khi tốn một lượt LLM).
2. Gọi `llm.call_with_escalation` với JSON Schema của `DescribedScenario`
   (provider theo `LLM_PROVIDER`: `openai` hoặc `deepseek`).
3. Kiểm IR theo giới hạn của simulator; sai thì gửi lỗi lại cho LLM, **tối đa 3 lần sửa**.
4. LLM lỗi hẳn → trích bằng regex/từ khoá (`rule_based`), không bịa số.
5. Mỗi trường có nguồn gốc: `stated` / `inferred` / `assumed` (điền mặc định) —
   giao diện hiện rõ, người dùng sửa thì thành `edited`.

Chỉ hỗ trợ motif người đi bộ băng ngang (kể cả ca dừng ở lề); mô tả khác trả 400.
Giới hạn 30 lượt / 15 phút / người (Redis) vì app public và mỗi lượt tốn tiền.

## Bộ sinh OpenSCENARIO (`src/services/openscenario/`)

**Đang dùng cho VehicSim (ADR-041, ADR-042):** `core/XoscExport` (Java; bản Python cũ đã gỡ) sinh XML OpenSCENARIO 1.0 từ IR hoặc bundle,
không cần CARLA/LLM. CP_CROSSING có ego/người đi bộ, thời tiết, trigger khoảng cách, polyline băng đường và
ParameterDeclarations cho seed/AEB/xe/source. `run_xosc.py` gọi ScenarioRunner v0.9.16 bằng file này; adapter
`vehicsim_aeb_control.py` chỉ đọc trạng thái CARLA và gửi cho lõi Java qua cầu nối, không có bản AEB thứ hai. XML dùng
LanePosition trên road 40/lane -4 Town04 để lấy đúng cao độ; mọi vị trí trong dải IR hiện có nằm trong đoạn thẳng.
Golden mới được kiểm XSD bởi `OpenScenarioSchemaTest`; `XoscExportTest` và `XoscReadParityTest` kiểm byte (trùng bản Python cũ),
round-trip metadata, trigger khoảng cách, dải biên và bộ sinh offline. Nút xuất có trên màn mô tả, chi tiết run và phát lại.

**Converter Forge cũ chỉ để đối chiếu (ADR-032):**
`convert_spec_to_xosc(ScenarioSpec) -> str` sinh OpenSCENARIO 1.0 chạy được bằng ScenarioRunner
0.9.15; `try_convert_spec` trả `(xosc, None)` hoặc `(None, ValidationIssue)` thay vì ném lỗi. Code
thuần, tất định (cùng spec → cùng byte, kiểm bằng 6 file mẫu trong `tests/test_openscenario/goldens/`
và XSD OpenSCENARIO 1.0), không gọi LLM. Đầu vào `ScenarioSpec` theo taxonomy Forge (cut-in, sudden brake, …)
không được đưa lại vào API hiện tại; không giả lập sáu category chưa hỗ trợ (TD-42).

## Xác thực

- Đăng ký và quên mật khẩu: email → mã 6 số (TTL 600 s, tối đa 5 lần nhập sai,
  gửi lại sau 60 s, giới hạn theo IP). Mã lưu **HMAC** trong Redis, không lưu MySQL.
- Không tiết lộ email có tồn tại: luồng OTP phản hồi và thời gian như nhau (gửi mail chạy nền).
- Hai cách đăng ký, backend chọn bằng `REGISTRATION_MODE` (`auto` | `one_step` | `otp`; `GET /auth/register/mode` cho
  frontend biết): `otp` = `POST /auth/register/request` rồi `/verify` (chỉ chủ email mới đăng ký được, cần SMTP);
  `one_step` = `POST /auth/register` tạo tài khoản luôn, không xác minh email. `auto` chọn `otp` ở production và `one_step`
  ở dev (chưa cần SMTP). Ở chế độ `otp` route một bước trả 403; backend cảnh báo lúc khởi động nếu `otp` mà chưa có SMTP,
  hoặc `one_step` ở production. Giá trị lạ làm backend không khởi động (không âm thầm mở đăng ký). Máy kiểm:
  `RegistrationModeTest`; trang `/register` của frontend đọc chế độ rồi hiện form tương ứng.
- Giới hạn tần suất (Redis, cửa sổ `RATE_LIMIT_WINDOW_SECONDS`): đăng nhập theo IP và theo tài khoản (chỉ đếm lần sai),
  xin OTP và đăng ký theo IP, mô tả bằng LLM theo người dùng.
  IP lấy từ `remoteAddr`; đứng sau reverse proxy / Cloudflare thì đặt `FORWARD_HEADERS_STRATEGY=native` để Tomcat thay bằng IP trong
  `X-Forwarded-For` — chỉ khi kết nối đến từ proxy tin cậy (`SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES`), nên không giả IP được bằng header.
- Nhật ký thao tác (`AuditLog`, logger `audit`): `auth.login`, `auth.register`, `auth.password_reset`, `auth.password_change`,
  `regression.decide`, mỗi sự kiện một dòng `event=… outcome=… user=… ip=…`; không bao giờ có mật khẩu, mã OTP hay token.
- Mật khẩu 8–72 ký tự và tối đa 72 byte (BCrypt chỉ dùng 72 byte đầu).
- CORS chỉ cho các origin trong `CORS_ORIGINS` (không `*`); Swagger UI / OpenAPI bị chặn ở production; frontend gửi header
  bảo mật (CSP `frame-ancestors 'none'`, `X-Frame-Options`, …) và tự đăng xuất khi backend trả 401 giữa phiên.
- JWT HS256 mang `pwv` (dấu vân tay của password hash): đổi mật khẩu là mọi phiên cũ
  hết hiệu lực. Production (`APP_ENV=production`) không chạy nếu thiếu `JWT_SECRET`; thiếu ở dev thì dùng khoá mặc định
  công khai và backend cảnh báo khi khởi động.
- Vai trò (ADR-035): **mỗi người đúng một role hệ thống** (`users.role_id`) — `ADMIN`, `MANAGER` (tạo
  workspace, thêm Engineer/Reviewer; chỉ đọc phần kỹ thuật), `ENGINEER` (làm toàn bộ quy trình), `REVIEWER`
  (chỉ duyệt recommendation), `EXPERIENCER` (tự đăng ký: project cá nhân, mô phỏng, tối ưu, regression; không
  recommendation, không duyệt). Role khác EXPERIENCER do Admin cấp bằng `scripts/create_admin.py --role …`
  (API quản lý user là TD-28). Lọc project theo workspace chưa làm (TD-30). App **public** nên giữ tự đăng ký.

## Bất biến và máy kiểm

Tên `test_*` là test Python ở `worker/tests/`; tên dạng LớpTest#phươngThức là test Java ở `src/test/java`. Hàng ghi "_chưa có test_ (TD-33)" là bất biến
còn đúng nhưng test cũ (Python, backend FastAPI) đã ngưng và chưa viết lại bằng Java.

| Bất biến | Máy kiểm |
|---|---|
| Cùng biến thể + seed ⇒ cùng kết quả; seed chỉ đổi nhiễu perception | `SimulatorBehaviorTest#sameSeedGivesIdenticalRun`, `SimulatorBehaviorTest#differentSeedChangesPerceptionNoiseOnlyThroughTheRng` |
| Người dừng ở lề ⇒ phanh oan, không phải va chạm | `SimulatorBehaviorTest#pedestrianStoppingAtTheCurbIsFalseBrakingNotCollision` |
| Va vào hông xe vẫn là va chạm, không bao giờ là phanh oan | `SimulatorBehaviorTest#pedestrianWalkingIntoTheSideIsACollisionNeverFalseBraking` |
| Lõi mô phỏng chỉ dùng JDK, không phụ thuộc Spring/DB/phần còn lại của backend | `CoreIsolationTest#coreImportsNothingFromSpringDatabaseOrTheRestOfTheBackend` |
| Backend Java, kể cả lõi, không dùng CARLA API | `ArchitectureRulesTest#javaBackendNeverTouchesCarlaApi` |
| Logic AEB, mô phỏng, chấm điểm chỉ ở `com.vehicsim.core`; `worker/` không có bản thứ hai và lõi Python không quay lại | `ArchitectureRulesTest#pythonWorkerHoldsNoAebLogic`, `ArchitectureRulesTest#thePythonCoreStaysDeleted`, `test_no_aeb_logic_lives_in_the_python_worker` |
| JSON tải từ web chạy lại ra đúng kết quả; CLI động học = kết quả backend (run cũ của v1.3 không còn tái lập — TD-40) | `KinematicCliTest#writesTheSameResultAsTheBackendAndSummarisesIt`, `KinematicInProcessTest#producesTheSameResultAsCallingTheCoreAndCarriesTheEngineVersion` |
| CARLA và động học dùng chung một AEB; profile 100 Hz ra cùng quyết định với bộ 20 Hz trên cùng thế giới | `CarlaSessionLogicTest#decisionsMatchThe20HzStackOnTheSameWorld`, `CarlaSessionLogicTest#defaultStackIsUnchangedForTheKinematicSimulator` |
| Run CARLA đi qua tiến trình con; crash/sai phiên bản chỉ hỏng run đó; CLI quá giờ được xin dừng trước khi bị giết | _chưa có test_ (TD-33) |
| Regression không bao giờ ghép kết quả động học với CARLA, hay khác xe (MySQL cũng ép bằng `fk_sr_baseline` / `fk_sr_regression`) | _chưa có test_ (TD-33) |
| Thông số vật lý xe lấy từ DB được áp vào xe CARLA; trường lạ hay số bánh sai bị từ chối (bảng đối chiếu `vehicle_check` của runner trực tiếp đã gỡ cùng `run_variant.py`) | `test_apply_physics_overrides_sets_scalars_com_and_wheels`, `test_apply_physics_overrides_refuses_unknown_fields_and_wheel_count_mismatch` |
| Giảm tốc phanh 100% đo được của xe (`carla_full_brake_decel_mps2`) đi từ DB qua bundle và `.xosc` tới controller; chưa đo thì 4,6 m/s² và XML giữ nguyên | `XoscExportTest#measuredFullBrakeDecelTravelsFromBundleToTheCarlaController`, `XoscExportTest#implausibleFullBrakeDecelIsRejected` |
| Cầu nối CARLA không bịa kết quả: lỗi/đứt ống là run lỗi; Java thoát khi stdin đóng; mỗi run dùng jar lõi chụp riêng nên `mvnw clean` giữa run vô hại | `BridgeProtocolTest#theProcessExitsWhenStdinClosesAndWritesNoResult`, `test_a_dead_java_process_is_an_error_not_a_default`, `test_a_run_keeps_working_after_target_classes_disappears` |
| Perception radar chạy bóng (ADR-043 giai đoạn 1) không đổi run thật: có/không radar thì khung, sự kiện, chỉ số trùng từng trường; vật tĩnh/mặt đường không thành track | `BridgeProtocolTest#radarShadowIsMeasuredButNeverChangesTheRealRun`, `RadarTrackerTest#staticClutterAndRoadReturnsNeverStartATrack` |
| Tắt backend giữa run CARLA: ghi cờ dừng trước để worker tự dọn world, quá hạn mới giết | `CarlaWebTest#shuttingDownMidRunAsksTheWorkerToCleanUpBeforeKillingIt` |
| Adapter CARLA áp góc lái của chính tick đó (không dùng `get_control()` của tick trước) và phanh/ga do lõi Java quyết định | `test_brake_override_keeps_this_ticks_steering` |
| Mọi tham số AEB được simulator dùng; seed Java khớp SQL; AEB có đúng 4 tham số chỉnh được | `AebParameterSeedTest#everySeededParameterIsUsedByTheSimulator`, `AebParameterSeedTest#javaParameterSeedMatchesSqlSeed`, `SimulatorBehaviorTest#aebHasExactlyTheFourTunableParameters` |
| Mọi route `/api/v1/vehicsim/*` cần đăng nhập; ENGINEER / EXPERIENCER / ADMIN ghi được, MANAGER chỉ đọc | `VehicSimSecurityTest#everyVehicsimRouteRequiresLogin`, `VehicSimSecurityTest#everyRoleCanReadButOnlyWriteRolesCanWrite` |
| Chỉ REVIEWER quyết định recommendation; REVIEWER không chạy mô phỏng; chỉ ADMIN khởi tạo dữ liệu | `VehicSimSecurityTest#onlyReviewerCanAcceptOrReject`, `VehicSimSecurityTest#everyRoleCanReadButOnlyWriteRolesCanWrite`, `VehicSimSecurityTest#onlyAdminCanBootstrap` |
| Người tạo khuyến nghị không tự duyệt | `RegressionDecisionTest#theAuthorOfTheRecommendationCannotApproveIt` |
| Accept hạ baseline cũ trước rồi nâng candidate; Reject giữ baseline; Request more tests không đổi version | `RegressionDecisionTest#acceptDemotesTheOldBaselineBeforePromotingTheCandidate`, `RegressionDecisionTest#rejectMarksTheCandidateButKeepsTheBaseline`, `RegressionDecisionTest#requestingMoreTestsChangesNoVersion` |
| Candidate chạy đúng seed baseline | _chưa có test_ (TD-33) |
| Test FAILED không Accept được; test chưa xong không quyết định được | `RegressionDecisionTest#aFailedTestCanNeverBeAccepted`, `RegressionDecisionTest#aTestThatHasNotFinishedCannotBeDecided` |
| Quyết định cần lý do + xác nhận; quyết định cuối không bị ghi đè | `RegressionDecisionTest#decisionNeedsAReasonAndExplicitConfirmation`, `RegressionDecisionTest#aFinalDecisionCannotBeOverwritten` |
| Baseline đã đổi ⇒ không Accept/Reject test cũ | `RegressionDecisionTest#acceptIsRefusedWhenTheBaselineChangedSinceTheTestRan`, `RegressionDecisionTest#acceptOrRejectIsRefusedWhenTheCandidateWasAlreadyDecidedElsewhere` |
| Tiêu chí regression bắt buộc không tắt được; kết luận (confidence) cần PASS + không ca nào xấu đi + đủ kịch bản | `RegressionRulesTest#defaultsKeepRequiredCriteriaOn`, `RegressionRulesTest#confidenceNeedsPassAndNoRegressionAndEnoughScenarios` |
| Tham số candidate nằm trong khoảng; preview khớp bộ kịch bản thật của test | _chưa có test_ (TD-33) |
| Luật theo category kịch bản (ADR-040) | `ScenarioRulesTest#checkThrowsInvalidRequestWithEveryProblem`, `ScenarioRulesTest#everyCategoryOfTheSchemaEnumIsKnown` |
| IR từ LLM ngoài khoảng bị báo để sửa; LLM trả lời qua tool-call ép cấu trúc | `DescribeServiceTest#outOfRangeValuesAreReportedForRepair`, `DescribeServiceTest#llmPathParsesTheForcedToolCallAndComputesCost` |
| LLM lỗi ⇒ lùi về luật; mô tả mơ hồ bị từ chối trước khi gọi LLM | `DescribeServiceTest#withoutApiKeyDescribeFallsBackToRulesAndSaysWhy`, `DescribeServiceTest#vagueSentencesAreRejectedBeforeAnyLlmCall` |
| Bước 1 cần quyền ghi (ENGINEER/EXPERIENCER/ADMIN) | `VehicSimSecurityTest#everyRoleCanReadButOnlyWriteRolesCanWrite` |
| Giới hạn tần suất của bước 1; họ từ mô tả giữ nguồn `NATURAL_LANGUAGE` | _chưa có test_ (TD-33) |
| Mọi lời gọi LLM qua `LlmService`; test không gọi LLM thật (máy chủ giả) | `ArchitectureRulesTest#onlyLlmServiceKnowsTheLlmProviders`, `DescribeServiceTest` |
| Không lộ email có tồn tại hay không; mã OTP chỉ lưu dạng hash gắn mục đích, dùng một lần | `AuthPrivacyTest#registrationCodeIsNotSentToAnEmailThatAlreadyHasAnAccount`, `AuthPrivacyTest#wrongPasswordAndUnknownEmailGiveTheSameError`, `AuthPrivacyTest#otpIsStoredOnlyAsAPurposeBoundHash`, `AuthPrivacyTest#otpWorksOnceAndOnlyWithTheRightCode` |
| Đăng ký OTP ở production, một bước ở dev; giá trị lạ không mở đăng ký | `RegistrationModeTest` |
| Mật khẩu ≤ 72 byte; token mất hiệu lực khi đổi mật khẩu; hash PBKDF2 cũ vẫn đăng nhập được | `AuthPasswordRuleTest`, `JwtServiceTest#changingThePasswordHashInvalidatesOldTokens`, `LegacyAwarePasswordEncoderTest` |
| Nhật ký thao tác một dòng mỗi sự kiện, không chèn được dòng giả; mật khẩu / token không vào log | `AuditLogTest#newlinesInAValueCannotForgeASecondLogLine`, `ArchitectureRulesTest#logStatementsDoNotMentionSecretValues` |
| Ô CSV bắt đầu bằng `=` `+` `-` `@` bị vô hiệu hoá | `HardeningTest#csvCellNeutralisesSpreadsheetFormulas` |
| Tài liệu cho agent: ngắn, link sống, tên test có thật, từ điển dữ liệu phủ hết bảng/cột, mọi ADR trong mục lục | `RepoDocsTest` |

`RepoDocsTest` bắt tên test ở bảng này (và ở `AGENTS.md`) phải còn tồn tại — đổi tên test thì sửa bảng.

## Frontend

- Trang VehicSim nằm **thẳng** trong `app/` (`app/page.tsx`, `app/scenarios`, `app/aeb`,
  `app/analysis`, `app/validation`), URL không có tiền tố. Khung riêng `components/VehicSimShell.tsx`
  (sidebar Figma, kiểm tra đăng nhập, Plus Jakarta Sans, token `vehicsim-*`
  trong `globals.css`), theo Figma *VehicSim — FE-12/13/14 UI (Trung)* (file key
  `k6LErf7biJUfWfd320Foe0`). Màn đăng nhập/đăng ký không có trong Figma, dựng theo
  cùng token.
- Client API: `services/vehicsim.ts`; kiểu: `types/vehicsim.ts` (khớp payload
  `views.py`). Component VehicSim nằm thẳng trong `components/`:
  `VehicSimShell`, `VehicSimSidebar`, `VehicSimPage`, `VehicSimContext`, `VehicSimUi`,
  `FlowBar`, `FamilyForm`, `ScenarioMap`, `TelemetryChart`, `vehicsimFlow`, `vehicsimFonts`,
  `vehicsimI18n`.
- `/` là Tổng quan; chưa đăng nhập thì chuyển sang `/login`. Hồ sơ cá nhân ở `/profile` (bấm
  tên ở cuối sidebar). URL cũ `/vs/*` được chuyển hướng trong `frontend/next.config.ts`.
  Mọi trang trong `app/` tự nằm trong `VehicSimShell` (sidebar + kiểm đăng nhập); trang không
  cần đăng nhập thì thêm vào `STANDALONE_PATHS` (`components/AppLayoutWrapper.tsx`).
  Ảnh SVG của Figma nằm ở `frontend/public/vehicsim/`.
- Giao diện tiếng Việt; **DB và API giữ nguyên tiếng Anh**. Câu do backend sinh ra (mô tả
  lỗi, nguyên nhân gốc, tiêu đề, nhãn sự kiện, tóm tắt biến thể, tiêu chí, đánh đổi, bằng
  chứng) được dịch **ở tầng hiển thị** bởi `components/vehicsimI18n.ts` (`vi`, `viSummary`,
  `viWeather`, `viTime`): khớp mẫu câu, giữ số, không khớp thì hiện nguyên văn. Đổi câu
  chữ trong `evaluation.py` / `simulator.py` / `views.py` / `regression.py` thì sửa mẫu ở đó.
  Tên do DB/người dùng đặt (họ kịch bản, tham số AEB, workspace) hiển thị nguyên văn.

## Cấu hình

| Biến | Ý nghĩa |
|---|---|
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | MySQL (mặc định `vehicsim` ở `localhost:3306`) |
| `SPRING_REDIS_HOST` / `SPRING_REDIS_PORT` | Redis: OTP + rate limit |
| `VEHICSIM_RUN_MODE` | `async` (mặc định, thread pool) hoặc `inline` |
| `VEHICSIM_RUN_CONCURRENCY` | Số run song song của bộ động học (CARLA luôn 1) |
| `VEHICSIM_WORKER_PYTHON`, `VEHICSIM_WORKER_DIR` | Python ≥ 3.10 và thư mục `worker/` cho tiến trình con |
| `SIMULATION_TIMEOUT_S` | Trần thời gian một run (mặc định 120; CARLA nên 300) |
| `VEHICSIM_SIMULATOR` | `kinematic` (mặc định), `carla` (runner trực tiếp cũ, đã gỡ ở ADR-042), `carla-xosc` (ScenarioRunner + controller AEB) |
| `VEHICSIM_CARLA_COMMAND` | Lệnh gọi CLI CARLA, JSON list (vd. `["…/worker/.venv-carla/Scripts/python.exe","worker/run_xosc.py","--camera"]`) |
| `VEHICSIM_CARLA_VERSION` | Phiên bản server CARLA mà run mới yêu cầu (mặc định `0.9.15`) |
| `VEHICSIM_DATA_ROOT` | Thư mục `runs/<id>/` của run CARLA (mặc định `./data/vehicsim`) |
| `VEHICSIM_WRITES_PER_WINDOW`, `VEHICSIM_MAX_ACTIVE_RUNS_PER_USER` | Hạn mức ghi và số run chờ + chạy của một người (mặc định 30 / 1500) |
| `APP_ENV` | `development` (mặc định) hoặc `production` (bắt buộc `JWT_SECRET`, tắt Swagger, không log OTP) |
| `JWT_SECRET`, `ACCESS_TOKEN_TTL_MINUTES` | Phiên đăng nhập (`JWT_SECRET`: Base64 ≥ 256 bit) |
| `CORS_ORIGINS` | Origin của frontend được gọi API |
| `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | Mã 6 số |
| `REGISTRATION_MODE` | `auto` (mặc định: production → `otp`, còn lại → `one_step`), `one_step`, `otp` |
| `FORWARD_HEADERS_STRATEGY` | `none` (mặc định) hoặc `native` khi đứng sau reverse proxy (TD-36) |
| `RATE_LIMIT_WINDOW_SECONDS`, `LOGIN_ATTEMPTS_PER_IP`, `LOGIN_ATTEMPTS_PER_ACCOUNT`, `OTP_REQUESTS_PER_IP`, `REGISTER_REQUESTS_PER_IP` | Giới hạn tần suất xác thực |
| `LLM_PROVIDER`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | Lớp LLM dùng chung (chỉ bước 1 "Sinh từ mô tả" gọi LLM) |
| `SMTP_*` | Gửi mã qua email (STARTTLS bắt buộc) |
