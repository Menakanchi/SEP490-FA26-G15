# Tab `Review-Decision` (RV) — khuyến nghị và quyết định của Reviewer

Thuộc [kế hoạch integration test](../2026-11-17-integration-test-va-issue-nguoi-5.md). ⭐ = cần run CARLA chạy xong.
Các ca đổi trạng thái chạy đúng thứ tự ở mục 7 của kế hoạch (pha 4).

> **Cập nhật 20/11/2026 — đọc trước phần thân.** File này là bản nháp 3 viết theo API; bản đã chạy là sheet `docs/Integration-Test_VSOS_TuDM_v6.xlsx` (bước thao tác trên web, mã ca đánh lại theo tab, nên mã trong file này không trùng mã sheet). Kết quả, dữ liệu thật và trạng thái issue ở mục 0, 5, 8 của [kế hoạch](../2026-11-17-integration-test-va-issue-nguoi-5.md). Phần thân đã lỗi thời ở các điểm: P-TEAM có baseline **AEB v4** (TTC 4,0 s, giảm tốc 10 m/s²), không phải v1.0, nên C-GOOD / C-GOOD2 / C-GOOD3 là TTC 3,0 / 2,0 / 1,8 s giữ giảm tốc 10; `<SIM>` là `carla-0.9.16-xosc9` (không còn `-xosc7`); máy test không chạy được CARLA nên các ca cần CARLA để Untested; chỉ tài khoản role MANAGER (MGR1) thêm được thành viên workspace; mã test thật xem bảng 5.3 của kế hoạch.
>
> Chấp nhận / Từ chối / baseline đã đổi / ứng viên đã được quyết định chạy ở RV-31 → RV-36 của sheet, kèm kiểm API trả 400. Hai Reviewer duyệt đồng thời không có trong sheet v6. Lỗi validation lý do (tiếng Anh, #9) ở API-05, API-06; thiếu header ở API-08 (tab `Server-API`).

**Đầu tab (sheet):** Module name = "Khuyến nghị và phê duyệt — `/validation/recommendations`, `/validation/recommendations/[testId]`,
`/validation/recommendations/[testId]/review`, `/validation/decisions`; `GET /recommendations`, `GET /recommendations/{id}`,
`POST /recommendations/{id}/decision`, `GET /decisions`".

Quy tắc nghiệp vụ được kiểm (`ReviewDecisionService`, `VehicSimAccess.requireReviewer`, ADR-035, ADR-048, ADR-049):
- Chỉ role REVIEWER là thành viên workspace của project được quyết định; phải chọn project tường minh bằng header.
- Quyết định ∈ {`ACCEPT`, `REJECT`, `REQUEST_MORE_TESTS`}; bắt buộc lý do (≤ 4000 ký tự) và xác nhận.
- Không quyết định khi test chưa chạy xong, test không có khuyến nghị, khuyến nghị đã có quyết định cuối (ACCEPTED/REJECTED).
- Người tạo khuyến nghị (người tạo test) không tự duyệt.
- Chỉ Accept khi verdict `PASSED`, candidate còn `CANDIDATE` và baseline lúc chạy test vẫn là baseline hiện hành.
- Accept: baseline cũ → `ARCHIVED`, candidate → `BASELINE`. Reject: candidate → `REJECTED`. Mỗi quyết định ghi `recommendation_decisions` và cập nhật `engineering_recommendations`.

Body chung của `POST /recommendations/{id}/decision`: `{"decision": …, "reason": …, "conditions": …, "confirmed": …}`; header
`X-VehicSim-Project: <P-TEAM>`.

---

### RV-01 — Danh sách khuyến nghị [N]
- **Description:** Kiểm tra danh sách chỉ gồm test đã hoàn tất, với trạng thái khuyến nghị đúng.
- **Preconditions:** PRE-ENV, PRE-ACC, PRE-T-DONE (T-A, T-A2, T-D, T-B, T-F, T-R hoàn tất; T-ERR lỗi); PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `GET /recommendations` với header `X-VehicSim-Project: <P-TEAM>`. 2. Mở `/validation/recommendations`.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 200; có item cho T-A, T-A2, T-D, T-B, T-F, T-R; **không** có T-ERR và test đang chạy. Mỗi item: `code = "REC-xxx"`, `regression_code = "RT-xxx"`, `baseline`, `candidate`, `rates`, `counts`, `created_at`. `status`: T-A, T-A2, T-D, T-R = `PENDING`; T-B, T-F = `BLOCKED`. UI hiển thị nhãn "Chờ duyệt" / "Bị chặn".

### RV-02 — Chi tiết khuyến nghị [N]
- **Description:** Kiểm tra chi tiết khuyến nghị đủ bằng chứng cho Reviewer.
- **Preconditions:** như RV-01.
- **Test Steps:** 1. `GET /recommendations/<T-A>`. 2. Mở `/validation/recommendations/<T-A>`.
- **Test Data:** `<T-A>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:**
  - HTTP 200; `recommendation_status = "PENDING"`, `recommendation_status_label = "Awaiting review"` (UI: "Chờ duyệt").
  - `changed_parameters` có 1 phần tử `TTC_THRESHOLD` 1.5 → 1.8.
  - `expected_effect.collision_rate`, `false_activation`, `median_min_ttc` là cặp [baseline, candidate]; `expected_effect.regressed = 0`.
  - `confidence = "Medium"`; `evidence` có 4 mục: `regression` = `PASS`, `robustness`, `pareto`, `sensitivity` = `NOT_RUN`.
  - `review.decision = "PENDING"`, `review.requested_by` = tên ENG1.
  - Ghi nhận `tradeoffs`: câu nhắc "pedestrians who stop at the curb" chỉ đúng với họ người đi bộ (issue #6).

### RV-03 — Reviewer chấp nhận candidate đạt regression ⭐ [N]
- **Description:** Kiểm tra Reviewer Accept hợp lệ: candidate thành baseline mới, baseline cũ được lưu trữ, quyết định được ghi lại.
- **Preconditions:** T-A `COMPLETED`, verdict `PASSED`; C-GOOD `CANDIDATE`; v1.0 `BASELINE`; khuyến nghị T-A `PENDING_REVIEW`; PRE-LOGIN-REV2.
- **Test Steps:**
  1. Mở `/validation/recommendations/<T-A>/review`.
  2. Tick đủ các ô checklist (gồm ô cảnh báo CARLA).
  3. Chọn "Chấp nhận"; nhập lý do và điều kiện theo Test Data; bật "Xác nhận"; bấm gửi.
  4. `SELECT id, status FROM aeb_versions WHERE id IN (<v1.0>, <C-GOOD>)`.
  5. `SELECT status, reviewed_by_user_id, review_notes, review_conditions FROM engineering_recommendations WHERE regression_test_id=<T-A>`.
  6. `SELECT decision, reviewed_by_user_id, reason, review_conditions, confirmed, source FROM recommendation_decisions WHERE recommendation_id=<id khuyến nghị>`.
- **Test Data:**
  - `decision = "ACCEPT"`
  - `reason = "Không có ca xấu đi, không va chạm mới; TTC tăng ở ca 50 km/h. Đồng ý đưa IT-C-GOOD làm baseline."`
  - `conditions = "Theo dõi phanh oan ở vòng sau."`
  - `confirmed = true`
- **Post conditions:** C-GOOD là baseline mới; v1.0 lưu trữ; khuyến nghị T-A đóng.
- **Expected Result:**
  - HTTP 200; response là chi tiết khuyến nghị với `review.decision = "ACCEPT"`, `review.reviewed_by` = tên REV2, `review.note` = lý do, `review.conditions` = điều kiện.
  - `aeb_versions`: v1.0 `ARCHIVED`, C-GOOD `BASELINE`.
  - `engineering_recommendations.status = ACCEPTED`, `reviewed_by_user_id` = REV2.
  - `recommendation_decisions`: 1 dòng `decision = ACCEPT`, `confirmed = 1`, `source = REVIEW`.
  - Log backend có sự kiện `regression.decide` với `decision=ACCEPT`.

### RV-04 — Lịch sử quyết định và chuỗi baseline ⭐ [N]
- **Description:** Kiểm tra lịch sử quyết định ghi lại quyết định Accept và chuỗi baseline cũ → mới.
- **Preconditions:** RV-03 xong.
- **Test Steps:** 1. `GET /decisions` (REV2, header `<P-TEAM>`). 2. Mở `/validation/decisions`.
- **Test Data:** —
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `decisions` có mục `recommendation_code = "REC-<T-A>"`, `regression_code = "RT-<T-A>"`, `baseline = "v1.0"`, `candidate = "IT-C-GOOD"`, `decision = "ACCEPT"`, `reviewed_by` = REV2, `reason` như RV-03. `baselines` có v1.0 `status = "ARCHIVED"` và IT-C-GOOD `status = "BASELINE"` kèm `RT-<T-A>` và lý do.

### RV-05 — Baseline mới được dùng cho regression sau ⭐ [N]
- **Description:** Kiểm tra sau khi Accept, regression mới dùng baseline mới.
- **Preconditions:** RV-03 xong; PRE-LOGIN-ENG1.
- **Test Steps:** 1. `GET /regression/preview?scenario_id=<F1>`.
- **Test Data:** `scenario_id = <F1>`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** `baseline = "IT-C-GOOD"`; `baseline_runs_existing = 0` (run REGRESSION của C-GOOD không được tính là run baseline, nên regression kế tiếp sẽ chạy baseline mới cho IT-C-GOOD trước).

### RV-06 — Reviewer từ chối candidate ⭐ [N]
- **Description:** Kiểm tra Reject: candidate bị đánh REJECTED, baseline không đổi.
- **Preconditions:** T-B `COMPLETED` (REGRESSED); C-BAD `CANDIDATE`; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-B>/decision`. 2. Kiểm `aeb_versions` của C-BAD và baseline hiện hành; `engineering_recommendations` của T-B.
- **Test Data:** `decision = "REJECT"`; `reason = "Ca 30 km/h chuyển từ an toàn sang va chạm; phanh muộn và yếu."`; `confirmed = true`.
- **Post conditions:** C-BAD `REJECTED`.
- **Expected Result:** HTTP 200; C-BAD `REJECTED`; baseline hiện hành không đổi; khuyến nghị T-B `REJECTED`; `review.decision = "REJECT"`.

### RV-07 — Yêu cầu thêm kiểm thử, lý do đúng biên 4000 ký tự ⭐ [B]
- **Description:** Kiểm tra REQUEST_MORE_TESTS giữ candidate ở trạng thái chờ và chấp nhận lý do 4000 ký tự.
- **Preconditions:** T-R `COMPLETED`, khuyến nghị `PENDING_REVIEW`; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-R>/decision`. 2. Kiểm `engineering_recommendations`, `aeb_versions` của C-GOOD3, `CHAR_LENGTH(review_notes)`.
- **Test Data:** `decision = "REQUEST_MORE_TESTS"`; `reason` = "Cần thêm ca 50 km/h. " + "x" × (4000 − 21) (đủ 4000 ký tự); `confirmed = true`.
- **Post conditions:** Khuyến nghị `MORE_TESTS_REQUESTED`.
- **Expected Result:** HTTP 200; khuyến nghị `status = MORE_TESTS_REQUESTED`; `CHAR_LENGTH(review_notes) = 4000`; C-GOOD3 vẫn `CANDIDATE`; UI hiển thị "Yêu cầu thêm kiểm thử".

### RV-08 — Quyết định lại sau khi yêu cầu thêm kiểm thử [N]
- **Description:** Kiểm tra khuyến nghị đang "yêu cầu thêm kiểm thử" vẫn được quyết định cuối.
- **Preconditions:** RV-07 xong.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-R>/decision`. 2. Đếm `recommendation_decisions` của khuyến nghị T-R.
- **Test Data:** `decision = "REJECT"`; `reason = "Không bổ sung được ca 50 km/h trong vòng này."`; `confirmed = true`.
- **Post conditions:** C-GOOD3 `REJECTED`.
- **Expected Result:** HTTP 200; khuyến nghị `REJECTED`; C-GOOD3 `REJECTED`; `recommendation_decisions` có 2 dòng (REQUEST_MORE_TESTS rồi REJECT).

### RV-09 — Không Accept test REGRESSED [A]
- **Description:** Kiểm tra không thể Accept candidate làm xấu ca (test FAILED không Accept).
- **Preconditions:** T-B `COMPLETED`, verdict `REGRESSED`, khuyến nghị chưa có quyết định cuối (chạy **trước** RV-06).
- **Test Steps:** 1. Gửi `POST /recommendations/<T-B>/decision`. 2. Mở trang duyệt của T-B.
- **Test Data:** `decision = "ACCEPT"`; `reason = "Thử chấp nhận test không đạt"`; `confirmed = true`.
- **Post conditions:** Không đổi trạng thái version và khuyến nghị.
- **Expected Result:** HTTP 400; `detail = "không thể Accept: ứng viên chưa qua regression test"`; UI khoá lựa chọn "Chấp nhận" với câu "Kiểm thử hồi quy không đạt — ứng viên làm xấu đi kịch bản không bao giờ được chấp nhận".

### RV-10 — Không Accept test có verdict FAILED [A]
- **Description:** Kiểm tra không Accept test không đạt tiêu chí dù không có ca xấu đi.
- **Preconditions:** T-F `COMPLETED`, verdict `FAILED`.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-F>/decision`.
- **Test Data:** `decision = "ACCEPT"`; `reason = "Thử chấp nhận test không đạt tiêu chí"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "không thể Accept: ứng viên chưa qua regression test"`.

### RV-11 — Lý do trống hoặc chỉ khoảng trắng [A]
- **Description:** Kiểm tra bắt buộc ghi lý do quyết định.
- **Preconditions:** khuyến nghị T-D `PENDING_REVIEW`; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi với `reason = ""`. 2. Gửi với `reason = "   "`. 3. Gửi không có trường `reason`.
- **Test Data:** `decision = "REJECT"`; `confirmed = true`; `reason` theo từng bước.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 400; `detail` là thông điệp `@NotBlank` (ghi nguyên văn; nếu tiếng Anh thì liên kết issue #9).

### RV-12 — Lý do 4001 ký tự [B]
- **Description:** Kiểm tra lý do vượt 4000 ký tự bị từ chối.
- **Preconditions:** như RV-11.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`.
- **Test Data:** `decision = "REJECT"`; `reason` = "x" × 4001; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail` là thông điệp `@Size(max=4000)` (ghi nguyên văn).

### RV-13 — Không xác nhận quyết định [A]
- **Description:** Kiểm tra bắt buộc xác nhận quyết định dựa trên bằng chứng mô phỏng.
- **Preconditions:** như RV-11.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`.
- **Test Data:** `decision = "REJECT"`; `reason = "Kiểm tra xác nhận"`; `confirmed = false`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "phải xác nhận quyết định dựa trên bằng chứng mô phỏng"`.

### RV-14 — Thiếu trường xác nhận [A]
- **Description:** Kiểm tra trường `confirmed` là bắt buộc.
- **Preconditions:** như RV-11.
- **Test Steps:** 1. Gửi body không có `confirmed`.
- **Test Data:** `decision = "REJECT"`; `reason = "Kiểm tra thiếu xác nhận"`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail` là thông điệp `@NotNull` (ghi nguyên văn).

### RV-15 — Giá trị quyết định không hợp lệ [A]
- **Description:** Kiểm tra chỉ nhận ba giá trị quyết định.
- **Preconditions:** như RV-11.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`.
- **Test Data:** `decision = "APPROVE"`; `reason = "Kiểm tra giá trị"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]"`.

### RV-16 — Quyết định viết chữ thường [A]
- **Description:** Kiểm tra giá trị quyết định phân biệt hoa thường.
- **Preconditions:** như RV-11.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`.
- **Test Data:** `decision = "accept"`; `reason = "Kiểm tra chữ thường"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]"`.

### RV-17 — Quyết định khi test đang chạy [A]
- **Description:** Kiểm tra không quyết định được khi regression chưa chạy xong.
- **Preconditions:** Một test trong P-TEAM đang `RUNNING` (ví dụ test tạo ở RC-11); PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<id test đang chạy>/decision`.
- **Test Data:** `decision = "REJECT"`; `reason = "Thử khi đang chạy"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "regression test chưa chạy xong"`.

### RV-18 — Quyết định test lỗi mô phỏng [A]
- **Description:** Kiểm tra test lỗi mô phỏng không có khuyến nghị để duyệt.
- **Preconditions:** T-ERR `FAILED`; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-ERR>/decision`.
- **Test Data:** `decision = "REJECT"`; `reason = "Thử với test lỗi"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "regression test này không có khuyến nghị để duyệt"`.

### RV-19 — Quyết định lần hai sau quyết định cuối [A]
- **Description:** Kiểm tra khuyến nghị đã ACCEPTED không quyết định lại được.
- **Preconditions:** RV-03 xong.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-A>/decision`. 2. Mở trang duyệt của T-A.
- **Test Data:** `decision = "REJECT"`; `reason = "Đổi ý"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "recommendation này đã có quyết định cuối"`; UI hiện "Khuyến nghị này đã có quyết định cuối (…)" và khoá form.

### RV-20 — Không Accept khi baseline đã đổi ⭐ [A]
- **Description:** Kiểm tra không phê duyệt bằng kết quả test chạy với baseline cũ.
- **Preconditions:** T-D tạo **trước** RV-03 (baseline lúc chạy = v1.0), `COMPLETED`, verdict `PASSED`; RV-03 đã đổi baseline sang C-GOOD.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`. 2. Mở trang duyệt của T-D.
- **Test Data:** `decision = "ACCEPT"`; `reason = "Thử chấp nhận với baseline cũ"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu; C-GOOD2 vẫn `CANDIDATE`.
- **Expected Result:** HTTP 400; `detail = "baseline đã đổi kể từ khi chạy test — hãy chạy lại regression với baseline hiện hành"`; UI khoá "Chấp nhận" với câu "Bản cơ sở đã đổi kể từ lúc chạy kiểm thử này — hãy chạy lại kiểm thử hồi quy".

### RV-21 — Candidate đã được quyết định ở test khác [A]
- **Description:** Kiểm tra một candidate chỉ được quyết định một lần dù có nhiều test.
- **Preconditions:** RV-03 xong (C-GOOD đã `BASELINE`); T-A2 (cũng C-GOOD) `COMPLETED`, khuyến nghị `PENDING_REVIEW`.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-A2>/decision`.
- **Test Data:** `decision = "REJECT"`; `reason = "Thử từ chối candidate đã chấp nhận"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "candidate này đã được quyết định ở một regression test khác"`.

### RV-22 — Reviewer không tự duyệt test do mình tạo [A]
- **Description:** Kiểm tra người tạo khuyến nghị không được tự quyết định.
- **Preconditions:** T-R do REV1 tạo, `COMPLETED`, khuyến nghị `PENDING_REVIEW`; PRE-LOGIN-REV1.
- **Test Steps:**
  1. Mở `/validation/recommendations/<T-R>/review` bằng REV1; tick đủ checklist, chọn "Chấp nhận", nhập lý do, bật xác nhận.
  2. Bấm gửi.
  3. Kiểm khuyến nghị T-R trong DB.
- **Test Data:** `decision = "ACCEPT"`; `reason = "Tự duyệt"`; `confirmed = true`; tài khoản REV1.
- **Post conditions:** Khuyến nghị T-R vẫn `PENDING_REVIEW`.
- **Expected Result:** HTTP 400; `detail = "người tạo khuyến nghị không tự duyệt được"`; UI hiện lỗi sau khi gửi. *(Mong muốn: UI khoá trước khi gửi — hiện chưa có, issue #4.)*

### RV-23 — ENGINEER không được quyết định [A]
- **Description:** Kiểm tra chỉ REVIEWER được Accept/Reject.
- **Preconditions:** khuyến nghị T-D `PENDING_REVIEW`; PRE-LOGIN-ENG1.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision` bằng token ENG1. 2. Mở trang duyệt bằng ENG1.
- **Test Data:** `decision = "REJECT"`; `reason = "Engineer thử duyệt"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 403; `detail = "Chỉ REVIEWER được Accept / Reject recommendation"`; UI hiện "Chỉ Người duyệt (REVIEWER) được ra quyết định; người làm không tự duyệt việc của mình." và khoá form.

### RV-24 — ADMIN, MANAGER, EXPERIENCER không được quyết định [A]
- **Description:** Kiểm tra ADMIN cũng không thay quyền Reviewer.
- **Preconditions:** như RV-23.
- **Test Steps:** 1. Gửi cùng request bằng token ADMIN1. 2. Bằng MGR1. 3. Bằng EXP1.
- **Test Data:** như RV-23.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 403; `detail = "Chỉ REVIEWER được Accept / Reject recommendation"`.

### RV-25 — Reviewer không gửi header project [A]
- **Description:** Kiểm tra Reviewer phải chọn project tường minh khi quyết định.
- **Preconditions:** như RV-23; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision` không có `X-VehicSim-Project`.
- **Test Data:** `decision = "REJECT"`; `reason = "Thiếu header"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 400; `detail = "Cần chọn project trước khi quyết định; hãy tải lại trang"`.

### RV-26 — Reviewer ngoài workspace [A]
- **Description:** Kiểm tra Reviewer không thuộc workspace không xem và không duyệt được.
- **Preconditions:** PRE-LOGIN-REV3.
- **Test Steps:** 1. `GET /recommendations/<T-D>` với header `<P-TEAM>`. 2. `POST /recommendations/<T-D>/decision` với header `<P-TEAM>`.
- **Test Data:** `decision = "REJECT"`; `reason = "Ngoài workspace"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả hai HTTP 404 (`detail` bắt đầu bằng `"Không tìm thấy:"`).

### RV-27 — Workspace đã lưu trữ chỉ xem lịch sử [A]
- **Description:** Kiểm tra không quyết định được khi workspace/project đã lưu trữ.
- **Preconditions:** Chạy cuối. Lưu trữ workspace bằng SQL (chưa có API, Q16): `UPDATE workspaces SET status='ARCHIVED' WHERE id=<WS>`; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi `POST /recommendations/<T-D>/decision`. 2. Mở trang duyệt. 3. Khôi phục: `UPDATE workspaces SET status='ACTIVE' WHERE id=<WS>`.
- **Test Data:** `decision = "REJECT"`; `reason = "Workspace lưu trữ"`; `confirmed = true`.
- **Post conditions:** Workspace về `ACTIVE`; khuyến nghị T-D không đổi.
- **Expected Result:** HTTP 400; `detail = "Project hoặc workspace đã lưu trữ, chỉ được xem lịch sử"`; UI hiện cùng câu và khoá form.

### RV-28 — Không đăng nhập [A]
- **Description:** Kiểm tra API khuyến nghị và quyết định yêu cầu đăng nhập.
- **Preconditions:** PRE-ENV.
- **Test Steps:** 1. `GET /recommendations`, `GET /decisions`, `POST /recommendations/<T-D>/decision` không có `Authorization`.
- **Test Data:** body như RV-23.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Cả ba HTTP 401.

### RV-29 — Điều kiện bật nút gửi trên màn duyệt [N]
- **Description:** Kiểm tra nút gửi chỉ bật khi Reviewer hoàn tất checklist, chọn quyết định, nhập lý do và xác nhận.
- **Preconditions:** khuyến nghị T-D `PENDING_REVIEW`; PRE-LOGIN-REV2 (UI).
- **Test Steps:**
  1. Mở `/validation/recommendations/<T-D>/review`.
  2. Lần lượt: chưa tick gì → tick đủ checklist → chọn "Từ chối" → nhập lý do → bật "Xác nhận"; sau mỗi bước quan sát nút gửi.
  3. Xoá lý do; quan sát lại. Không bấm gửi.
- **Test Data:** quyết định "Từ chối"; lý do "Kiểm tra giao diện".
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Nút gửi chỉ bật ở bước cuối (đủ checklist, có quyết định, có lý do, đã xác nhận); tắt lại khi xoá lý do. Checklist có dòng "Tôi hiểu rằng số CARLA chưa hiệu chuẩn phanh…" vì test chạy CARLA. Chụp màn hình.

### RV-30 — Hai Reviewer quyết định đồng thời (tuỳ chọn, theo Q9) [N]
- **Description:** Kiểm tra khi hai Reviewer gửi quyết định cùng lúc, chỉ một quyết định được lưu.
- **Preconditions:** Chạy sau RV-27 (workspace đã khôi phục). Khuyến nghị T-D chưa đóng (`MORE_TESTS_REQUESTED` sau RV-32, RV-33; Reject vẫn hợp lệ dù baseline đã đổi — luật R9 ở ep-bva.md); token REV1 và REV2 (cả hai không phải người tạo T-D).
- **Test Steps:** 1. Gửi đồng thời hai request `POST /recommendations/<T-D>/decision`: REV1 và REV2 (hai tiến trình curl chạy song song). 2. Đếm `recommendation_decisions` của khuyến nghị T-D.
- **Test Data:** `decision = "REJECT"`; `reason = "Đồng thời 1"` / `"Đồng thời 2"`; `confirmed = true`.
- **Post conditions:** Khuyến nghị `REJECTED`.
- **Expected Result:** Một request HTTP 200, request còn lại HTTP 400 "recommendation này đã có quyết định cuối"; đúng 1 dòng `REJECT` trong `recommendation_decisions`.

---

## Ca bổ sung sau rà soát EP/BVA

Phân lớp, biên và bảng quyết định ở [ep-bva.md](ep-bva.md), mục 3. RV-31 → RV-34 chạy **sau RV-01 và trước RV-20, RV-27, RV-30**
(RV-32, RV-33 dùng REQUEST_MORE_TESTS nên khuyến nghị T-D vẫn chưa đóng).

### RV-31 — Quyết định rỗng, null hoặc có khoảng trắng hai đầu [A]
- **Description:** Kiểm tra trường quyết định rỗng hoặc sai định dạng bị từ chối (EP-RV6, EP-RV7).
- **Preconditions:** khuyến nghị T-D chưa đóng; PRE-LOGIN-REV2.
- **Test Steps:** Gửi `POST /recommendations/<T-D>/decision` 4 lần với `decision` theo Test Data.
- **Test Data:** `decision` = `""`, `"   "`, không gửi, `" ACCEPT "`; mọi lần `reason = "Kiểm tra quyết định"`, `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** Ba lần đầu HTTP 400 với thông điệp `@NotBlank` (ghi nguyên văn); lần 4 HTTP 400, `detail = "decision phải thuộc [ACCEPT, REJECT, REQUEST_MORE_TESTS]"`.

### RV-32 — Lý do 1 ký tự và 3999 ký tự [B]
- **Description:** Kiểm tra biên min và max−1 của lý do; lý do được cắt khoảng trắng hai đầu khi lưu.
- **Preconditions:** khuyến nghị T-D chưa đóng; PRE-LOGIN-REV2.
- **Test Steps:** 1. Gửi quyết định lần 1. 2. Gửi lần 2. 3. `SELECT reason, CHAR_LENGTH(reason) FROM recommendation_decisions WHERE recommendation_id=<rec T-D> ORDER BY id DESC LIMIT 2`.
- **Test Data:** lần 1 `decision = "REQUEST_MORE_TESTS"`, `reason = "  x  "`, `confirmed = true`; lần 2 `decision = "REQUEST_MORE_TESTS"`, `reason` = "y" × 3999, `confirmed = true`.
- **Post conditions:** Khuyến nghị T-D `MORE_TESTS_REQUESTED`, thêm 2 dòng quyết định.
- **Expected Result:** Cả hai HTTP 200; lý do lưu `"x"` (độ dài 1) và chuỗi 3999 ký tự; C-GOOD2 vẫn `CANDIDATE`.

### RV-33 — Biên và lớp của điều kiện kèm theo [B]
- **Description:** Kiểm tra `conditions` rỗng được lưu NULL, 4000 ký tự được nhận, 4001 ký tự bị từ chối.
- **Preconditions:** như RV-32.
- **Test Steps:** Gửi 3 lần; sau mỗi lần thành công đọc `review_conditions` của khuyến nghị T-D.
- **Test Data:** chung `decision = "REQUEST_MORE_TESTS"`, `reason = "Kiểm tra điều kiện"`, `confirmed = true`; `conditions` lần lượt `"   "`, "c" × 4000, "c" × 4001.
- **Post conditions:** Thêm 2 dòng quyết định.
- **Expected Result:** Lần 1 HTTP 200, `review_conditions = NULL`; lần 2 HTTP 200, `CHAR_LENGTH(review_conditions) = 4000`; lần 3 HTTP 400 thông điệp `@Size` (ghi nguyên văn).

### RV-34 — Quyết định cho test không tồn tại [A]
- **Description:** Kiểm tra quyết định với id test không tồn tại (EP-RV18).
- **Preconditions:** PRE-LOGIN-REV2.
- **Test Steps:** 1. `POST /recommendations/999999/decision`.
- **Test Data:** `decision = "REJECT"`; `reason = "Không tồn tại"`; `confirmed = true`.
- **Post conditions:** Không đổi dữ liệu.
- **Expected Result:** HTTP 404; `detail = "Không tìm thấy: regression test"`.
