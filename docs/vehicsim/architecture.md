# Kiến trúc — VehicSim MVP

Tài liệu kiến trúc của **VehicSim**: vòng khép kín AEB trên *một* motif (người đi
bộ băng ngang, kiểu Euro NCAP CPNA). Scenario Forge — dự án gốc mà repo dựng lên từ đó —
đã gỡ ngày 04/10/2026; chỉ giữ bộ sinh OpenSCENARIO ở `src/services/openscenario/`
([ADR-032](../adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)).

> Nguồn sự thật: schema DB là [`database/mysql/01_schema.sql`](../../database/mysql/01_schema.sql)
> (mirror trong `src/services/vehicsim/tables.py`); lý do quyết định là ADR-023 →
> ADR-035 trong [`docs/adr/`](../adr/README.md). Tài liệu này vênh với hai nguồn đó
> thì tài liệu này sai.

## Vòng MVP 6 bước

| Bước | Người dùng làm | URL (code: `frontend/src/app/<URL>/page.tsx`) | API (`/api/v1/vehicsim`) | Code chính |
|---|---|---|---|---|
| 1. Mô tả kịch bản | Câu tiếng Việt → xem/sửa Scenario IR | `/scenarios/new` | `POST /scenarios/describe` | `describe.py` |
| 2. Sinh biến thể | Lưới tham số → họ kịch bản | `/scenarios/new`, `/scenarios` | `POST /families` | `family.py` |
| 3. Chạy baseline | Chạy mọi biến thể với AEB baseline | `/scenarios` | `POST /families/{id}/run` | `runs.py` + Celery |
| 4. Phân tích lỗi | Danh sách lỗi → chi tiết/nguyên nhân → playback → tải JSON chạy lại trên CARLA | `/analysis/failures/**` | `GET /failures`, `/runs/{id}`, `/runs/{id}/playback`, `/runs/{id}/bundle` | `evaluation.py`, `views.py`, `worker/run_variant.py` |
| 5. Cấu hình mới & chạy lại | Tạo candidate AEB → regression cùng seed | `/aeb`, `/validation/regression/new` | `POST /aeb/versions`, `GET /regression/preview`, `POST /regression` | `aeb.py`, `regression.py` |
| 6. So sánh & quyết định | Kết quả regression → khuyến nghị → **Reviewer** Accept/Reject/Request more tests | `/validation/**` | `GET /regression/{id}`, `/recommendations/{id}`, `POST /recommendations/{id}/decision` | `regression.py`, `views.py` |

Trang `/` (Tổng quan) tính trạng thái 6 bước từ dữ liệu thật và chỉ bước tiếp theo;
mỗi màn có thanh tiến trình (`components/FlowBar.tsx`, danh sách bước ở
`components/vehicsimFlow.ts`).

## Sơ đồ

```
Next.js (/, /scenarios, /aeb, /analysis/*, /validation/*)  ──JWT──▶  FastAPI /api/v1/vehicsim/*  (vehicsim_routes.py: chỉ đổi lỗi → HTTP)
                              │
                              ▼
                  src/services/vehicsim/*  ──SQLAlchemy Core──▶  MySQL (19/30 bảng)
                              │ dispatch(run_ids)
                              ▼
              Redis db1 (broker) ──▶ Celery worker `vehicsim.run_simulation`
                                           │ execute_run(run_id) → spec_for_run() (= JSON "Tải JSON chạy CARLA")
                                           ▼
        simulator_version = vehicsim-kinematic-1.0      simulator_version = carla-<x.y.z>
            simulator.simulate() (trong process)            VEHICSIM_CARLA_COMMAND <bundle> --out runs/<id> --fast
                                     │                       (tiến trình con, timeout) → result.json
                                     └──────────┬───────────────────────┘
                                                ▼  cả hai dùng chung aeb_stack.AebStack
                        evaluation.evaluate() → ghi kết quả vào simulation_runs + collision_events/failures/root_causes(/artifacts)
                        → regression.on_run_finished() → try_finalize()
```

`VEHICSIM_RUN_MODE=inline` chạy `execute_run` ngay trong request (dùng cho test);
mặc định `celery`. Worker Windows chạy `--pool=solo`; worker chạy CARLA trên Linux phải
`--concurrency=1` (một server CARLA chỉ chạy một lượt một lúc).

## Bản đồ module (`src/services/vehicsim/`)

| File | Trách nhiệm |
|---|---|
| `tables.py` | Bảng SQLAlchemy Core mirror `01_schema.sql` (chỉ cột code dùng; chung `metadata` với auth) |
| `bootstrap.py` | Workspace/project/phiên bản xe mặc định, 10 tham số AEB (`AEB_PARAMETER_SEED`), baseline v1.0 (TTC 1,5 s) |
| `describe.py` | Câu mô tả → LLM → IR đã kiểm; sửa ≤ 3 lần; lùi về luật khi LLM lỗi |
| `family.py` | `FamilySpec` (lưới, giới hạn, ≤ 300 biến thể), tạo họ + bản gốc + biến thể trong một transaction |
| `aeb_stack.py` | **Hệ AEB cần kiểm thử**, dùng chung cho mọi bộ mô phỏng: `AebParams` (10 tham số), `AebStack.step` mỗi tick = perception (độ tin cậy theo thời tiết/giờ/khoảng cách + nhiễu theo seed) → decision (TTC + hành lang) → control (trễ, actuator, tăng lực phanh). Chỉ thư viện chuẩn |
| `simulator.py` | "Thế giới" động học tất định: xe, người đi bộ, va chạm, μ·g; `make_frame` / `MotionStats` / `build_outcome` dùng chung với CARLA. `DT = 0.05 s`, tối đa 12 s |
| `bundle.py` | Hợp đồng JSON: `vehicsim.variant/v1` (biến thể + AEB + xe + seed) và `vehicsim.result/v1`; `read_spec` nhận cả Scenario IR trần |
| `evaluation.py` | Kết quả `COLLISION` / `NEAR_MISS` / `SAFE`, verdict, false/missed activation, chuỗi nguyên nhân PERCEPTION → DECISION → CONTROL → VEHICLE_DYNAMICS theo ngân sách thời gian |
| `runs.py` | Tạo run (seed = `48000 + id biến thể`, bộ mô phỏng theo cấu hình hoặc chép từ run baseline), dispatch inline/Celery, `execute_run` idempotent, `spec_for_run`/`bundle_for_run`, gọi CLI CARLA bằng tiến trình con |
| `regression.py` | Tạo test (chốt xe + bộ mô phỏng), ghép cặp, chốt verdict + `regression_test_items` + khuyến nghị, `summary` tính lại từ run, `decide`, `preview` |
| `aeb.py` | Tạo candidate: tham số trong khoảng, phải khác version cha |
| `views.py` | Payload đọc cho từng màn (failures, run detail, playback, regression, recommendation) |
| `common.py` | `NotFoundError`, `InvalidRequestError`, nhãn hiển thị, `baseline_version`, `active_vehicle` |

`src/celery_app.py`: app `vehicsim`, task `vehicsim.run_simulation`, queue
`vehicsim.simulation`, `acks_late`, time limit theo `SIMULATION_TIMEOUT_S`.

`aeb_stack.py`, `simulator.py`, `bundle.py`, `evaluation.py` là **lõi mô phỏng**: chỉ thư
viện chuẩn, cú pháp Python 3.10, vì venv CARLA của worker import thẳng chúng.

## Bộ mô phỏng: động học và CARLA

Hai bộ mô phỏng thay thế nhau sau một hợp đồng (ADR-027). Cả hai nhận **cùng file
JSON**, dùng **cùng `AebStack`**, ghi **cùng `result.json`**, được chấm bằng **cùng
`evaluation.py`**:

| | Động học (`worker/kinematic_sim.py`, hoặc trong process) | CARLA (`worker/run_variant.py`) |
|---|---|---|
| Chạy ở đâu | Máy nào cũng được, < 1 s/run | Máy có server CARLA (venv worker, `carla` khớp phiên bản server) |
| Vật lý | Điểm khối, giảm tốc tức thì theo lệnh, μ·g | Xe/lốp/va chạm của CARLA; người đi bộ tăng tốc dần |
| Perception | Mô hình tổng hợp trên ground truth | Như bên trái (chưa đọc camera/LiDAR) |
| Cảnh | Không có hình | Đoạn làn thẳng tự tìm trên map đang mở, camera bám xe, `--video` |
| Dùng khi | Dev, test tự động, batch nhanh, dự phòng khi demo | Xem tận mắt, quay video, đối chiếu |

Chạy tay một JSON tải từ web (nút **"Tải JSON chạy CARLA"** ở màn Chi tiết lỗi /
Phát lại, hoặc Scenario IR ở màn Sinh từ mô tả):

```bash
python worker/kinematic_sim.py vehicsim-run-42.json                      # khớp kết quả trên web
worker/.venv/bin/python worker/run_variant.py vehicsim-run-42.json --video # CARLA, xem trong cửa sổ CARLA
python worker/kinematic_sim.py scenario-ir.json --aeb aeb_v1.2.json --seed 7
```

Kết quả nằm ở thư mục cùng tên file JSON (`--out` để đổi). Thoát `0` = chạy xong (dù
AEB FAIL), `2` = JSON sai (in đủ mọi lỗi), `3` = CARLA lỗi kết nối/spawn.

Chạy cả batch trên CARLA: đặt `VEHICSIM_SIMULATOR=carla` và `VEHICSIM_CARLA_COMMAND` trên
máy chạy worker Celery. Quá giờ, worker gửi CTRL_BREAK/SIGTERM cho cả nhóm tiến trình, chờ
`STOP_GRACE_S` (15 s) để CLI xoá actor và trả CARLA về chế độ không đồng bộ, rồi mới giết;
CLI bị giết cứng thì lần chạy sau tự xoá actor `vehicsim_*` sót lại. Run regression luôn chép bộ mô phỏng của run baseline; đổi cấu
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
  đúng biến thể + seed + bộ mô phỏng + phiên bản xe của run baseline, và đúng candidate / xe /
  bộ mô phỏng mà regression test đã chốt.
- **AEB**: `aeb_versions` (BASELINE/CANDIDATE/ACCEPTED/REJECTED/ARCHIVED; UNIQUE ép
  mỗi project đúng một BASELINE) + `aeb_parameter_values` cho đúng 10 tham số.
- **Xe**: `vehicle_versions` (Digital Twin có phiên bản, đúng một bản đang dùng mỗi project; run giữ
  đúng phiên bản nó đã chạy) + `carla_vehicle_models` (blueprint, kích thước từ mesh). Bộ động học đọc
  dài/rộng/phanh tối đa; runner CARLA spawn `carla_blueprint_id`, ép khối lượng + hệ số cản + trọng tâm
  (`apply_physics_control`) và ghi bảng đối chiếu xe ↔ CARLA vào `telemetry_json.case.carla.vehicle_check`
  — kích thước không ép được (mesh của blueprint quyết định).
- **Bộ mô phỏng** của run nằm ở `simulation_runs.simulator_version`
  (`vehicsim-kinematic-1.0` hoặc `carla-<x.y.z>`; `simulator_type` để lọc); file của run CARLA (result.json,
  video) ghi đường dẫn vào `simulation_artifacts`.
- **Kết quả chấm** AEB/FCW nằm ngay trong `simulation_runs` (verdict, va chạm, min TTC, phanh oan,
  FCW…), chuỗi khung ở `telemetry_json`. Regression lưu số đếm + `regression_test_items`; bảng tổng hợp
  (`regression.summary`) tính lại từ run. Quyết định của Reviewer ở `engineering_recommendations`.
- Schema có 30 bảng (13 FE, ADR-036, ADR-037; 5 role hệ thống, mỗi người một role, ADR-035); code đọc/ghi 19 bảng. Bảng
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

Giữ lại từ Scenario Forge (ADR-032) cho FE-07 "Import/Export `.xosc`":
`convert_spec_to_xosc(ScenarioSpec) -> str` sinh OpenSCENARIO 1.0 chạy được bằng ScenarioRunner
0.9.15; `try_convert_spec` trả `(xosc, None)` hoặc `(None, ValidationIssue)` thay vì ném lỗi. Code
thuần, tất định (cùng spec → cùng byte, kiểm bằng 6 file mẫu trong `tests/test_openscenario/goldens/`
và XSD OpenSCENARIO 1.0), không gọi LLM (`test_openscenario_generator_never_calls_an_llm`).
**Chưa nối vào API/màn hình:** đầu vào là `ScenarioSpec` (taxonomy ODD của Forge: cut-in, sudden
brake, …), chưa có ánh xạ từ IR người đi bộ băng ngang của VehicSim — việc của FE-07.

## Xác thực

- Đăng ký và quên mật khẩu: email → mã 6 số (TTL 600 s, tối đa 5 lần nhập sai,
  gửi lại sau 60 s, giới hạn theo IP). Mã lưu **HMAC** trong Redis, không lưu MySQL.
- Không tiết lộ email có tồn tại: phản hồi và thời gian như nhau.
- JWT HS256 mang `pwv` (dấu vân tay của password hash): đổi mật khẩu là mọi phiên cũ
  hết hiệu lực. Production không chạy nếu thiếu `JWT_SECRET_KEY`.
- Vai trò (ADR-035): **mỗi người đúng một role hệ thống** (`users.role_id`) — `ADMIN`, `MANAGER` (tạo
  workspace, thêm Engineer/Reviewer; chỉ đọc phần kỹ thuật), `ENGINEER` (làm toàn bộ quy trình), `REVIEWER`
  (chỉ duyệt recommendation), `EXPERIENCER` (tự đăng ký: project cá nhân, mô phỏng, tối ưu, regression; không
  recommendation, không duyệt). Role khác EXPERIENCER do Admin cấp bằng `scripts/create_admin.py --role …`
  (API quản lý user là TD-28). Lọc project theo workspace chưa làm (TD-30). App **public** nên giữ tự đăng ký.

## Bất biến và máy kiểm

| Bất biến | Máy kiểm |
|---|---|
| Cùng biến thể + seed ⇒ cùng kết quả; seed chỉ đổi nhiễu perception | `test_same_seed_gives_identical_run`, `test_different_seed_changes_perception_noise_only_through_rng` |
| Người dừng ở lề ⇒ phanh oan, không phải va chạm | `test_pedestrian_stopping_at_curb_is_false_braking_not_collision` |
| Va vào hông xe vẫn là va chạm, không bao giờ là phanh oan | `test_pedestrian_walking_into_the_side_is_a_collision_never_false_braking` |
| Lõi mô phỏng chỉ thư viện chuẩn + cú pháp 3.10 (venv CARLA import được) | `test_sim_core_is_stdlib_only_and_python310` |
| JSON tải từ web chạy lại ra đúng kết quả đã lưu; CLI động học = backend | `test_exported_bundle_reproduces_the_stored_run`, `test_kinematic_cli_writes_the_same_result_as_the_backend` |
| CARLA và động học dùng chung AEB, frame, số đo | `test_runner_reuses_the_kinematic_aeb_and_result_builders` |
| Run CARLA đi qua tiến trình con; crash/sai phiên bản chỉ hỏng run đó | `test_carla_runs_go_through_the_simulator_subprocess`, `test_simulator_failure_marks_only_that_run_failed` |
| CLI quá giờ được xin dừng trước khi bị giết, kịp dọn CARLA | `test_hung_simulator_is_asked_to_stop_and_cleans_up` |
| Regression không bao giờ ghép kết quả động học với CARLA, hay khác phiên bản xe (MySQL cũng ép bằng `fk_sr_baseline` / `fk_sr_regression`) | `test_regression_never_pairs_kinematic_with_carla` |
| Thông số xe lấy từ DB: CARLA nhận blueprint + vật lý của xe và báo rõ cái gì không ép được | `test_bundle_carries_the_main_vehicle_into_carla`, `test_db_vehicle_is_forced_into_carla_and_checked` |
| Mọi tham số AEB được simulator dùng; seed Python khớp SQL | `test_every_seeded_parameter_is_used_by_the_simulator`, `test_python_parameter_seed_matches_sql_seed` |
| Mọi route API `/api/v1/vehicsim/*` cần đăng nhập; ENGINEER / EXPERIENCER / ADMIN ghi được, MANAGER chỉ đọc | `test_every_vehicsim_route_requires_login`, `test_viewer_can_read_but_not_write`, `test_registered_experience_user_can_run_but_manager_only_cannot` |
| Chỉ REVIEWER quyết định recommendation; người làm không tự duyệt; REVIEWER không chạy mô phỏng | `test_only_reviewer_decides_and_reviewer_cannot_run` |
| Candidate chạy đúng seed baseline; Accept đổi baseline | `test_regression_pairs_same_seeds_and_accept_swaps_baseline` |
| Test FAILED không Accept được | `test_failed_regression_cannot_be_accepted` |
| Quyết định cần lý do + xác nhận | `test_decision_requires_reason_and_confirmation` |
| Baseline đã đổi ⇒ không Accept/Reject test cũ | `test_accepting_one_candidate_blocks_stale_tests` |
| Tham số candidate nằm trong khoảng | `test_candidate_values_must_stay_in_parameter_range` |
| Preview khớp bộ kịch bản thật của test | `test_regression_preview_counts_match_created_test` |
| IR đánh dấu đúng nguồn gốc; sửa có phản hồi, tối đa 3 lần | `test_llm_ir_marks_stated_inferred_and_assumed`, `test_invalid_ir_is_repaired_with_feedback`, `test_repairs_are_capped` |
| LLM lỗi ⇒ lùi về luật; mô tả sai motif ⇒ 400 | `test_llm_failure_falls_back_to_rules`, `test_non_pedestrian_and_vague_prompts_are_rejected` |
| Bước 1 cần quyền ghi (ENGINEER/EXPERIENCER/ADMIN) + giới hạn tần suất | `test_describe_endpoint_permissions_and_rate_limit` |
| Họ từ mô tả giữ nguồn `NATURAL_LANGUAGE` | `test_family_from_description_keeps_nl_origin` |
| Mọi lời gọi LLM qua `services/llm.py` | `test_nothing_imports_the_llm_provider_directly` |
| Test không gọi LLM thật | fixture chặn trong `tests/conftest.py` |

`tests/test_agent_docs.py` bắt tên test ở bảng này phải còn tồn tại — đổi tên test
thì sửa bảng.

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
| `VEHICSIM_DATABASE_URL` | MySQL VehicSim + auth (`mysql+pymysql://…`) |
| `REDIS_URL` | OTP + rate limit |
| `CELERY_BROKER_URL` | Broker Celery (mặc định `redis://localhost:6379/1`) |
| `VEHICSIM_RUN_MODE` | `celery` (mặc định) hoặc `inline` |
| `SIMULATION_TIMEOUT_S` | Trần thời gian một run (mặc định 120; CARLA nên 300) |
| `VEHICSIM_SIMULATOR` | Bộ mô phỏng cho run mới: `kinematic` (mặc định) hoặc `carla` |
| `VEHICSIM_CARLA_COMMAND` | Lệnh gọi CLI CARLA, JSON list (vd. `["…/worker/.venv/bin/python","worker/run_variant.py","--map","Town05"]`) |
| `VEHICSIM_CARLA_VERSION` | Phiên bản server CARLA mà run mới yêu cầu (mặc định `0.9.15`) |
| `VEHICSIM_DATA_ROOT` | Thư mục `runs/<id>/` của run CARLA (mặc định `./data/vehicsim`) |
| `JWT_SECRET_KEY`, `ACCESS_TOKEN_TTL_MINUTES` | Phiên đăng nhập |
| `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | Mã 6 số |
| `LLM_PROVIDER`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY` | Lớp LLM dùng chung (chỉ bước 1 "Sinh từ mô tả" gọi LLM) |
| `SMTP_*` | Gửi mã qua email |
