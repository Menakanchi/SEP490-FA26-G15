# Quy tắc đặt tên code base VSOS

Trạng thái: **đã chốt và áp dụng** cho backend và lõi (nhóm đồng ý gốc `com.vsos`, 30/10/2026; TrungDQ thực hiện).
Ai pull code sau thay đổi này làm theo [hướng dẫn cập nhật](huong-dan-cap-nhat-sau-doi-ten-goi.md).
Theo yêu cầu của thầy trong buổi họp:
tên gói phải theo quy tắc `VSOS.Backend.Controllers.<tên gói>.<gói nhỏ hơn>`, tức là đi từ hệ thống → tầng → chức năng → phần nhỏ hơn.

Bảng ở mục 7 ghi gói cũ → gói mới để các thành viên đang có nhánh mở sửa lại import khi merge.
Bằng chứng và cách kiểm chứng: [exec plan 30/10](../exec-plans/completed/2026-10-30-doi-ten-goi-theo-quy-tac.md).

## 1. Gói Java (backend)

### 1.1 Cấu trúc

```
com.vsos.<module>.<tầng>.<chức năng>[.<gói nhỏ hơn>]
```

| Cấp | Giá trị | Ghi chú |
|---|---|---|
| Gốc | `com.vsos` | Java bắt buộc chữ thường và tên miền đảo ngược, nên `VSOS.Backend` viết thành `com.vsos.backend` |
| Module | `backend` (ứng dụng Spring), `core` (lõi AEB/mô phỏng, chỉ dùng JDK) | `core` không phụ thuộc Spring, giữ nguyên bất biến 8 trong [AGENTS.md](../../AGENTS.md) |
| Tầng | `controller`, `service`, `repository`, `entity`, `dto`, `exception`, `config`, `security`, `common` | Số ít, chữ thường (quy ước Spring) |
| Chức năng | xem bảng 1.2 | Một từ, chữ thường, số ít |

Ví dụ: thầy viết `VSOS.Backend.Controllers.Auth` thì trong Java là `com.vsos.backend.controller.auth`.

Quy tắc đi kèm:

- Mỗi class nằm đúng một tầng và đúng một chức năng. Không tạo gói trộn nhiều tầng như `com.vehicsim.vehicsim` hiện nay.
- Mã dùng cho nhiều chức năng đặt ở `<tầng>.common` (ví dụ `repository.common.Db`), không đặt ở chức năng đầu tiên dùng nó.
- `config` và `security` là tầng hạ tầng, không chia theo chức năng.
- Enum đặt chung ở `entity.enums` vì nhiều enum dùng cho nhiều bảng.
- Test nằm cùng tên gói với class được test, trong `src/test/java`.

### 1.2 Danh sách gói chức năng

Cột FE theo bảng §1.7 cũ. Bảng FE trong Report 7 đã đổi (có FE-15), nên cột này cần cập nhật khi nhóm chốt bảng FE mới.

| Gói | Phạm vi | FE (bảng cũ) |
|---|---|---|
| `auth` | Đăng nhập, đăng ký, OTP, quên / đổi mật khẩu | FE-01 |
| `user` | Quản lý người dùng, role, hồ sơ cá nhân | FE-02, FE-03 |
| `workspace` | Workspace, thành viên, task, báo cáo task | FE-04 |
| `notification` | Thông báo trong ứng dụng | FE-04 |
| `vehicle` | Danh mục mẫu xe CARLA, cảm biến | FE-05 |
| `scenario` | Mô tả → Scenario IR, họ kịch bản, phiên bản, biến thể, `.xosc` | FE-06, FE-07 |
| `simulation` | Chạy baseline, run, CARLA, telemetry, artifact | FE-08, FE-09 |
| `system` | Health, bootstrap, cấu hình hệ thống, audit | FE-10 |
| `aeb` | Phiên bản và tham số AEB | FE-11 |
| `analysis` | Phân tích lỗi, nguyên nhân, dataset | FE-12 |
| `optimization` | Tối ưu MOBO, trial, Pareto | FE-13 |
| `regression` | Regression test, khuyến nghị, quyết định Reviewer | FE-14 |

Thêm chức năng mới thì thêm một dòng vào bảng này trước khi tạo gói.

### 1.3 Gói con trong `core`

| Gói | Nội dung |
|---|---|
| `com.vsos.core.aeb` | `AebParams`, `AebStack`, `AebTick`, `RadarTracker`, `DecelMeter`, `Filters` |
| `com.vsos.core.simulation` | `Simulator`, `Frame`, `CrossingCase`, `CrossingFrame`, `SimulationOutcome`, `VehicleSpec`, `RecordedTelemetry`, `CarlaSession` |
| `com.vsos.core.evaluation` | `Evaluation`, `AnalysisMetrics` |
| `com.vsos.core.xosc` | `Xosc`, `XoscExport` |
| `com.vsos.core.bridge` | `BridgeMain`, `KinematicCli`, `Bundle` |
| `com.vsos.core.mobo` | Giữ nguyên nội dung hiện tại |
| `com.vsos.core.common` | `MiniJson`, `Py`, `PyRandom` |

## 2. Tên class, hàm, biến (Java)

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Controller | `<Chức năng>Controller` | `ScenarioController` |
| Service | `<Chức năng>Service`; service đọc cho màn hình: `<Chức năng>ViewService` | `RegressionService`, `RegressionViewService` |
| Repository | `<Entity>Repository` | `WorkspaceTaskRepository` |
| Entity | Danh từ số ít, PascalCase, khớp bảng số nhiều | `SimulationRun` ↔ `simulation_runs` |
| DTO | `<Hành động><Entity>Request`, `<Entity>Response`; nhóm record dùng chung một file: `<Chức năng>Dtos` | `CreateRegressionRequest`, `WorkspaceDtos` |
| Exception | `<Lý do>Exception` | `RegressionNotFoundException` |
| Enum | Tên số ít PascalCase, giá trị `UPPER_SNAKE_CASE` | `SimulationStatus.RUNNING` |
| Hằng số | `static final`, `UPPER_SNAKE_CASE` | `DEFAULT_FALSE_ACTIVATION_MAX_PTS` |
| Hàm | camelCase, bắt đầu bằng động từ | `createFamily`, `listRuns`, `findById` |
| Biến, tham số | camelCase, không viết tắt khó hiểu; đơn vị đưa vào tên khi là số vật lý | `egoSpeedKmh`, `ttcSeconds` |
| Test | `<Class>Test`; tên hàm test mô tả hành vi | `RunServiceTest.rejectsRunWhenQuotaExceeded` |

Tên hàm controller và service theo màn hình của thầy (một entity chính có 4 màn):

| Màn | HTTP | Hàm controller / service |
|---|---|---|
| `ListX` (gồm tìm, lọc, xóa) | `GET /xs`, `DELETE /xs/{xId}` | `listXs`, `deleteX` |
| `AddX` | `POST /xs` | `createX` |
| `EditX` | `PUT /xs/{xId}` | `updateX` |
| `ViewXDetail` | `GET /xs/{xId}` | `getX` |

## 3. API REST

- Tiền tố: `/api/v1/auth/...` cho xác thực, `/api/v1/vehicsim/...` cho nghiệp vụ (giữ nguyên để frontend không đổi).
- Tài nguyên là danh từ số nhiều, chữ thường, nối bằng `-`: `/workspaces/{workspaceId}/member-candidates`.
- Biến đường dẫn là camelCase và có hậu tố `Id`: `{scenarioId}`, `{runId}`.
- Hành động không phải CRUD là động từ ở cuối: `/runs/{runId}/cancel`, `/recommendations/{testId}/decision`.
- Khóa JSON là `snake_case`, khớp cột DB và kiểu dữ liệu frontend hiện có (dùng `@JsonProperty` khi tên Java khác).
- Ngoại lệ đang có, chưa sửa vì frontend đang gọi: `/regression` (số ít), `/families` (bảng là `scenarios`), `/failures.csv`.
  Endpoint mới không lặp lại các ngoại lệ này.

## 4. Database (MySQL)

Theo đúng [01_schema.sql](../../database/mysql/01_schema.sql) hiện tại:

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Bảng | `snake_case`, số nhiều | `simulation_runs` |
| Cột | `snake_case`; khóa chính `id`; khóa ngoại `<bảng số ít>_id` hoặc `<vai trò>_user_id` | `scenario_id`, `created_by_user_id` |
| Cột thời gian | `created_at`, `updated_at` (bảng cũ dùng `created_date` giữ nguyên) | |
| Unique | `uq_<bảng>_<cột>` | `uq_users_email` |
| Index | `idx_<bảng hoặc viết tắt>_<cột>` | `idx_users_role` |
| Khóa ngoại | `fk_<bảng hoặc viết tắt>_<tham chiếu>` | `fk_users_role` |
| Migration | `NNN_<mô_tả>.sql`, đánh số tăng dần | xem [migrations](../../database/mysql/migrations/) |

## 5. Frontend (Next.js) và worker (Python)

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Route trang | Chữ thường, số nhiều, `-`; `new` cho Add, `[xId]` cho View, `[xId]/edit` cho Edit | `/scenarios`, `/scenarios/new`, `/scenarios/[scenarioId]/edit` |
| Component trang | Tên màn của thầy + `Page` | `ListScenarioPage`, `ViewScenarioDetailPage` |
| Component | PascalCase `.tsx`, gom theo chức năng trong `components/<chức năng>/` | `components/auth/OtpCodeField.tsx` |
| Hook | `use<Tên>` | `useScenarioList` |
| Service, type, tiện ích | camelCase `.ts`, theo chức năng | `services/vehicsim.ts`, `types/auth.ts` |
| Python module, hàm, biến | `snake_case`; class PascalCase; hằng `UPPER_SNAKE_CASE` | `sensor_recorder.py` |
| Python test | `worker/tests/test_<module>.py` | `test_run_xosc.py` |

Các component đang nằm phẳng trong `components/` được chuyển dần vào thư mục chức năng khi sửa tới.

Git: nhánh `feature/<chức năng>-<mô tả ngắn>` hoặc nhánh cá nhân đang dùng. Commit theo dạng
`<loại>(<phạm vi>): <mô tả>` với loại là `feat`, `fix`, `docs`, `chore`, `test` hoặc `refactor`, như lịch sử hiện tại.

## 6. Lộ trình chuyển đổi

Bước 1–4 đã xong ngày 30/10/2026 (không đổi logic, không đổi URL API). Còn lại bước 5.

1. Nhóm chốt tài liệu này (gốc `com.vsos`, danh sách gói 1.2).
2. Đổi gốc `com.vehicsim` → `com.vsos.backend` và `com.vehicsim.core` → `com.vsos.core`. Phải sửa cùng lúc:
   `pom.xml`, `Dockerfile`, `scripts/CreateAdmin.java`, `scripts/IntegrationSmoke.java`, các file worker gọi lớp cầu nối
   (`bridge.py`, `run_xosc.py`, `sensor_recorder.py`, `vehicsim_aeb_control.py`, `tests/test_bridge.py`),
   `frontend/src/types/vehicsim.ts`, `ArchitectureRulesTest`, `CoreIsolationTest` và tên gói trong tài liệu
   (`git grep "com\.vehicsim"` để soát lại).
3. Tách gói `vehicsim` theo bảng 7, rồi tách `VehicSimController` theo chức năng (giữ nguyên URL).
4. Chia các tầng còn lại theo chức năng (bảng 7).
5. Frontend: gom component theo chức năng khi sửa tới; không đổi URL trang đang dùng trong báo cáo.

Nhánh đang mở của thành viên khác khi merge sẽ xung đột ở dòng `package`/`import`: tra bảng 7 để đổi import,
không cần đổi logic. Riêng code gọi `VehicSimController`/`ViewsService` chuyển sang controller hoặc `*ViewService` theo chức năng.

## 7. Bảng chuyển đổi gói backend (cũ → mới)

Gốc `com.vehicsim` → `com.vsos.backend` (viết tắt dưới đây là `b.`).

| Cũ (`com.vehicsim.*`) | Mới |
|---|---|
| `VehicSimApplication` | `b.VsosApplication` |
| `audit.AuditLog` | `b.common.audit.AuditLog` |
| `config.*` | `b.config.*` |
| `vehicsim.VehicSimConfig`, `vehicsim.VehicSimProperties` | `b.config.*` |
| `security.*` | `b.security.*` |
| `vehicsim.VehicSimAccess` | `b.security.VehicSimAccess` |
| `controller.AuthController` | `b.controller.auth.AuthController` |
| `controller.HealthController` | `b.controller.system.HealthController` |
| `controller.NotificationController` | `b.controller.notification.NotificationController` |
| `controller.RegressionController` | `b.controller.regression.RegressionController` |
| `controller.WorkspaceController` | `b.controller.workspace.WorkspaceController` |
| `vehicsim.VehicleController` | `b.controller.vehicle.VehicleController` |
| `vehicsim.VehicSimController` | Tách: `b.controller.scenario.ScenarioController` (`/families`, `/scenarios/*`), `b.controller.simulation.SimulationController` (`/runs`, `/carla`, `/telemetry`), `b.controller.analysis.AnalysisController` (`/failures`, `/analysis`), `b.controller.aeb.AebController`, `b.controller.optimization.OptimizationController`, `b.controller.system.SystemController` (`/bootstrap`, `/context`) |
| `service.AuthService`, `OtpService`, `RegistrationMode` | `b.service.auth.*` |
| `service.MailService` | `b.service.common.MailService` |
| `service.NotificationService` | `b.service.notification.*` |
| `service.Regression*`, `ReviewDecisionService` | `b.service.regression.*` |
| `service.Workspace*` | `b.service.workspace.*` |
| `vehicsim.AebService` | `b.service.aeb.AebService` |
| `vehicsim.AnalysisService` | `b.service.analysis.AnalysisService` |
| `vehicsim.ViewsService` | Tách: `b.service.system.SystemViewService` (`context`), `b.service.scenario.ScenarioViewService` (họ, bản, biến thể), `b.service.aeb.AebViewService` (AEB versions), `b.service.analysis.AnalysisViewService` (ca lỗi, chi tiết, phát lại, tập baseline), `b.service.simulation.SimulationViewService` (bundle của run) |
| `VehicSimController.csvCell` | `b.common.Csv.cell` |
| `vehicsim.BootstrapService` | `b.service.system.BootstrapService` |
| `vehicsim.DescribeService`, `FamilyService`, `ScenarioRules` | `b.service.scenario.*` |
| `vehicsim.LlmService` | `b.service.common.LlmService` (vẫn là cửa duy nhất gọi LLM) |
| `vehicsim.OptimizationService` | `b.service.optimization.*` |
| `vehicsim.RunService`, `TelemetryMetricsService` | `b.service.simulation.*` |
| `vehicsim.VehicleCatalogService` | `b.service.vehicle.*` |
| `vehicsim.Vs` | `b.common.Vs` |
| `vehicsim.Json` | `b.common.Json` |
| `vehicsim.Db`, `Row`, `Queries` | `b.repository.common.*` |
| `repository.RoleRepository`, `UserRepository` | `b.repository.user.*` |
| `repository.Workspace*Repository` | `b.repository.workspace.*` |
| `repository.NotificationRepository` | `b.repository.notification.*` |
| `repository.RegressionRepository` | `b.repository.regression.*` |
| `entity.*` (30 entity) | `b.entity.<chức năng>.*` theo bảng 1.2; enum giữ ở `b.entity.enums` |
| `dto.auth.*` | `b.dto.auth.*` |
| `dto.NotificationDtos` | `b.dto.notification.*` |
| `dto.Regression*` | `b.dto.regression.*` |
| `dto.WorkspaceDtos` | `b.dto.workspace.*` |
| `exception.ApiExceptionHandler` | `b.exception.ApiExceptionHandler` |
| `exception.RegressionExceptions` | `b.exception.regression.*` |
