# 05 — User workflow theo backend thật

Hai tác vụ chính: **tìm hiểu một run đã chạy** và **chuẩn bị bằng chứng để bàn giao**. Tác vụ nhập collection/chạy core V3.1 là nhu cầu hợp lệ nhưng đang BLOCKED trên web, không dùng flow đọc kết quả legacy để giả đã phân tích V3.1. Capability evidence ở [01](01_BACKEND_CAPABILITY_AUDIT.md), blockers ở [09](09_BACKEND_BLOCKERS_AND_DEPENDENCIES.md).

## 1. Flow chính và mức hỗ trợ

| Bước người dùng | Web hiện tại thực sự làm được | Phần đầy đủ V3.1 còn chặn |
|---|---|---|
| SELECT DATA | lọc run baseline DB theo family/baseline/source/status; mở đúng run ID | upload result/collection, giữ mọi mode/rep/attempt/manifest ở HTTP |
| ANALYZE | **chỉ đọc** kết quả đánh giá đã lưu và aggregate backend; CTA “Xem kết quả” | gọi DiagnosticReport core, quản lý analysis execution/result ID/version |
| UNDERSTAND RESULTS | run status, legacy outcome/flags/chain,3canonical stored values, scope/caveats | seven-axis evidence report, physical outcome/command attribution/candidate sufficiency V3 |
| INVESTIGATE IF NEEDED | source timestamps/GT vs perceived TTC/trace/legacy stage evidence/playback | recorder timeline/contact vectors, validated clock alignment, core dossiers/source refs qua API |
| EXPORT | CSV lỗi legacy; chốt/open/revalidate dataset v2 qua JSON API | DiagnosticReport/V3.1 handoff/compatibility authenticated resource/download |

Không dùng simulation PENDING/RUNNING để vẽ “đang phân tích V3”. Không bắt user chạy lại CARLA để xem report đã có. Không yêu cầu nhập bốn tham số AEB khi DB/run đã có; chúng là context, không controls để FA tối ưu.

## 2. Tác vụ A — Hiểu một run

1. Vào `/analysis/failures`: thấy scope project/source và một table baseline. Default không tự chọn family đầu tiên để đẩy sang optimizer.
2. Nếu cần, lọc họ/trạng thái; advanced chứa baseline/xe/profile/dt context và các ID thủ công còn cần thiết. Không có family thì dùng dữ liệu API đang có, không fabricateoptions.
3. Bấm “Xem kết quả” trên row. Giữ filter/page/sort/search/returnTo. Chưa completed: chỉ báo trạng thái kỹ thuật và lỗi thực, không dựng PASS/AEB outcome.
4. Đọc summary: identity, source/evaluation validity, physical claims hiện được hỗ trợ, ba objective với đơn vị/nguồn/giới hạn và phân loại legacy được ghi rõ.
5. Bấm “Điều tra” khi cần: source event + value + timestamp → telemetry tại đúng mốc; optional playback. Gặp missing thì thấy “Chưa xác định” và lý do nguồn/API, không bị ép chọn cause.
6. Quay về danh sách giữ context. Link từ regression quay lại regression bằng whitelist `analysisReturn`; giữ `compare` và exacttime.

Với backend hiện tại, summary không có “AEB đã áp phanh thật” hay “PHYSICAL_LIMIT confirmed”. Không lấy legacy failure_class làm confirmed root/candidate của core.

## 3. Tác vụ B — Chuẩn bị tập bàn giao

1. Từ table, chủ động gán run vào “Tối ưu” hoặc “Xác minh độc lập”. Run identity/revision giữ nguyên; đổi bộ lọc không làm mất draft. Không tự phân role bằng outcome hoặc tự latest-per-variant.
2. Selection tray hiện số run mỗi vai trò và action “Rà soát tập”. Mở panel trong workspace, không phải mode navigation ngang hàng đọc kết quả.
3. Rà metadata checks + source identity + safe-case/variant/seed isolation + metrics state. Nhấn “Chốt tập”. Server có quyền bác metadata preview; UI giữ draft và trình bày response lỗi.
4. POST selections thành công → snapshot ID bất biến, hai partition và3canonical aggregates. Không thay đổi snapshot khi edit draft; bỏ stale association nếu source selection đổi như hành vi hiện tại.
5. “Kiểm tra trước bàn giao” gọi GET handoff mỗi lần cần hành động currentness. Lỗi baseline/revision/hash: không export bản đó như đã duyệt hiện hành. Archive vẫn có thể đọc với cảnh báo.
6. Task FE-R4 có thể thêm tải **dataset v2 JSON** từ response đã kiểm, tên/schema rõ. Mở module4 là navigation; frozen execution vẫn BLOCKED. Chưa có web export **MOBO Handoff V3.1**.

Không đưa validation evidence vào hints/ranges/fit GP. UI có thể cho **xem** validation summary hiện được service trả trong review chuyên sâu; label “chỉ xác minh” và không tính score/ranking/hint chung từ hai tập. Không sửa business rule để tiết kiệm click.

## 4. Tác vụ C — Collection JSON/V3.1 sau khi backend sẵn sàng

Luồng mục tiêu: chọn file/collection đã được producer xuất → intake validation/manifests → user xác nhận đúng nguồn → gọi phân tích core → summary từng run/quality toàn collection → điều tra một run → export report/handoff với eligibility thật. Mỗi stage chỉ mở khi B01/B02/B03/B04 ở file09 có response/error/permissions/tests đã chốt.

File nhập hiện nhận offline `vehicsim.result/v1` hoặc `vehicsim.run-collection/v1`. Collection không đồng nghĩa frozen whole-scenario cohort. UI tương lai phải hiện expected/analyzable/blocked members, ON/OFF/rep/attempt, manifest gaps và original source pointers; không bỏ failed member rồi báo “đã phân tích toàn bộ”. Baseline v1 không tự verified từ label hoặc4parameter values. OFF giữ observational comparison và không có enacted-AEB failure assessment như ON.

Không tạo URL/API giả trong blueprint. Backend owner phải định nghĩa endpoint/resource contract ở task riêng; route dự kiến không được đưa vào client trước đó.

## 5. Clicks, navigation và cognitive load

Đếm dưới đây là **phân tích luồng source**, không phải số đo usability. Không tính thao tác filter/scroll/typing, đã có data phù hợp, user có quyền.

| Tác vụ | Hiện tại | Đề xuất | Đánh giá |
|---|---|---|---|
| Mở một run bất kỳ từ full explorer khi vào overview | chuyển Runs + row =2; run trong5shortcut có thể1 | table mặc định + row =1 | bớt yêu cầu user chọn mode trước khi chọn run |
| Xem telemetry từ row | overview shortcut hoặc run-detail+tab,1..3 tùy context | row detail1 + Điều tra1 =2; deep link vẫn1 | không xóa deep links để đạt bố cục đẹp |
| Xem3objectives của run | mở detail, có nhiều panels cùng trang | mở result1,3cards ngay đầu | giảm mật độ, không đổi công thức |
| Chuẩn bị/chốt/revalidate với2run hợp lệ | role2 + tabdataset1 + save1 + proceed1 =5 | role2 + review1 + save1 + check/export1 =5 | không hứa giảmclick bằng bỏ partition/revalidation |
| Quay từ playback về detail/list | các link có returnTo | giữ nguyên + inline investigation mode | giữ context quan trọng hơn cắtroute |

Navigation người dùng phải chọn giảm từ4mode chính xuống một workspace + một result page. Legacy lookup và export là progressive tools; playback là deep route. Jargon nội bộ/batch/formula IDs không làm menu. Bốn tham số đọc ở “Cấu hình lúc chạy”, không lẫn với bộ lọc hay form tối ưu. Source/version/hash nằm technical details; quality/unknown có ý nghĩa thì nằm summary.

## 6. Trạng thái bắt buộc và next action

| State | Hiển thị / hành động |
|---|---|
| Initial loading | skeleton/role status; disable data-dependent actions; không dùng0nhưplaceholder |
| No data | phân biệt “không run” với “không khớp bộ lọc”; reset filter/link module2, không tự chạy simulation |
| No failures | chỉ “không có lỗi legacy khớp”, không “hệ thống an toàn” |
| Request error | lỗi ngay panel/action, retry đúng scope; stale response không ghi đè current selection |
| 401/403/no project | reuse shared auth/project flow; read-only role vẫn xem; không form ghi hoạt động |
| Run unfinished/error/timeout/stopped | trạng thái thực thi tách đánh giá; detail null có chủ đích |
| Missing legacy scalar | “Chưa có số đo / API chưa phân biệt nguyên nhân”; không tự gọi NA hoặc0 |
| V3 UNKNOWN/INVALID/NOT_APPLICABLE/CONFLICTING | tương lai render nguyên status/reason/source, không gộp chung badge SAFE; unavailable HTTP được ghi rõ khác unknown evidence |
| INCONCLUSIVE | kết luận chưa đủ evidence, dữ kiện đã biết vẫn thấy; show missing evidence/alternatives khi report thật có |
| Snapshot stale | archive read-only + lý do; chặn handoff currentness, không xóa lịch sử |
| Core web capability absent | thông báo gọn ở entry liên quan, không nút giả “đang chạy”; blocker có owner |

## 7. Accessibility/responsive acceptance mục tiêu

Giữ keyboard tabs/labels/captions/live status/focus styles đang có. Modal nếu thực sự cần trong task sau phải quản lý focus/escape/return; ưu tiên inline review panel để tránh thêm modal và không đụng shared primitives. Summary đọc được bằng keyboard/text không cần hover chart; evidence link label có run/time/unit. Màu không thay status text. Khi đổi run/query không lấy focus tùy tiện; khi lỗi action đưa focus tới summary lỗi, không xóa draft.

Mục tiêu kiểm320/375/768/1280/1440px và zoom200%: summary xếp dọc, filter nâng cao đóng; table có caption/region/focus/scroll riêng không tràn toàn trang; technical hashes wrap; event/rate targets hướng tới44px. Không công bố WCAG/screenreader/native touch PASS trước manual/browser checks ở FE-R5.
