# AGENTS.md — bản đồ cho agent và người mới vào repo

File này là **bản đồ**, không phải cẩm nang: mỗi mục chỉ nói *ở đâu* và *luật
nào không được phá*. Chi tiết nằm ở các link. Thứ gì không có trong repo thì
agent coi như không tồn tại — quyết định, bài học, nợ kỹ thuật phải được viết vào
`docs/`, không để trong chat hay Google Docs. `tests/test_agent_docs.py` giữ file
này ngắn và giữ mọi link còn sống.

## Repo này là gì

VehicSim / VSOS (SEP490-FA26-G15): nền tảng mô phỏng và tối ưu AEB/FCW — FastAPI + Next.js +
lớp LLM + một database MySQL. Scenario Forge, dự án gốc mà repo dựng lên từ đó, đã gỡ ngày 04/10
([ADR-032](docs/adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)); chỉ giữ bộ sinh OpenSCENARIO.

| Phần | Làm gì | Code chính | Lưu trữ | Đọc trước |
|---|---|---|---|---|
| VehicSim MVP (nhánh `trungdam`, 09/2026) | Vòng AEB 6 bước: mô tả → biến thể → baseline → lỗi → candidate → regression → kỹ sư quyết định; mô phỏng bằng bộ động học hoặc CARLA sau một hợp đồng JSON; Trợ lý dự án (RAG, chỉ đọc) trên Tổng quan | `src/services/vehicsim/`, `src/api/vehicsim_routes.py`, `worker/{run_variant,kinematic_sim,sim_common}.py`, `frontend/src/app/{page.tsx,scenarios,aeb,analysis,validation}`, `frontend/src/components/VehicSim*` | MySQL 36 bảng + Redis | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md) |
| Xác thực | Đăng ký/quên mật khẩu bằng mã 6 số, JWT, hồ sơ | `src/services/auth/`, `src/api/auth_routes.py`, `frontend/src/app/{login,register,forgot-password,profile}` | MySQL `users/roles` + Redis (OTP) | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md#xác-thực) |
| Bộ sinh OpenSCENARIO (giữ từ Forge) | `ScenarioSpec` → `.xosc` tất định, chưa nối API (TD-27) | `src/services/openscenario/`, `tests/test_openscenario/` | — | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md#bộ-sinh-openscenario-srcservicesopenscenario) |

Việc đã làm cho VehicSim MVP, theo thứ tự và kèm bằng chứng:
[vòng MVP](docs/exec-plans/completed/2026-09-30-vehicsim-mvp-loop.md),
[JSON → CARLA](docs/exec-plans/completed/2026-10-01-carla-variant-runner.md),
[Trợ lý dự án](docs/exec-plans/completed/2026-10-02-project-assistant.md),
[database phủ đủ chức năng](docs/exec-plans/completed/2026-10-03-database-phu-du-chuc-nang.md),
[gỡ Scenario Forge](docs/exec-plans/completed/2026-10-04-go-scenario-forge.md).

## Chạy và tự kiểm chứng

| Việc | Lệnh |
|---|---|
| Bật toàn bộ app (Windows) | `scripts\dev-up.cmd` — Docker (MySQL, Redis) + Celery worker + backend `:8001` + frontend `:3000`, mỗi dịch vụ một cửa sổ |
| Tạo admin | `uv run python scripts/create_admin.py --email <email>` |
| Seed project VehicSim | `uv run python scripts/seed_vehicsim.py --owner <email> [--demo]` |
| Gate backend (đúng như CI) | `make check` hoặc `uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/ && uv run pytest tests/` |
| Gate frontend (**chưa có trong CI**, chạy tay) | `cd frontend && npm run lint && npx tsc --noEmit && npx next build` |
| Chỉ test VehicSim | `uv run pytest tests/test_vehicsim tests/test_worker/test_run_variant.py tests/test_api/test_auth.py` |
| Chạy một JSON tải từ web ("Tải JSON chạy CARLA") | `python worker/kinematic_sim.py <file>.json` (máy nào cũng chạy) · `worker/.venv/bin/python worker/run_variant.py <file>.json [--video]` (cần server CARLA) |

- Test **mặc định chặn LLM thật** (`tests/conftest.py`); gọi thật phải bật
  `RUN_LLM_TESTS=1` có chủ đích. Mock `src.services.llm.call_with_escalation`,
  đừng mock lớp dưới.
- Test VehicSim chạy mô phỏng inline (`VEHICSIM_RUN_MODE=inline`), DB SQLite RAM,
  Redis giả (`fakeredis`) — không cần Docker.
- Đồ thị code (graphify, tuỳ chọn, chỉ nằm trên máy dựng nó vì `graphify-out/` bị gitignore):
  `graphify update .` dựng lại (AST, không tốn token), `graphify query "<câu hỏi>"` thay cho
  đọc nhiều file. Không có đồ thị thì cứ đọc code như bình thường.
- Sửa UI thì phải nhìn UI: chạy app, đăng nhập, chụp màn hình bằng trình duyệt
  headless và so với Figma trước khi báo xong (cách làm ở exec plan §Kiểm chứng).

## Bản đồ tài liệu

| Cần biết | Đọc |
|---|---|
| Kiến trúc VehicSim: module, luồng dữ liệu, API, bất biến ↔ test | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md) |
| Vì sao chọn X thay vì Y | [docs/adr/README.md](docs/adr/README.md) — VehicSim: ADR-023 → ADR-032; ADR-001 → 022 là lịch sử Forge |
| Đã làm gì, quyết định lúc nào, kiểm chứng ra sao | [docs/exec-plans/completed/](docs/exec-plans/completed/2026-09-30-vehicsim-mvp-loop.md) |
| Còn thiếu gì, nợ gì | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Schema MySQL (nguồn sự thật của DB VehicSim) | [database/mysql/01_schema.sql](database/mysql/01_schema.sql) |
| Từng bảng/cột nghĩa là gì, ai ghi, dữ liệu JSON, lệch đã biết | [docs/vehicsim/database-schema.md](docs/vehicsim/database-schema.md) |
| Làm FE-13 (tối ưu, dò ranh giới lỗi, active learning) — bắt đầu từ đâu | [docs/vehicsim/fe13-y-tuong-tu-forge.md](docs/vehicsim/fe13-y-tuong-tu-forge.md) |
| Bẫy khi chạy CARLA / ScenarioRunner thật | [CLAUDE.md](CLAUDE.md) |
| Quy ước Next.js 16 của frontend (khác bản cũ) | [frontend/AGENTS.md](frontend/AGENTS.md) |

## Luật cứng — có máy kiểm, phá là test/CI đỏ

1. Mọi lời gọi LLM đi qua `src/services/llm.py`; không import SDK provider ở chỗ khác
   (`test_nothing_imports_the_llm_provider_directly`); bộ sinh `.xosc` không gọi LLM
   (`test_openscenario_generator_never_calls_an_llm`).
2. `src/` không import `carla` (`test_src_never_imports_carla`).
3. Mọi route `/api/v1/vehicsim/*` cần đăng nhập; chỉ ADMIN/EXPERT/ENGINEER được ghi, tài khoản
   khác chỉ đọc (`test_every_vehicsim_route_requires_login`, `test_viewer_can_read_but_not_write`,
   `test_expert_can_run_and_test_like_engineer`).
4. Cùng biến thể + cùng seed ⇒ cùng kết quả mô phỏng; candidate luôn chạy lại **đúng
   seed** của run baseline (`test_same_seed_gives_identical_run`,
   `test_regression_pairs_same_seeds_and_accept_swaps_baseline`).
5. Không bao giờ tự Accept: test FAILED không Accept được, quyết định cần lý do +
   xác nhận, baseline đã đổi thì không Accept test cũ (bảng bất biến đầy đủ ở
   [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md#bất-biến-và-máy-kiểm)).
6. Tham số AEB Python khớp seed SQL (`test_python_parameter_seed_matches_sql_seed`).
7. Không lộ email có tồn tại hay không; mã OTP lưu dạng hash, dùng một lần
   (`tests/test_api/test_auth.py`).
8. Một AEB cho mọi bộ mô phỏng: logic AEB chỉ ở `src/services/vehicsim/aeb_stack.py`; lõi
   mô phỏng chỉ dùng thư viện chuẩn + cú pháp 3.10 để venv CARLA import được
   (`test_sim_core_is_stdlib_only_and_python310`,
   `test_runner_reuses_the_kinematic_aeb_and_result_builders`).
9. Regression không bao giờ ghép kết quả động học với CARLA
   (`test_regression_never_pairs_kinematic_with_carla`); JSON tải từ web chạy lại ra đúng
   kết quả đã lưu (`test_exported_bundle_reproduces_the_stored_run`).
10. Meomeo Agent (trợ lý dự án, ADR-029) chỉ đọc qua 9 công cụ trong `agent_tools.TOOLS`: không ghi
    bảng nào ngoài `knowledge_chunks` (`test_assistant_never_writes_project_data`); không lộ dữ liệu
    người dùng, không làm theo câu lệnh cài trong dữ liệu
    (`test_tool_output_never_carries_user_data_or_injected_commands`,
    `test_injection_and_secret_requests_are_blocked_before_any_llm_call`); không đọc AGENTS.md /
    CLAUDE.md, từ điển dữ liệu hay file ngoài danh sách trắng (`test_only_whitelisted_docs_are_indexed`). Thêm công
    cụ mới thì phải chỉ đọc, kết quả qua `guardrails.clean`, và thêm vào test chỉ-đọc ở trên.

## Luật mềm — chưa có máy kiểm, reviewer phải canh

- Không ghi "AI đã sửa xe" hay ngụ ý chứng nhận an toàn. Khuyến nghị luôn cần kỹ sư.
- Màn/chỉ số chưa có dữ liệu thật thì để mờ kèm lý do, trả `NOT_RUN` — không vẽ
  tick xanh giả (Robustness, Pareto, Sensitivity, Chase cam/RGB/LiDAR).
- Tham số kịch bản và tham số AEB không đổi cùng lúc trong một lần so sánh.
- Đổi `aeb_stack.py` hoặc `simulator.py` mà kết quả động học đổi thì phải đổi tên bộ mô
  phỏng (`KINEMATIC_SIMULATOR` trong `bundle.py`) để run cũ không bị ghép với run mới.
- Số đo từ CARLA chưa hiệu chuẩn phanh (TD-17): dùng để quan sát/đối chiếu, không ghi
  làm bằng chứng regression trong báo cáo.
- Trigger kịch bản là tương đối (khoảng cách/TTC), không dùng thời gian tuyệt đối.
- Đổi schema MySQL: sửa `database/mysql/01_schema.sql`, `src/services/vehicsim/tables.py` (nếu
  code dùng bảng đó), [database-schema.md](docs/vehicsim/database-schema.md) **và** thêm file
  đánh số vào `database/mysql/migrations/` cho DB đang chạy — cùng một PR. Không
  `docker compose down -v` trên máy người khác.
- Giao diện tiếng Việt, DB/API tiếng Anh: câu backend được dịch ở tầng hiển thị trong
  `frontend/src/components/vehicsimI18n.ts` — đổi câu chữ backend thì sửa mẫu ở đó (TD-08).
- Trang nằm thẳng trong `frontend/src/app/` và tự vào khung `VehicSimShell` (cần đăng nhập);
  trang không cần đăng nhập thì thêm vào `STANDALONE_PATHS`
  (`frontend/src/components/AppLayoutWrapper.tsx`).
- `.env` không bao giờ vào git; `.env.example` chỉ chứa giá trị mẫu.

## Khi làm việc

- Đổi một quyết định đã Accepted → viết ADR mới, supersede ADR cũ (luật ở
  [docs/adr/README.md](docs/adr/README.md)).
- Việc nhiều bước → exec plan ở `docs/exec-plans/active/`; xong thì chuyển sang
  `completed/` kèm bằng chứng kiểm chứng.
- Thấy nợ mà không sửa trong PR này → thêm một dòng vào
  [tech-debt-tracker](docs/exec-plans/tech-debt-tracker.md).
- Owner, deadline, tiến độ theo ngày → GitHub Issues/Project, không ghi vào docs.
