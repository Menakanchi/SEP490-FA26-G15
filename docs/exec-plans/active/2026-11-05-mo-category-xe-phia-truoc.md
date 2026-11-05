# 05/11/2026 — Bỏ gán cứng CP_CROSSING, mở nhóm xe phía trước CCRs / CCRm / CCRb

**Trạng thái:** bước 0 và bước 1 đã code trên nhánh `feature/scenario-categories` (chưa merge); bước 2–3 chưa làm. Quyết định ở
[ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md) (Proposed). Người làm, deadline theo GitHub Issues/Project.

## Vì sao

Câu mô tả tự nhiên viết được đủ loại tình huống, nhưng mọi tầng đều gán cứng người đi bộ băng ngang (TD-42): câu không có người đi
bộ bị từ chối, 6/7 category trong schema không chạy được.

## Phạm vi và trạng thái

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 0. Khung chung, không đổi hành vi | `FamilyDefinition`; category lấy từ họ; `ScenarioRules.SIMULATED` + `GET /scenario-categories`; `AebStack.stepTarget`; `Bundle.RunSpec.leadCase` + `simulateKinematic` | Xong — parity giữ nguyên |
| 1. CCRs / CCRm / CCRb trên bộ động học | `LeadVehicleCase`, `LeadVehicleSimulator`, `LeadFamilySpec`, chấm điểm, `DescribeService` nhận diện category, form + trang mô tả | Xong |
| 2. `.xosc` + CARLA cho CCR | Bộ xuất OpenSCENARIO và runner cho xe mục tiêu; tách identity simulator | Chưa — giao thành viên 2 |
| 3. CPLA, TURNING, CUT_IN | Quỹ đạo ngang / giao lộ | Chưa |
| Playback vẽ xe mục tiêu | API `scene.target_kind` đã có; màn vẽ xe chờ nhánh thiết kế lại phân tích (`chuvv`) merge | Chưa — thành viên 3 |

## Điểm nối với các thành viên (cần duyệt trước khi merge)

- **Thành viên 1 (kịch bản):** hợp đồng IR mới (`category`, trục CCR trong `FamilyRequest`), prompt / schema LLM, luật nhận diện.
- **Thành viên 2 (chạy, `.xosc`, CARLA):** `AebStack.stepTarget`; hai dòng `requireCrossing` trong `XoscExport` / `CarlaSession`;
  `RunService` chặn CARLA cho CCR. Nhánh `PhuongNA` cũng sửa `XoscExport` (Javadoc) — xung đột nhỏ khi merge.
- **Thành viên 3 (phân tích):** định nghĩa phanh oan CCR (xe ở làn bên, overlap ≤ 0), `target_entered_path`,
  `relative_impact_speed_mps`, khóa mới trong `environment` / `scene` của `AnalysisViewService`.

## Kiểm chứng

- `./mvnw -B clean test`: toàn bộ xanh, gồm `LeadVehicleSimulatorTest` (10), `ScenarioCategoryTest` (6) mới và các test parity cũ
  (`KinematicParityTest`, `KinematicParityFullTest`, `BundleParityTest`, `XoscExportTest`) không đổi.
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npx next build` sạch.
- Chưa chạy app thật với DB / trình duyệt cho luồng CCR; chưa đối chiếu Figma (form chỉ thêm trường theo mẫu có sẵn).
