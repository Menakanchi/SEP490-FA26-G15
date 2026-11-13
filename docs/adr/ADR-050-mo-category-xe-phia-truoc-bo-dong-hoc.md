# ADR-050 — Bỏ gán cứng CP_CROSSING; mở nhóm xe phía trước CCRs / CCRm / CCRb trên bộ động học và CARLA

**Trạng thái:** Accepted 07/11/2026 — chủ dự án chốt, không chờ duyệt riêng của thành viên 1, 2, 3 (Proposed 05/11/2026; merge vào `main` ở
commit `126e0ec`). Hợp đồng IR, phần mở rộng AEB và định nghĩa chỉ số CCR theo đúng mục Quyết định dưới đây; đổi ý thì viết ADR mới.
**Liên quan:** bổ sung [ADR-040](ADR-040-rut-scope-4-tham-so-aeb-7-category.md) (7 category, chỉ CP_CROSSING chạy được) và
[ADR-042](ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md) (một lõi AEB dùng chung); giải một phần TD-42, chốt tạm nghĩa TD-41.

## Bối cảnh

Schema có 7 category Euro NCAP nhưng code gán cứng người đi bộ băng ngang ở mọi tầng: `FamilyService.CATEGORY`, prompt và luật của
`DescribeService` ("MVP chỉ có MỘT motif"; câu không có người đi bộ bị từ chối), `CrossingCase` + `Simulator`, TTC `gap / egoV` trong
`AebStack`, câu chấm của `Evaluation`, `XoscExport`, và cờ `supported` viết tay trong `ScenarioCategoryPicker`. Câu mô tả tự nhiên đa
dạng nhưng chỉ đổi được tham số của một tình huống.

## Quyết định

1. **Category đi xuyên suốt, không còn hằng số.** Họ kịch bản mang category từ định nghĩa (`FamilyService.FamilyDefinition`:
   `FamilySpec` cho CP_CROSSING, `LeadFamilySpec` cho CCRS/CCRM/CCRB). Một họ chỉ một category; bản mới khác category bị từ chối.
   `ScenarioRules.SIMULATED` / `CARLA_READY` là nguồn duy nhất cho "category nào chạy được ở đâu", lộ qua
   `GET /api/v1/vehicsim/scenario-categories`; frontend không gán cờ tay nữa.
2. **Mở rộng bằng cách thêm, không viết lại.** `CrossingCase`, `Simulator.simulate`, `AebStack.step` giữ nguyên chữ ký và kết quả.
   Thêm `LeadVehicleCase` + `LeadVehicleSimulator` (cùng bước 0,05 s, cùng `MotionStats`, `makeFrame`, `brakePhaseMetrics`) và
   `AebStack.stepTarget(…, targetVx, targetHalfWidth)`: TTC = gap / (egoV − targetVx), mục tiêu "trong đường đi" khi
   `|y| − nửa bề ngang mục tiêu` lọt hành lang. `step` gọi `stepTarget(…, 0, 0)` nên phép tính người đi bộ trùng từng bit
   (`KinematicParityTest`, `KinematicParityFullTest`, `BundleParityTest` giữ nguyên). Vì kết quả cũ không đổi, `KINEMATIC_SIMULATOR`
   và `ENGINE` không đổi; regression vốn chỉ ghép trong cùng họ nên run CCR không bị ghép với run người đi bộ.
3. **Bundle mang category.** Biến thể CCR có khóa `category` + `target_speed_kmh`, `initial_distance_m`, `target_decel_mps2` (CCRB),
   `lateral_overlap_pct`; biến thể người đi bộ giữ đúng dạng cũ (không thêm khóa). `Bundle.RunSpec` thêm `leadCase` với constructor 8
   tham số cũ giữ nguyên; `Bundle.simulateKinematic` chọn "thế giới" theo category.
4. **CARLA cho nhóm CCR.** `XoscExport.exportLead` sinh `.xosc` (cùng `vehicsim.xosc/v4`, thêm `vs_category` và trường CCR) với xe mục tiêu
   `lead` (`vehicle.toyota.prius`) đặt trước ego trên Town04 road 40, lệch ngang theo độ chồng lấn. ScenarioRunner chỉ đặt được tốc độ đích
   (PID của xe quyết định mức giảm tốc), nên xe mục tiêu do controller `worker/vehicsim_lead_control.py` giữ đúng profile của bộ động học
   (chạy đều; CCRb giảm đều từ 1,0 s) — giống mục tiêu mềm do robot kéo ở Euro NCAP; controller này không chứa logic AEB.
   `CarlaSession` đọc vị trí / vận tốc actor `lead` qua cùng cầu nối (`open` trả `target.kind`, `init` nhận `target_size`), tính khoảng cách
   tới đuôi xe theo bounding box thật, dùng `AebStack.stepTarget` và `LeadVehicleSimulator.buildOutcome`; `case.carla.target` ghi blueprint,
   kích thước và khoảng cách ban đầu đo được. Bộ xuất từ chối ca mà xe mục tiêu chạy ra khỏi đoạn road 40 (228 m) trong 12 s;
   `RunService` kiểm trước khi xếp run CARLA. Chưa chạy bóng radar cho xe (bộ bám ADR-043 viết cho người đi bộ).
5. **Hình học và nghĩa của độ chồng lấn (TD-41, nghĩa của VehicSim).** Tim xe mục tiêu lệch `(100 − overlap)/100 × bề ngang ego`:
   100 thẳng hàng, 50 chồng nửa xe, 0 hai mép vừa chạm, −100 lệch hẳn một bề ngang (làn bên). Xe mục tiêu cố định 4,5 × 1,8 m;
   CCRb bắt đầu phanh sau 1,0 s. Nhãn tập thử tự suy: overlap > 0 → DANGEROUS, ≤ 0 → SAFE (ca đo phanh oan, thay cho "dừng ở lề").
6. **Chấm điểm.** `Evaluation` coi `target_entered_path` như `pedestrian_entered_path`; câu chấm dùng "Lead vehicle" cho nhóm CCR,
   câu cũ của người đi bộ giữ nguyên từng ký tự; phanh oan CCR = phanh cho xe nằm ngoài đường đi. Số đo thêm
   `relative_impact_speed_mps`; `impact_speed_mps` vẫn là tốc độ ego lúc va chạm để ba objective ADR-040 giữ một định nghĩa.
7. **Câu mô tả nhận diện category.** LLM trả `category` (schema mới); IR kiểu cũ chỉ có `is_pedestrian_crossing` vẫn được hiểu. Luật
   dự phòng nhận diện xe phía trước đứng yên / chạy chậm / phanh gấp, cắt làn, rẽ, đi dọc. Category chưa có bộ mô phỏng báo
   "Đã nhận diện là X — chưa có bộ mô phỏng" thay vì "không phải người đi bộ".

## Hệ quả

- Không đổi schema, không migration: `scenario_versions` đã có `target_speed_kmh`, `initial_distance_m`, `lateral_overlap_pct`,
  `target_decel_mps2` và CHECK phù hợp.
- Playback / bản đồ cảnh vẫn vẽ mục tiêu như người đi bộ; API `scene` đã có `target_kind`, kích thước mục tiêu để màn phân tích
  (thành viên 3, đang thiết kế lại ở nhánh `chuvv`) vẽ xe sau khi nhánh đó merge.
- Số CCR là của bộ động học (perception tổng hợp, chưa hiệu chuẩn phanh — TD-01, TD-17): dùng để so sánh tương đối như CP_CROSSING,
  không phải chứng nhận Euro NCAP.
- CPLA, TURNING, CUT_IN vẫn chỉ có trong schema (TD-42).
- `.xosc` người đi bộ không đổi từng byte (`XoscExportTest`, golden `cp-crossing.xosc`), identity `-xosc4` giữ nguyên.

## Kiểm chứng

`LeadVehicleSimulatorTest` (tất định, TTC theo tốc độ tiếp cận, va chạm khi kích hoạt muộn, xe làn bên không phanh, CCRb phanh, bundle
CCR khứ hồi, bundle người đi bộ giữ dạng cũ); `CarlaLeadVehicleTest` (`.xosc` CCR đọc lại đúng case, từ chối ca ra khỏi road 40,
`CarlaSession` với xe mục tiêu: CCRb ghi đúng kết quả / sự kiện, xe làn bên không phanh); `ScenarioCategoryTest` (lưới / luật `LeadFamilySpec`, danh
mục category, nhận diện category bằng luật, mô tả CCR không cần LLM). Toàn bộ test Java cũ, kể cả các test parity, giữ nguyên kết quả.
