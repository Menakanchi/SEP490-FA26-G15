# ADR-046 — EXPERIENCER tự chọn ứng viên đạt kiểm chứng làm baseline trong project cá nhân

**Trạng thái:** Proposed 01/11/2026
**Phạm vi:** project cá nhân (`projects.workspace_id IS NULL`), `ProjectService.adopt`, màn Kết luận vòng `/projects/[id]/rounds/[testId]`.
Bổ sung bất biến 5 (AGENTS.md) và ADR-035 ("chỉ REVIEWER duyệt, EXP không có recommendation") cho riêng project cá nhân; project nhóm
không đổi.

## Bối cảnh

ADR-035 cho EXPERIENCER project cá nhân, không qua Reviewer và không có recommendation. Regression trong project cá nhân vì vậy không
sinh khuyến nghị (`RegressionService.createRecommendation` bỏ qua project không thuộc workspace), nhưng cũng không có đường nào đổi
baseline: hành trình 5 bước dừng ở "Kiểm chứng" và không mở được vòng 2 ([exec plan hành trình](../exec-plans/active/2026-11-01-hanh-trinh-experiencer.md),
quyết định D-UX1). Không được thêm cột hay bảng (ràng buộc của exec plan 31/10).

## Các lựa chọn

1. Giữ nguyên: vòng kết thúc ở kết quả kiểm chứng, baseline cố định là v1.0 mãi mãi.
2. Sinh khuyến nghị chờ duyệt và mời Reviewer vào project cá nhân, trái ADR-035 và lộ dữ liệu cá nhân.
3. **Chủ project tự chọn, cùng điều kiện như Accept của Reviewer** — chọn.

## Quyết định

- Chỉ chủ project cá nhân (role EXPERIENCER, project `ACTIVE`) gọi `POST /api/v1/vehicsim/projects/{id}/regressions/{testId}/adopt`
  với `{reason, confirmed}`. Không bao giờ tự động.
- Điều kiện giữ nguyên như `ReviewDecisionService`: có lý do và xác nhận; test đã chạy xong và verdict `PASSED`; ứng viên còn `CANDIDATE`
  và test chưa có quyết định; baseline của test vẫn là `BASELINE` hiện hành. Khoá dòng test và hai phiên bản trong cùng transaction,
  hạ baseline cũ `ARCHIVED` trước rồi nâng ứng viên thành `BASELINE`.
- Lý do nối vào `aeb_versions.notes` của phiên bản vừa thành baseline ("Dùng làm baseline thay v1.0 sau kiểm chứng RT-006: …") và ghi
  `AuditLog` sự kiện `project.adopt`. Không ghi `engineering_recommendations`: hai ràng buộc `ck_er_decision` + `ck_er_no_self_review`
  bắt quyết định phải có người duyệt khác người tạo (đã thử trên MySQL thật 01/11/2026), mà không được đổi schema.
  Project cá nhân vì vậy không có dòng khuyến nghị nào.
- Hành trình đếm theo baseline hiện hành: sau khi đổi baseline, các bước ②–⑤ bắt đầu lại ở vòng mới.

## Hệ quả

- Bất biến 5 thêm ngoại lệ: trong project cá nhân, chủ project thay vai Reviewer; luật "người tạo không tự duyệt" chỉ áp cho project nhóm.
- Lịch sử quyết định (`/decisions`) của project cá nhân trống; lý do đọc ở ghi chú phiên bản AEB. Muốn lịch sử riêng thì cần đổi schema
  bằng ADR khác.
- Kết quả vẫn là mô phỏng, không phải chứng nhận an toàn; giao diện bắt xác nhận câu này trước khi đổi.
- Test: `ProjectServiceTest#aPassedCandidateBecomesTheBaselineWithTheReasonKept`,
  `ProjectServiceTest#adoptingNeedsAReasonAConfirmationAndAFinishedPassedTest`,
  `ProjectServiceTest#anOutdatedTestOrADecidedCandidateCannotChangeTheBaseline`.
