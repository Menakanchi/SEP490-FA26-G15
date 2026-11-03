# 30/10/2026 — Đổi tên gói theo quy tắc đặt tên

Theo yêu cầu của thầy (họp 30/10): gói đi từ hệ thống → tầng → chức năng. Quy tắc và bảng cũ → mới ở
[quy-tac-dat-ten.md](../../vehicsim/quy-tac-dat-ten.md). **Không đổi hành vi**: URL API, JSON, DB, định danh run/xosc giữ nguyên.

## Đã làm

- Gốc `com.vehicsim` → `com.vsos.backend` (ứng dụng Spring, lớp chạy đổi tên `VsosApplication`) và `com.vsos.core` (lõi chỉ dùng JDK).
- Backend chia `<tầng>/<chức năng>`: `controller`, `service`, `repository`, `entity`, `dto`, `exception` theo
  `auth`, `user`, `workspace`, `notification`, `vehicle`, `scenario`, `simulation`, `analysis`, `aeb`, `optimization`, `regression`, `system`;
  `config`, `security`, `common` dùng chung. Enum giữ ở `entity/enums`.
- Lõi chia `aeb`, `simulation`, `evaluation`, `xosc`, `bridge`, `mobo`, `common`.
- `VehicSimController` tách thành `ScenarioController`, `SimulationController`, `AnalysisController`, `AebController`,
  `OptimizationController`, `SystemController` (cùng URL, cùng luật quyền qua `VehicSimAccess`).
- `ViewsService` tách thành `SystemViewService`, `ScenarioViewService`, `AebViewService`, `AnalysisViewService`, `SimulationViewService`;
  `csvCell` chuyển thành `common/Csv.cell` (dùng chung cho failures.csv và gói xuất regression).
- Test chuyển theo gói của class được test. Vài thành viên trước là package-private phải mở `public` vì nằm khác gói sau khi tách:
  `RunService.carlaSimulator`, `AebStack.lagFrames` / `perceptionEvery`, `CarlaSession.fullBrakeDecel`; test trợ giúp
  `PyCompatTest.fixture`, `KinematicParityTest.compare` / `checkCase`.
- Ngoài Java: `worker/bridge.py` (`MAIN_CLASS`, `CORE_PACKAGE`), `worker/tests/test_bridge.py`, `scripts/dev-carla.ps1`,
  `scripts/CreateAdmin.java`, `scripts/IntegrationSmoke.java`, `pom.xml` (`groupId`), `Dockerfile`, tài liệu sống và link.
  ADR và exec plan đã hoàn tất giữ tên cũ trong văn bản (là lịch sử); chỉ sửa link cho khỏi chết.
- Không đổi: chuỗi định danh `vehicsim.xosc/v4`, `carla-0.9.16-xosc4`, `vsos-core-java/1`, `vsos-bridge/1`, metadata `vs_*`,
  prefix cấu hình `vehicsim.*` và biến môi trường `VEHICSIM_*`.

## Kiểm chứng

- `.\mvnw.cmd -B clean test`: xanh (405 test, 1 bỏ qua như trước), gồm `RepoDocsTest`, `CoreIsolationTest` (lõi không import `com.vsos.backend`),
  `ArchitectureRulesTest`, các `*SecurityTest` với 6 controller mới.
- `python -m ruff check worker`: sạch. `python -m pytest worker/tests -q`: 57 passed, gồm test cầu nối chạy lõi Java thật ở `com/vsos/core`.

## Còn lại

- Chưa chạy một run CARLA thật sau khi đổi tên lớp cầu nối (CLAUDE.md yêu cầu với thay đổi chạm CARLA). Cần chạy
  `scripts\dev-carla.ps1 -RestartBackend` rồi một họ nhỏ trên **Phân tích → Dữ liệu CARLA** trước khi merge.
- Nhóm đã đồng ý gốc `com.vsos` (30/10). Thành viên pull về làm theo
  [hướng dẫn cập nhật](../../vehicsim/huong-dan-cap-nhat-sau-doi-ten-goi.md) (tra mục 7 để đổi import);
  thông báo đặt ở đầu `AGENTS.md`, `CLAUDE.md`, `README.md`.
- Frontend chưa gom component theo chức năng (bước 5 của lộ trình).
