# 20/10/2026 — Người 5: regression, so sánh và phê duyệt

Phạm vi: màn `/validation/**` theo [phân chia 5 thành viên §7](../../vehicsim/phan-chia-cong-viec-5-thanh-vien.md).
Lõi đã có (ghép cặp cùng seed, verdict, Reviewer quyết định) được giữ nguyên; đợt này bổ sung phần còn thiếu.
Không đổi schema MySQL; không sửa `RunService`, worker hay `vehicsimFlow.ts`; tài liệu chỉ thêm dòng mới.

## Đã làm

1. **Test bất biến chưa có máy kiểm (TD-33):** `RegressionPairingTest` — candidate chạy đúng seed baseline, không ghép động học với CARLA
   hay khác xe (kể cả khi cấu hình hiện là CARLA), preview khớp test thật, run STOPPED không cho verdict PASSED và không tạo khuyến nghị.
   `VehicSimSecurityTest` thêm kiểm role cho `POST /regression` và các route đọc mới.
2. **Sửa nhỏ:** `ViewsService.progress` đếm STOPPED là đã xong; trang duyệt truyền `step` ở nhánh loading; sửa comment lỗi thời.
3. **Ngưỡng phanh oan mặc định 5 điểm %** (TD-48) theo [ADR-042](../../adr/ADR-042-nguong-phanh-oan-regression-5-diem.md), hằng
   `RegressionService.DEFAULT_FALSE_ACTIVATION_MAX_PTS` dùng chung với phần tối ưu. Test đã tạo giữ ngưỡng đã lưu (`aTestStoredWithTheOldThresholdIsStillJudgedByIt`).
   Kiểm trước khi đổi fallback: DB dev `regression_tests` có 0 dòng nên không có test cũ thiếu giá trị ngưỡng.
4. **`RegressionReportService`** (chỉ đọc): nguồn candidate (thủ công / chiến dịch + trial qua `optimization_trials.candidate_aeb_version_id`),
   cảnh báo CARLA chưa hiệu chuẩn, gói xuất JSON/CSV (`GET /regression/{id}/export.json|csv`), lịch sử quyết định và chuỗi baseline (`GET /decisions`).
5. **Frontend:** nút Tải JSON/CSV, thẻ nguồn candidate và banner CARLA ở chi tiết regression và khuyến nghị, mục checklist bắt buộc về CARLA
   ở trang duyệt (backend vẫn cho Accept), khối lịch sử quyết định + chuỗi baseline ở danh sách khuyến nghị, ngưỡng mặc định 5 điểm % ở form tạo.

## Chưa làm, phụ thuộc người khác (ghi ở TD-49)

- So sánh ba objective ADR-040 ở regression: chờ phần phân tích bàn giao hàm gộp theo họ.
- Tập xác minh đã chốt: hiện chọn theo họ, mặc định toàn bộ biến thể để luôn có ca an toàn.
- API hủy run (TD-37): phần chạy baseline. Phía regression đã chịu được run STOPPED.
- Ghi `engineering_recommendations.optimization_run_id`: chờ phần tối ưu có dữ liệu campaign/trial.

## Kiểm chứng (20/10/2026)

- `.\mvnw.cmd -B clean test` với JDK 21 (`~/.jdks/ms-21.0.11`): 144 test, 0 lỗi, `BUILD SUCCESS`.
- `python -m ruff check worker`: qua. `python -m pytest worker/tests -q`: 78 test qua.
- Trong `frontend`: `npm run lint`, `npx tsc --noEmit` qua; `npx next build` (NEXT_PUBLIC_API_URL=http://localhost:8001) qua, đủ các trang `/validation/**`.
- Máy này đặt `JAVA_HOME` là JDK 25: build sạch với JDK 25 lỗi vì Lombok không xử lý annotation (`variable log` / `getUser()` không tìm thấy). Dự án yêu cầu JDK 21 như CI.
- **Chưa kiểm:** chạy thật xuyên màn trên web (đăng nhập ENGINEER/REVIEWER, tạo regression, tải gói, duyệt), ảnh chụp màn hình, đối chiếu Figma
  `k6LErf7biJUfWfd320Foe0`, và regression trên CARLA thật. Các điểm trên chỉ được kiểm bằng unit test với `Db` giả và build.

## Nhật ký

- 20/10/2026: chốt với người dùng — ngưỡng 5 điểm %, objective chờ hàm gộp của phần phân tích, Accept vẫn cho phép trên CARLA kèm cảnh báo,
  không sửa schema, tài liệu chỉ thêm dòng mới, git do người dùng tự làm.
