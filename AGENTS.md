# AGENTS.md — bản đồ cho agent và người mới vào repo

File này là **bản đồ**, không phải cẩm nang: mỗi mục chỉ nói *ở đâu* và *luật
nào không được phá*. Chi tiết nằm ở các link. Thứ gì không có trong repo thì
agent coi như không tồn tại — quyết định, bài học, nợ kỹ thuật phải được viết vào
`docs/`, không để trong chat hay Google Docs. `RepoDocsTest` (Java) giữ file
này ngắn và giữ mọi link còn sống.

## Repo này là gì

VehicSim / VSOS (SEP490-FA26-G15): nền tảng mô phỏng và tối ưu AEB/FCW — Spring Boot (Java 21) + Next.js +
lớp LLM + một database MySQL; **mô phỏng và chấm điểm chạy ở `worker/` Python** qua bundle JSON
([ADR-039](docs/adr/ADR-039-backend-java-mo-phong-o-worker-python.md)). Backend FastAPI cũ nằm ở
`src_python_backup/` (gitignore, chỉ để đối chiếu). Scenario Forge, dự án gốc mà repo dựng lên từ đó, đã gỡ ngày 04/10
([ADR-032](docs/adr/ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)); chỉ giữ bộ sinh OpenSCENARIO.

| Phần | Làm gì | Code chính | Lưu trữ | Đọc trước |
|---|---|---|---|---|
| VehicSim MVP (nhánh `trungdam`, 09/2026) | Vòng AEB 6 bước: mô tả → biến thể → baseline → lỗi → candidate → regression → Reviewer quyết định; mô phỏng bằng bộ động học hoặc CARLA sau một hợp đồng JSON | `src/main/java/com/vehicsim/vehicsim/` (route + nghiệp vụ), `worker/vehicsim_core/` (AEB, bộ động học, luật chấm), `worker/{run_variant,kinematic_sim,sim_common}.py`, `frontend/src/app/{page.tsx,scenarios,aeb,analysis,validation}`, `frontend/src/components/VehicSim*` | MySQL 29 bảng + Redis | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md) |
| Xác thực | Đăng ký/quên mật khẩu bằng mã 6 số, JWT, hồ sơ | `src/main/java/com/vehicsim/{service,controller,security,config}/`, `frontend/src/app/{login,register,forgot-password,profile}` | MySQL `users/roles` (mỗi người một role) + Redis (OTP) | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md#xác-thực) |
| OpenSCENARIO + CARLA local | IR/bundle → `.xosc` CP_CROSSING tất định → ScenarioRunner 0.9.16 + AEB dùng chung; chạy và xem sensor trên web | `worker/{openscenario_export,run_xosc,vehicsim_aeb_control}.py`, `frontend/src/app/analysis/carla/` | Artifact theo run | [CARLA local](docs/vehicsim/carla-local.md) |

Việc đã làm cho VehicSim MVP, theo thứ tự và kèm bằng chứng:
[vòng MVP](docs/exec-plans/completed/2026-09-30-vehicsim-mvp-loop.md),
[JSON → CARLA](docs/exec-plans/completed/2026-10-01-carla-variant-runner.md),
[Trợ lý dự án — đã gỡ 06/10](docs/exec-plans/completed/2026-10-02-project-assistant.md),
[database phủ đủ chức năng](docs/exec-plans/completed/2026-10-03-database-phu-du-chuc-nang.md),
[gỡ Scenario Forge](docs/exec-plans/completed/2026-10-04-go-scenario-forge.md),
[cấu hình xe để so sánh](docs/exec-plans/completed/2026-10-04-cau-hinh-xe.md),
[role theo workspace](docs/exec-plans/completed/2026-10-05-role-theo-workspace.md),
[5 role hệ thống, bỏ cấu hình xe và Meomeo](docs/exec-plans/completed/2026-10-06-nam-role-he-thong.md),
[schema 29 bảng](docs/exec-plans/completed/2026-10-07-schema-29-bang.md),
[bỏ phiên bản xe, Admin tạo workspace](docs/exec-plans/completed/2026-10-07-bo-phien-ban-xe.md),
[rút scope: 4 tham số AEB, 3 mục tiêu MOBO, 7 category](docs/exec-plans/completed/2026-10-15-rut-scope-4-tham-so-aeb.md),
[rà soát mã nguồn và vá bảo mật / công cụ](docs/exec-plans/completed/2026-10-15-ra-soat-ma-nguon.md).

## Chạy và tự kiểm chứng

| Việc | Lệnh |
|---|---|
| Bật toàn bộ app (Windows) | `scripts\dev-up.cmd` — Docker + Java `:8001` + frontend `:3000`; dùng `.xosc`/CARLA: `scripts\setup-carla.ps1` rồi `scripts\dev-carla.ps1 -RestartBackend` |
| Chỉ backend | `./mvnw spring-boot:run` (đọc `.env` ở thư mục gốc); Swagger: `http://localhost:8001/swagger-ui.html` |
| Tạo admin | `python scripts/create_admin.py --email <email> --seed` (đăng ký qua API rồi đổi role bằng SQL; cần backend đang chạy) |
| Seed project VehicSim | ADMIN gọi `POST /api/v1/vehicsim/bootstrap` (idempotent) |
| Gate backend | `./mvnw clean test` · lõi mô phỏng: `python -m pytest worker/tests` · cả ba cổng (+ frontend): `make check`, giống `.github/workflows/ci.yml` |
| Gate frontend (**chưa có trong CI**, chạy tay) | `cd frontend && npm run lint && npx tsc --noEmit && npx next build` |
| Chạy artifact | `.xosc`: `worker\.venv-carla\Scripts\python worker/run_xosc.py <file>.xosc --camera`; bundle nội bộ: `python worker/kinematic_sim.py <file>.json` |

- Gặp `Unresolved compilation problem` / `ClassFormatError` khi chạy backend: IDE đã ghi `.class` hỏng vào `target/` —
  chạy `./mvnw clean` rồi build lại.
- Gọi LLM thật tốn tiền: test Java dùng máy chủ giả (`DescribeServiceTest`); đừng thêm test gọi provider thật.
- Mô phỏng chạy ở thread pool của backend (`VEHICSIM_RUN_MODE=inline` để chạy ngay trong request khi thử), mỗi run là một
  tiến trình `worker/kinematic_sim.py`; máy phải có Python ≥ 3.10 (`VEHICSIM_WORKER_PYTHON`).
- Đồ thị code (graphify, tuỳ chọn, chỉ nằm trên máy dựng nó vì `graphify-out/` bị gitignore):
  `graphify update .` dựng lại (AST, không tốn token), `graphify query "<câu hỏi>"` thay cho
  đọc nhiều file. Không có đồ thị thì cứ đọc code như bình thường.
- Sửa UI thì phải nhìn UI: chạy app, đăng nhập, chụp màn hình bằng trình duyệt
  headless và so với Figma trước khi báo xong (cách làm ở exec plan §Kiểm chứng).

## Bản đồ tài liệu

| Cần biết | Đọc |
|---|---|
| Kiến trúc VehicSim: module, luồng dữ liệu, API, bất biến ↔ test | [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md) |
| Vì sao chọn X thay vì Y | [docs/adr/README.md](docs/adr/README.md) — VehicSim: ADR-023 → ADR-040; ADR-001 → 022 là lịch sử Forge |
| Đã làm gì, quyết định lúc nào, kiểm chứng ra sao | [docs/exec-plans/completed/](docs/exec-plans/completed/2026-09-30-vehicsim-mvp-loop.md) |
| Còn thiếu gì, nợ gì | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| Schema MySQL (nguồn sự thật của DB VehicSim) | [database/mysql/01_schema.sql](database/mysql/01_schema.sql) |
| Từng bảng/cột nghĩa là gì, ai ghi, dữ liệu JSON, lệch đã biết | [docs/vehicsim/database-schema.md](docs/vehicsim/database-schema.md) |
| Làm FE-13 (tối ưu, dò ranh giới lỗi, active learning) — bắt đầu từ đâu | [docs/vehicsim/fe13-y-tuong-tu-forge.md](docs/vehicsim/fe13-y-tuong-tu-forge.md) |
| Bẫy khi chạy CARLA / ScenarioRunner thật | [CLAUDE.md](CLAUDE.md) |
| Quy ước Next.js 16 của frontend (khác bản cũ) | [frontend/AGENTS.md](frontend/AGENTS.md) |

## Luật cứng — có máy kiểm, phá là test/CI đỏ

> **Sau ADR-039 (14/10) và TD-33 (15/10):** luật 1, 2, 3, 5, 7 có test Java (`src/test/java`, không cần MySQL/Redis nên chạy
> trong CI); luật 4, 6, 8 có test ở `worker/tests/`. Còn thiếu máy kiểm Java: phần "ghép kết quả động học với CARLA" của luật 9
> (bộ sinh `.xosc` offline đã có `test_xosc_export_is_offline_stdlib_only_and_python310`). Bảng đầy đủ: [architecture.md](docs/vehicsim/architecture.md#bất-biến-và-máy-kiểm).

1. Mọi lời gọi LLM đi qua `LlmService`; không file Java nào khác nhắc tới provider
   (`ArchitectureRulesTest#onlyLlmServiceKnowsTheLlmProviders`); bộ sinh `.xosc` không gọi LLM (`test_xosc_export_is_offline_stdlib_only_and_python310`).
2. Backend Java và `worker/vehicsim_core/` không import `carla` (`ArchitectureRulesTest#javaBackendNeverTouchesCarlaApi`,
   `ArchitectureRulesTest#simulationCoreNeverImportsCarla`); CARLA chỉ ở worker (runner, controller adapter, sensor).
3. Mọi route `/api/v1/vehicsim/*` cần đăng nhập; mỗi người một role (ADR-035): ADMIN / ENGINEER /
   EXPERIENCER được ghi, MANAGER chỉ đọc, **chỉ REVIEWER** Accept / Reject — người làm không tự duyệt
   (`VehicSimSecurityTest#everyVehicsimRouteRequiresLogin`, `VehicSimSecurityTest#everyRoleCanReadButOnlyWriteRolesCanWrite`,
   `VehicSimSecurityTest#onlyReviewerCanAcceptOrReject`). Lọc project theo workspace chưa làm — TD-30.
4. Cùng biến thể + cùng seed ⇒ cùng kết quả mô phỏng (`test_same_seed_gives_identical_run`); candidate luôn chạy lại **đúng
   seed** của run baseline (chưa có test Java — TD-33).
5. Không bao giờ tự Accept: test FAILED không Accept được, quyết định cần lý do +
   xác nhận, baseline đã đổi thì không Accept test cũ (`RegressionDecisionTest`; bảng bất biến đầy đủ ở
   [docs/vehicsim/architecture.md](docs/vehicsim/architecture.md#bất-biến-và-máy-kiểm)).
6. 4 tham số AEB chỉnh được (ADR-040): seed Java khớp seed SQL và mỗi mã là một trường của `AebParams`
   (`test_java_parameter_seed_matches_sql_seed`, `test_every_seeded_parameter_is_used_by_the_simulator`); sáu tham số
   còn lại là hằng số trong `aeb_stack.py`, không nằm ở DB.
7. Không lộ email có tồn tại hay không; mã OTP lưu dạng hash, dùng một lần
   (`AuthPrivacyTest`).
8. Một AEB cho mọi bộ mô phỏng: logic AEB chỉ ở `worker/vehicsim_core/aeb_stack.py`; lõi
   mô phỏng chỉ dùng thư viện chuẩn + cú pháp 3.10 để venv CARLA import được
   (`test_sim_core_is_stdlib_only_and_python310`,
   `test_runner_reuses_the_kinematic_aeb_and_result_builders`).
9. Regression không bao giờ ghép kết quả động học với CARLA (chưa có test Java — TD-33); JSON tải từ web chạy lại ra đúng
   kết quả (`test_bundle_round_trip_reproduces_the_same_run`; riêng run cũ của v1.3 không còn tái lập — TD-40).

## Luật mềm — chưa có máy kiểm, reviewer phải canh

- Không ghi "AI đã sửa xe" hay ngụ ý chứng nhận an toàn. Khuyến nghị luôn cần Reviewer quyết định.
- Màn/chỉ số chưa có dữ liệu thật thì để mờ kèm lý do, trả `NOT_RUN` — không vẽ
  tick xanh giả (Robustness, Pareto, Sensitivity, Chase cam/RGB/LiDAR).
- Tham số kịch bản và tham số AEB không đổi cùng lúc trong một lần so sánh.
- Đổi `aeb_stack.py` hoặc `simulator.py` mà kết quả động học đổi thì phải đổi tên bộ mô
  phỏng (`KINEMATIC_SIMULATOR` trong `bundle.py`) để run cũ không bị ghép với run mới.
- Số đo từ CARLA chưa hiệu chuẩn phanh (TD-17): dùng để quan sát/đối chiếu, không ghi
  làm bằng chứng regression trong báo cáo.
- Trigger kịch bản là tương đối (khoảng cách/TTC), không dùng thời gian tuyệt đối.
- Đổi schema MySQL: sửa `database/mysql/01_schema.sql`, câu SQL trong `Queries` / service (nếu
  code dùng cột đó), [database-schema.md](docs/vehicsim/database-schema.md) **và** thêm file
  đánh số vào `database/mysql/migrations/` cho DB đang chạy — cùng một PR. Không
  `docker compose down -v` trên máy người khác.
- Giao diện tiếng Việt, DB/API tiếng Anh: câu backend được dịch ở tầng hiển thị trong
  `frontend/src/components/vehicsimI18n.ts` — đổi câu chữ backend thì sửa mẫu ở đó (TD-08).
- Trang nằm thẳng trong `frontend/src/app/` và tự vào khung `VehicSimShell` (cần đăng nhập);
  trang không cần đăng nhập thì thêm vào `STANDALONE_PATHS`
  (`frontend/src/components/AppLayoutWrapper.tsx`).
- `.env` không bao giờ vào git; `.env.example` chỉ chứa giá trị mẫu.
- App mở đăng ký công khai và mọi người tự đăng ký đều ghi được vào project chung (TD-30): mọi thao tác tốn tài nguyên (tạo họ, candidate,
  regression, chạy) phải qua hạn mức theo người dùng (`VehicSimController.limitWrites`, `RunService.checkActiveRunQuota`). CORS chỉ cho
  origin trong `CORS_ORIGINS` (không `*`); Swagger tắt ở `APP_ENV=production`; mật khẩu tối đa 72 byte (BCrypt).

## Khi làm việc

- Đổi một quyết định đã Accepted → viết ADR mới, supersede ADR cũ (luật ở
  [docs/adr/README.md](docs/adr/README.md)).
- Việc nhiều bước → exec plan ở `docs/exec-plans/active/`; xong thì chuyển sang
  `completed/` kèm bằng chứng kiểm chứng.
- Thấy nợ mà không sửa trong PR này → thêm một dòng vào
  [tech-debt-tracker](docs/exec-plans/tech-debt-tracker.md).
- Owner, deadline, tiến độ theo ngày → GitHub Issues/Project, không ghi vào docs.
