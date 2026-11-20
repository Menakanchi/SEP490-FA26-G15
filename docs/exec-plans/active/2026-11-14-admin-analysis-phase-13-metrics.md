# Phase 13/20 — AEB metric standardization & data integrity

Nhánh `chuvv`, nền `8eab3c4`, working tree sạch; Phase 12 đã commit.
Chỉ chuẩn hóa presentation/mapping, không đổi core/backend/worker/schema/Admin.

## Bằng chứng và phạm vi

- AnalysisRunSummary: ba objective dùng 2 số lẻ, Overview dùng 3; số nhỏ thành 0.
- Detail/Run Explorer/Dataset/Failure Explorer chưa cùng guard impact theo trạng thái và collision.
- AnalysisSelectionSummary: chưa kiểm status/unit của objective như Overview.
- Evidence gọi controller brake_onset là phanh có hiệu lực; playback gọi decision latch là đang phanh.
- CARLA CSV summary đổi impact null thành 0 và mô tả quãng phanh ngoại suy như đo tới dừng.
- Telemetry/Playback format rời rạc; phải giữ dấu acceleration/jerk và TTC null độc lập GT.
- Canonical frames chưa có brake ratio; không thêm helper/phần trăm hoặc metric giả để đủ test.

## Kế hoạch

1. Truy vết metric/core/API/UI/tests và lập inventory trong báo cáo hoàn tất.
2. Chụp baseline fixture, sửa tối thiểu formatter dùng thật, guards và nhãn nguồn.
3. Regression formatter/rendering với null/zero/invalid/tiny/units/sign/source/impact.
4. Lint, types, build, offline Java metrics, Analysis browser fixtures/responsive/focus.
5. Chuyển plan completed với inventory, ví dụ trước/sau, kết quả thật và giới hạn.

Không stage/commit/push, không chuyển Phase 14. Figma/live CARLA chưa có để kiểm chứng.
