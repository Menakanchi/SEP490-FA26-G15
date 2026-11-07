# 05/11/2026 — Bỏ gán cứng CP_CROSSING, mở nhóm xe phía trước CCRs / CCRm / CCRb

**Trạng thái:** xong bước 0, 1, 2 — merge vào `main` 07/11/2026 (commit `126e0ec`). Bước 3 (CPLA, TURNING, CUT_IN) và playback vẽ xe mục tiêu
chuyển sang TD-42. Quyết định ở [ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md) (Accepted 07/11/2026).

## Vì sao

Câu mô tả tự nhiên viết được đủ loại tình huống, nhưng mọi tầng đều gán cứng người đi bộ băng ngang (TD-42): câu không có người đi
bộ bị từ chối, 6/7 category trong schema không chạy được.

## Phạm vi và trạng thái

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 0. Khung chung, không đổi hành vi | `FamilyDefinition`; category lấy từ họ; `ScenarioRules.SIMULATED` + `GET /scenario-categories`; `AebStack.stepTarget`; `Bundle.RunSpec.leadCase` + `simulateKinematic` | Xong — parity giữ nguyên |
| 1. CCRs / CCRm / CCRb trên bộ động học | `LeadVehicleCase`, `LeadVehicleSimulator`, `LeadFamilySpec`, chấm điểm, `DescribeService` nhận diện category, form + trang mô tả | Xong |
| 2. `.xosc` + CARLA cho CCR | `XoscExport.exportLead`, `vehicsim_lead_control.py`, `CarlaSession` cho xe mục tiêu, cầu nối `target_*` | Xong — xem mục CARLA thật |
| 3. CPLA, TURNING, CUT_IN | Quỹ đạo ngang / giao lộ | Chưa |
| Playback vẽ xe mục tiêu | API `scene.target_kind` đã có; màn vẽ xe chờ nhánh thiết kế lại phân tích (`chuvv`) merge | Chưa — thành viên 3 |

## Điểm nối với các thành viên (thông báo sau khi merge)

- **Thành viên 1 (kịch bản):** hợp đồng IR mới (`category`, trục CCR trong `FamilyRequest`), prompt / schema LLM, luật nhận diện.
- **Thành viên 2 (chạy, `.xosc`, CARLA):** `AebStack.stepTarget`; hai dòng `requireCrossing` trong `XoscExport` / `CarlaSession`;
  `RunService` chặn CARLA cho CCR. Nhánh `PhuongNA` cũng sửa `XoscExport` (Javadoc) — xung đột nhỏ khi merge.
- **Thành viên 3 (phân tích):** định nghĩa phanh oan CCR (xe ở làn bên, overlap ≤ 0), `target_entered_path`,
  `relative_impact_speed_mps`, khóa mới trong `environment` / `scene` của `AnalysisViewService`.

## Kiểm chứng

- `./mvnw -B clean test`: toàn bộ xanh, gồm `LeadVehicleSimulatorTest` (10), `ScenarioCategoryTest` (6) mới và các test parity cũ
  (`KinematicParityTest`, `KinematicParityFullTest`, `BundleParityTest`, `XoscExportTest`) không đổi.
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npx next build` sạch.
- CARLA 0.9.16 thật (Town04, ScenarioRunner v0.9.16, `worker/run_xosc.py`, 05/11/2026), xe Audi e-tron, AEB mặc định, seed 48846, so với bộ động học
  cùng ca (`BridgeMain kinematic`):

  | Ca | Bộ động học | CARLA |
  |---|---|---|
  | CCRs 40 km/h, xe đứng yên cách 40 m | EGO_STOPPED, cách 4,0 m | EGO_STOPPED, cách 2,97 m; AEB ở TTC 1,44 s |
  | CCRm 50 / 20 km/h, cách 30 m | EGO_STOPPED, cách 4,0 m | EGO_STOPPED, cách 1,57 m |
  | CCRb 50 / 50 km/h, cách 12 m, phanh −6 m/s² | COLLISION 30,6 km/h | COLLISION 39,1 km/h; xe trước phanh từ 1,06 s đúng −6 m/s² |

  Cùng hướng ở cả ba ca; CARLA dừng gần hơn / va mạnh hơn vì phanh chỉ đạt ~4,7 m/s² (TD-17) — chỉ để quan sát, không làm bằng chứng.
  Xe mục tiêu thật là `vehicle.toyota.prius` 4,51 × 2,01 m, khoảng cách ban đầu đo được 39,89 / 29,91 / 11,93 m.
  Lần chạy đầu lộ hai lỗi đã sửa: `BasicControl.reset()` của ScenarioRunner ném lỗi nếu lớp con gọi `super()`; khung đầu CARLA xe còn đứng yên
  nên sự kiện "xe trước phanh" và tốc độ đầu phải lấy theo đỉnh vận tốc / kịch bản.
- Chưa chạy app thật với DB / trình duyệt cho luồng CCR; chưa đối chiếu Figma (form chỉ thêm trường theo mẫu có sẵn).
