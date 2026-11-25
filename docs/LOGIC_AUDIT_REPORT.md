# Kiểm tra logic và luồng chính — 26/11/2026

Mốc bắt đầu: `main`, HEAD `668f1504`, kèm working tree đã dọn tài liệu ở các lượt
trước. Đợt này chỉ tạo **một file báo cáo**; không tạo thêm exec plan/ADR/báo cáo
riêng cho từng lỗi. Thay đổi dọn tài liệu có sẵn được giữ nguyên.

**Kết luận đã kiểm chứng:** luồng API thiết kế → baseline bật/tắt → phân tích →
chốt dataset → candidate → regression → Reviewer Accept chạy được với MySQL,
Redis và bộ động học Java thật. Không dùng kết quả này để khẳng định CARLA hoặc
mọi luồng của toàn bộ hệ thống đều đã chạy hết.

## Phạm vi và kế hoạch

1. Đối chiếu code Java, frontend, worker, schema/migration và hợp đồng hiện hành.
2. Tái hiện năm mục trong bảng lỗi: AEB OFF, KPI, missed activation, truy vấn biến
   thể và CSV tiếng Việt; sửa lỗi xác nhận được bằng kiểm thử hồi quy phù hợp.
3. Rà soát luồng thiết kế → baseline → phân tích → candidate → regression → duyệt,
   cùng quyền truy cập, phạm vi project và tính nhất quán dữ liệu.
4. Chạy bộ kiểm thử và kiểm tra MySQL cô lập nếu môi trường cho phép; ghi rõ giới
   hạn đối với CARLA, LLM và giao diện chưa chạy thực tế.

## 1. Đối chiếu bảng lỗi đồng đội gửi

| Mục | Kết luận và thay đổi |
|---|---|
| AebConfig-45 | **Đã sửa.** `Evaluation` đọc `case.aeb_mode`. Quyết định giả lập của OFF vẫn ở số đo gốc, nhưng không được ghi thành kích hoạt/phanh oan/bỏ sót AEB thực tế. Không tạo chuỗi quy lỗi hoặc failure AEB cho OFF. Va chạm vật lý, outcome, vận tốc và `collision_events` vẫn được giữ; OFF có va chạm vẫn có verdict vật lý FAIL. |
| AebConfig-43 | **Đã sửa.** Thêm ON vào scope `FAILURE_FROM`, dùng chung cho KPI, nhóm theo họ, tổng số, phân trang và CSV. Failure OFF lịch sử cũng bị loại khỏi trang lỗi AEB mà không sửa/xóa dữ liệu cũ. |
| FailureAnalysis-20 | **Đã sửa.** ON có va chạm, chưa ra quyết định phanh vẫn được đánh dấu `missed_activation=true` khi `idealT=null`. Không suy ra bỏ sót chỉ vì mục tiêu đi vào đường xe nhưng chưa có va chạm hay thời điểm cần kích hoạt. |
| FailureAnalysis-38 | **Giữ lọc ON trong tập baseline tối ưu.** `/analysis/dataset` và `/analysis/runs` phục vụ đánh giá AEB nên lọc ON theo ADR-055. Collection CARLA theo biến thể vẫn giữ cả ON/OFF để đối chứng; kiểm thử DB/collection bao phủ việc này. Đây là hai mục đích dữ liệu khác nhau. |
| DataCollection-39 | **Đã sửa hai CSV báo cáo.** `/failures.csv` và `/regression/{id}/export.csv` trả đúng một UTF-8 BOM, giữ dấu tiếng Việt và quy tắc escape ô. CSV cảm biến/artifact gốc được tải nguyên byte để bảo toàn nội dung và checksum. |

Test tái hiện ban đầu: 6 ca, 5 ca FAIL trước sửa (hai CSV, hai trường hợp OFF,
một va chạm thiếu TTC); ca đối chứng không va chạm/không TTC không bị đánh dấu
bỏ sót. Đây là test hành vi, không phải sửa expected để che lỗi.

## 2. Các lỗi bổ sung đã sửa

| Mức | Vấn đề | Sửa và giới hạn |
|---|---|---|
| Cao | Regression chỉ kiểm trạng thái COMPLETED; TIMEOUT, mất cờ phân loại/telemetry hoặc số đo bắt buộc có thể bị dùng để chấm. Tập run rỗng cũng có thể qua `allMatch`. | Dùng chung `RunEvidence` và hợp đồng `AnalysisMetrics` cho analysis/optimization/regression. Kiểm cả baseline và candidate, mode ON, kết thúc hợp lệ, trace, cờ phân loại và số đo cần thiết. Tập rỗng, trùng biến thể hoặc thiếu cặp so với danh sách đã chốt không được hoàn tất thành PASSED. |
| Cao | Accept chỉ tin nhãn PASSED đã lưu. | Reviewer phải qua lại cùng chốt bằng chứng trước khi chuyển baseline, kể cả với test PASSED lịch sử. Không đổi các quyết định đã lưu trước đây. |
| Cao | MOBO bỏ qua số đo thiếu, thay impact/jerk/quãng phanh thiếu hoặc tập rỗng bằng 0, có thể tạo điểm Pareto tốt giả. | Từ chối baseline không đủ evidence và candidate thiếu objective. Không phanh có thể hợp lệ về phân loại, nhưng không được biến ba objective chưa áp dụng thành ba số 0. Trial thiếu dữ liệu được đánh FAILED trước khi kết thúc campaign lỗi. |
| Cao | Campaign lưu miền tìm kiếm tùy chỉnh nhưng engine vẫn dùng cận mặc định; bước tránh trùng parent có thể vượt cận người dùng. | Kiểm đủ bốn cặp cận hữu hạn và trong miền tham số; truyền cận đã lưu vào engine. Chặn lệch sau làm tròn, kiểm tham số cuối và điều chỉnh trùng parent trong cận. Trial lịch sử nằm ngoài miền campaign không được âm thầm dùng lại. |
| Trung bình | API nhận cấu hình objective tùy chỉnh nhưng engine chỉ chạy ba objective/ràng buộc cố định. | Từ chối cấu hình không được hỗ trợ trước khi tạo campaign; cấu hình chuẩn vẫn dùng ngưỡng phanh oan 5 điểm phần trăm theo ADR-044/055. |
| Trung bình | Dataset mới ghi `EGO_SPEED_NOT_RELATIVE` cho simulator đã tính vận tốc tương đối. | Ghi mô tả đúng profile đã biết: động học 1.1–1.4 và CARLA xosc9–16 là tương đối; profile cũ vẫn ego; profile không xác định giữ UNKNOWN. Không tính lại số đo và không đổi snapshot đã lưu. |
| Cao | Evaluator có thể cho SAFE/PASS với kết quả không có trace/collision hoặc TIMEOUT. | Evaluator v2 từ chối evidence không hoàn chỉnh. Các chốt downstream cũng kiểm độc lập để bảo vệ dữ liệu nhập/lịch sử. |
| Trung bình | Giới hạn phanh của xe bị quy thành ma sát đường thấp và gợi ý chỉnh tham số AEB. | Phân biệt `VEHICLE_BRAKE_LIMIT` khi giảm tốc khả dụng thấp hơn cả yêu cầu và giới hạn μg. Không gán tham số AEB chỉnh được cho giới hạn xe. Giữ luật cũ trong chế độ tái hiện lịch sử. |

Các thay đổi chính nằm ở `Evaluation`, `RunEvidence`, `AnalysisService`,
`AnalysisViewService`, `OptimizationService`, `RegressionRepository`,
`RegressionService`, `ReviewDecisionService`, `Csv` và hai controller xuất CSV.
Frontend bổ sung bản dịch cho các giải thích mới.

## 3. Phiên bản và bảo toàn dữ liệu

- Kết quả chấm mới có `evaluation.version = vehicsim.evaluation/v2`; bản lưu
  telemetry có `evaluation_version`. Không đổi định nghĩa vật lý hay metric nên
  identity simulator vẫn giữ nguyên. Hàm `evaluateLegacy` chỉ phục vụ tái hiện
  fixture/luật lịch sử, không dùng trong đường chạy mới.
- Không chấm lại run, sửa artifact hay backfill cờ lỗi cũ. Muốn có cờ bỏ sót và
  attribution theo luật mới cho một baseline cũ cần chạy baseline mới.
- Không đổi DDL, không thêm migration và không ghi vào database của nhóm.
- Consumer audit M1D gắn với hash source cũ sẽ nhận diện source đã đổi là
  `UNKNOWN`/`CONSUMER_SOURCE_CHANGED_OR_MISSING`, có thể làm compatibility thành
  `BLOCKED`. Giữ nguyên các hash/audit authority cũ và `dispatch_allowed=false`;
  không tự cấp quyền chạy MOBO từ handoff chỉ để làm test xanh.
- Các test M1D đã được cập nhật để kiểm trạng thái source thay đổi và việc từ
  chối dữ liệu thiếu; vẫn kiểm digest, schema, 72 danh tính Golden18 và input gốc
  không bị ghi lại. Test bounds/aggregation mới gọi helper/engine thật độc lập.

## 4. Database và kiểm tra luồng thực tế

MySQL 8.4 được dựng riêng ở cổng `13316`, Redis ở `16379`, không mount volume
database của người dùng. Ba database dùng một lần:
`fa_ber1_test`, `fa_db_direct_test`, `vsos_logic_audit_test`. Test từ chối chạy khi
database mục tiêu không đúng tên hoặc chưa rỗng.

Sau khi test xong đã dừng/xóa hai container tạm và dừng frontend cổng 3300;
log/ảnh kiểm chứng vẫn còn trong các thư mục gitignore.

Schema hiện tại dựng được với **34 bảng, 445 cột, 86 foreign key, 37 CHECK và
48 UNIQUE**. Số đếm tổng quan 397 cột/82 FK trong từ điển dữ liệu đã cũ; số ở đây
lấy từ `information_schema` của schema cô lập, không phải kiểm kê DB thật của nhóm.
Đã đối chiếu DDL, từ điển dữ liệu và migration 019/020. Test FA kiểm cả đường
khởi tạo storage và áp migration 020 trong database riêng.

`MainFlowMysqlTest` chạy HTTP thật với JWT, Spring transaction và JDBC:

1. Tạo tài khoản fixture theo role, bootstrap workspace/project/baseline.
2. Guest bị 401; Manager bị 403 khi tạo họ; Engineer ngoài workspace bị 404 khi
   chọn project không thuộc mình.
3. Engineer tạo họ 4 biến thể và chạy 8 baseline ON/OFF. Run hoàn tất và có số
   đo thật từ Java simulator. OFF có va chạm vẫn có collision event, không có
   failure AEB hay cờ kích hoạt/phanh oan/bỏ sót giả.
4. Dashboard/tập baseline chỉ có 4 run ON. Chèn một failure OFF lịch sử vào DB
   test để kiểm KPI, tổng số, danh sách và CSV vẫn loại đúng nó.
5. Chốt dataset tối ưu/xác minh không trùng biến thể, giữ revision và bàn giao
   được khi baseline hiện hành.
6. Tạo candidate, chạy 4 cặp regression; seed, xe, simulator và baseline ON khớp.
   Kiểm xuất CSV, Engineer không được Accept, Reviewer Accept chuyển candidate
   thành BASELINE và bản cũ thành ARCHIVED.
7. Dataset cũ vẫn đọc được nhưng không còn được handoff sau khi baseline đổi.
8. Campaign MOBO một trial bằng bộ động học đã hoàn tất, tuân thủ cận tùy chỉnh
   hẹp và lưu đủ ba objective từ run thật (`AUDIT_MOBO_OK`).

`FailureAnalysisMysqlTest` và `FailureAnalysisDatabaseMysqlTest` còn kiểm JDBC
round-trip, JSON/collection gốc, checksum, phân quyền theo project, idempotency,
concurrency và rollback thực tế. Đây là fixture của dữ liệu CARLA đã có, không
phải một lượt chạy CARLA server trong phiên audit.

## 5. Kiểm chứng

Các log và ảnh kiểm tra nằm trong `target/` hoặc `data/analysis-regression/`
đã gitignore; không tạo thêm file báo cáo trong `docs`.

| Kiểm tra | Kết quả |
|---|---|
| Java toàn bộ trước sửa | 1.774 test; 0 failure/error; 16 skipped. |
| Java + MySQL + main flow sau sửa | **1.814 test; 0 failure, 0 error, 3 skipped; BUILD SUCCESS.** Gồm 17 test MySQL FA và main flow HTTP/DB/MOBO. Log `target/logic-audit-final-java.log`. |
| Frontend ESLint | PASS. |
| TypeScript `tsc --noEmit` | PASS. |
| Frontend unit/contract | 74/74 PASS. |
| Next production build | PASS, gồm bản dịch mới; log `target/logic-audit-frontend-build.log`. |
| Analysis browser | 13/13 suite PASS trên production app; HTTP fixtures, có ảnh desktop/mobile. Không phải test CARLA hay backend thật. |
| Admin browser | FAIL ngay selector điều hướng của harness cũ: tìm nav `Quản trị hệ thống`, trong khi app hiện dùng sidebar chung `Điều hướng VehicSim`. Chưa có kết quả đầy đủ 7 suite; không đổi UI hoặc xóa assertion để nhận PASS. |
| Python worker | 87 passed, 1 skipped; không chạy CARLA server. |
| Ruff worker | PASS, dùng bản 0.16.0 như CI trong venv riêng dưới `target`. |

Test trình duyệt số đo có một sửa harness: mở tab “Đánh giá cảm biến” trước khi
upload CSV và bấm “Tính số đo”, đúng giao diện hiện hành. Sau sửa, suite đã qua.
Ba skip Java gồm hai test `M1AAuthorizedFixtureTest` và một
`KinematicParityFullTest` cần bật riêng; không tính chúng thành PASS.

## 6. Phần còn mở và giới hạn kết luận

- **CARLA runtime chưa chạy trong phiên này.** Chưa xác nhận lại radar, hình học
  va chạm, video/sensor, hiệu chuẩn xe và dung sai chạy lặp trên server CARLA thật.
- **Luồng LLM/SMTP bên ngoài chưa gọi thật.** Test không dùng khóa/provider thật.
- **FA handoff → campaign/GP tự động chưa được chứng minh.** Endpoint campaign
  hiện có code MOBO, nhưng request chưa nhận sealed dataset/partition của FA;
  collection nhiều seed/lần lặp còn có ranh giới consumer cần tích hợp. Một trial
  độc lập chạy được không chứng minh đã nối xong toàn bộ đường handoff đó.
- **Admin browser cần cập nhật harness theo shell hiện hành.** Backend role,
  project/workspace và review vẫn được kiểm bằng test Java và HTTP riêng.
- Không truy cập Figma; ảnh browser là bằng chứng rendering/hành vi fixture,
  không phải xác nhận thiết kế khớp Figma.
- Chưa kiểm database đang dùng của nhóm nên không kết luận máy đó đã áp đủ
  migration 019/020. Không dùng thông tin cũ trong docs để suy ra trạng thái DB.
- Đây là rà soát theo luồng/rủi ro trên source và kiểm thử, không phải chứng minh
  không còn mọi lỗi hoặc đã đọc/kiểm từng đường đi của mọi file trong project.

## 7. Nguồn đã đối chiếu và cách chạy lại

Đã đọc hướng dẫn root/scoped `AGENTS.md`, `CLAUDE.md`, hợp đồng
`analysis-metrics-contract.md`, ADR-040/044/055/067, kế hoạch quyết định 20/10,
README tổng hợp Failure Analysis, schema/từ điển/migration; đối chiếu controller,
quyền truy cập, service/repository, bridge, AEB/evaluation, simulation, MOBO,
frontend client/rendering và các bộ test Java/worker/frontend liên quan.
Hướng dẫn Next.js localization trong package đã cài cũng được đối chiếu trước
khi thêm bản dịch. Một số docs lịch sử nói MOBO chưa có; source hiện đã có
`MoboEngine`, `OptimizationService` và REST `/optimizations`; cần phân biệt việc
này với tích hợp sealed handoff vẫn còn mở.

```powershell
.\mvnw.cmd -B test
python -m pytest worker/tests -q
python -m ruff check worker
cd frontend
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test:analysis
npx.cmd next build
```

Để bật ba test MySQL, cung cấp URL localhost đúng tên DB như annotation trong
test và mật khẩu qua biến môi trường `FA_BE_R1_MYSQL_*`, `FA_DB_DIRECT_MYSQL_*`,
`VSOS_AUDIT_MYSQL_*`; mỗi DB phải rỗng. Main flow cần Redis riêng cổng 16379.
Không trỏ các biến này vào DB đang làm việc. Lượt chạy browser dùng app production
riêng cổng 3300 và `ANALYSIS_UI_URL=http://127.0.0.1:3300`.
