# Rà soát sau merge PhuongNA — 26/11/2026

Báo cáo duy nhất cho đợt kiểm tra này, cập nhật trực tiếp từ báo cáo trước.
Mốc nhận việc: nhánh `PhuongNA`, HEAD `cb8daae2`, đang merge `9aacb295`;
Lúc bắt đầu còn 10 file xung đột; hiện đã xử lý và đánh dấu resolved trong Git.
Giữ giao diện mới, ghép chức năng và các sửa logic vào
cùng bản làm việc. Các thay đổi dọn tài liệu có sẵn được giữ lại.

## 1. Phạm vi và kết luận

Đã đối chiếu Java backend/core, frontend, worker, schema/migration và tài liệu
nghiệp vụ theo các luồng chính. Các lỗi xác nhận được đã sửa trong source và có
kiểm tra hồi quy. Bản thiết kế UI mới được giữ; chỉnh hành vi, trạng thái, dữ liệu
và khả năng truy cập tại các chỗ có lỗi.

**Luồng API chính đã qua tới Reviewer Accept, trial MOBO và recovery sau restart
trên MySQL/Redis riêng. Java: 1.835 test, 0 failure/error, 3 skipped.**
Log cuối: `target/postmerge-audit/java-complete.log`.
Các giới hạn CARLA thật, dịch vụ bên ngoài và handoff FA vào optimizer nằm ở §7;
không suy từ test fixture rằng mọi môi trường đều không còn lỗi.

## 2. Lỗi sau merge đã sửa

| Mức | Vấn đề | Thay đổi và kiểm chứng |
|---|---|---|
| Chặn chạy | 10 xung đột ở schema, CSV và frontend; ghép sai có thể mất bảng FA, BOM hoặc chức năng UI. | Ghép schema có đủ bốn bảng FA và danh mục tham khảo; CSV giữ BOM và chống công thức; ghép tám file UI theo shell, bộ chọn và bố cục mới, giữ V3/handoff/quyền và reset phân trang. |
| Cao | Schema mới không khởi tạo được: dấu nháy trong công thức GPR chưa escape, có đoạn tuple hỏng và 58 dòng tham khảo trùng. | Sửa SQL, còn 44 mã duy nhất; tạo database MySQL thật thành công. Không dùng bỏ qua lỗi hoặc tắt UNIQUE để nạp dữ liệu. |
| Trung bình | Seed TTC trở lại 1,8 s, khác mặc định Java/baseline 1,5 s; mô tả biên ghi 3,5 trong khi catalog/engine cho 4,0. | Đồng bộ seed 1,5 và biên mô tả 0,5–4,0. Kiểm seed Java/SQL và so dữ liệu tạo mới với nâng cấp. Không sửa tham số phiên bản AEB/run cũ. |
| Cao | Bootstrap và Admin tạo/đổi role tự thêm Engineer/Reviewer vào workspace đầu tiên. Tài khoản có thể đọc project không được Manager cấp quyền. | Bỏ tự cấp membership. Thêm bốn ca kiểm bootstrap/tạo/nâng role; HTTP main flow cấp membership rõ ràng qua Manager và kiểm outsider vẫn bị 404 sau bootstrap lặp. Giữ nguyên membership đã có trong DB của nhóm. |
| Cao | Project cá nhân đổi baseline chỉ dựa vào nhãn PASSED, bỏ qua cổng evidence đã dùng ở Reviewer. | `ProjectService` kiểm đủ cặp nguồn bằng cùng `RegressionService.evidenceComplete` trước khi đổi baseline; thiếu bằng chứng bị từ chối. |
| Cao | Regression có thể chốt trên một phần tập biến thể; bản chọn toàn bộ không lưu danh sách ID và run nguồn mất có thể treo mãi. | Lưu ID biến thể cho mọi cách chọn; kiểm số lượng, ID, trùng lặp và đủ hai phía. Run nguồn mất làm test FAILED; execution đã hủy không được Accept dù có verdict cũ. |
| Cao | MOBO gộp baseline của thế hệ biến thể cũ vào mẫu, trong khi candidate chỉ chạy thế hệ hiện hành. Run nguồn thiếu có thể làm tỷ lệ/giá trị nhìn tốt hơn. | Chỉ lấy đúng ID biến thể đã chọn cho trial; thiếu baseline/candidate bị từ chối. Test đối chứng có lịch sử nhiều thế hệ và run bị mất. |
| Cao | Hủy campaign có thể ghi đè kết quả đã hoàn tất; trial cuối có thể đổi CANCELLED trở lại COMPLETED/FAILED. | Chuyển trạng thái có điều kiện; kiểm hủy sau khi run cuối kết thúc; chỉ executor nhận được PENDING mới chạy. HTTP kiểm hủy campaign COMPLETED bị 400 và kết quả giữ nguyên. |
| Cao | Chọn trial chưa hoàn tất/không Pareto/thiếu chỉ số có thể đi tới tạo verification hoặc lỗi 500. | Chỉ nhận trial COMPLETED, Pareto, đủ ba số hữu hạn không âm và thỏa ràng buộc. |
| Cao | Sau restart, campaign bỏ dở treo RUNNING; run con của campaign/test đã hủy có thể được dispatch lại. | Cleanup worker mồ côi trước; đóng campaign bị gián đoạn thành FAILED với lý do rõ ràng, trial chưa xong thành FAILED/PRUNED, dừng run con của parent đã dừng. Không tự tiếp tục optimizer thiếu snapshot phục hồi. Kiểm SQL thực trên MySQL và ba ca startup. |
| Trung bình | “Ca lỗi tương tự” trộn simulator/xe/AEB/bước thời gian khác nhau. | Giới hạn cùng project, họ, mode, AEB version, xe, simulator identity và dt trước khi xếp hạng. Không đổi objective hay chấm lại run. |
| Cao | CARLA offline/không tương thích/thiếu ScenarioRunner tự chạy mô phỏng giả nhưng vẫn mang identity CARLA. | Bỏ fallback; trả lỗi yêu cầu CARLA sẵn sàng hoặc chọn động học. Ba trạng thái thiếu runtime có test từ chối. |
| Cao | Retry có thể giữ CSV/JSON/ảnh của lần trước; timeout/lỗi ScenarioRunner có thể còn `result.json` viết dở để nộp. | Xóa đúng file sinh ra thuộc lần chạy trước; lượt không thu mẫu không dùng lại telemetry cũ. Run không thành công không giữ kết quả để nộp. Test lỗi/timeout đã tái hiện trước sửa. |
| Trung bình | Video có thể dùng overlay cũ, vẽ số 0 giả khi thiếu telemetry, nhận NaN/Infinity và rút ngắn thời gian khi mất ảnh camera. | Giữ ảnh gốc nếu thiếu mẫu, bỏ số không hữu hạn, dọn overlay cũ và dùng chênh frame × dt cho duration. Smoke thật Pillow/ffmpeg tạo và giải mã H.264 1280×720, 10 fps. |
| Trung bình | Trang chỉ có subtitle/actions hiển thị cùng nhóm nút hai lần; một số trang bỏ h1 sau redesign. | Mỗi nhóm action chỉ hiện một lần, thêm tiêu đề hỗ trợ đọc màn hình khi bỏ tiêu đề thị giác. Analysis workflow kiểm lại nút tải kết quả. |
| Trung bình | Skip link tạo hash history làm Back trả URL trang trước nhưng nội dung vẫn ở trang sau. | Focus/scroll nội dung trực tiếp, giữ kiểm keyboard, điều hướng và Back trong browser. |
| Trung bình | MOBO studio và trang riêng nhận phản hồi của campaign cũ, giữ banner candidate cũ, hoặc gửi chọn/hủy lặp. | Gắn dữ liệu/thông báo với campaign tương ứng, chặn response cũ và khóa mutation bằng ref; đồng bộ URL/tab và phân trang. Browser giữ rồi thả response để kiểm race thật. |
| Trung bình | Pending/failed trial được đếm “Hợp lệ”; số rất nhỏ bị làm tròn thành 0 rồi diễn giải an toàn; danh sách rỗng có thể chờ vô hạn. | Chỉ đếm COMPLETED có đủ số đo và thỏa ràng buộc; hiện “Chưa đánh giá” khi chưa đủ; dùng formatter giữ số nhỏ, bỏ khẳng định an toàn từ trung bình bằng 0; có empty state và kiểm mobile. |

Các sửa đổi nghiệp vụ nằm chủ yếu ở `RunService`, `OptimizationService`,
`RegressionService`, `ReviewDecisionService`, `ProjectService`, `AnalysisViewService`,
`AdminService`, `BootstrapService` và `AdminRepository`. Worker chỉ làm adapter;
không chuyển logic AEB ra Python. Không thêm bảng/cột hoặc migration cấu trúc mới.

## 3. Giữ các sửa đã có từ đợt audit trước

| Mục đồng đội gửi | Trạng thái sau merge |
|---|---|
| AebConfig-45 | Evaluator v2 đọc ON/OFF; OFF giữ quyết định shadow và va chạm vật lý, không tạo cờ/lỗi kích hoạt AEB giả. |
| AebConfig-43 | KPI, tổng số, nhóm họ, trang và CSV failure cùng loại OFF; kể cả failure OFF lịch sử. |
| FailureAnalysis-20 | ON va chạm không ra quyết định vẫn là missed activation khi ideal TTC thiếu; không suy bỏ sót chỉ từ một mục tiêu xa đi vào đường. |
| FailureAnalysis-38 | Giữ ON trong dataset tối ưu/phân tích theo ADR-055; collection đối chiếu giữ cả ON/OFF. Đây là chính sách dữ liệu đã chốt. |
| DataCollection-39 | Hai CSV báo cáo có đúng một UTF-8 BOM; artifact cảm biến tải nguyên byte. |

Cổng evidence dùng chung tiếp tục chặn timeout, mất trace/phân loại, thiếu metric
bắt buộc hoặc OFF trong regression/tối ưu. MOBO không thay missing bằng ba số 0;
miền tìm kiếm tùy chỉnh được kiểm và truyền vào engine. Evaluator phân biệt giới
hạn phanh xe với ma sát thấp. Snapshot mới ghi đúng định nghĩa impact của profile.

`evaluation.version = vehicsim.evaluation/v2`; không chấm lại run cũ hoặc đổi
simulator identity vật lý. `evaluateLegacy` giữ tái hiện fixture lịch sử.
Consumer inspection gắn hash source cũ tiếp tục trả UNKNOWN/BLOCKED khi source đổi;
không sửa audit authority hoặc bật `dispatch_allowed` để làm test xanh.

## 4. Database đã kiểm

MySQL 8.4 và Redis 7.4 dựng riêng, chỉ bind localhost `13316` / `16379`, không mount
volume database người dùng. Database dùng một lần: `fa_ber1_test`,
`fa_db_direct_test`, `vsos_logic_audit_test`, `vsos_merge_schema_test`,
`vsos_merge_upgrade_test`. Test từ chối datasource sai tên hoặc DB chưa rỗng.

Đã kiểm hai đường:

1. Khởi tạo từ `database/mysql/01_schema.sql` sau sửa.
2. Khởi tạo schema cũ tại merge-base `baf0892d`, áp cả sáu migration thuộc hai nhánh:
   `019_2026-11-24_bo-sung-tech-references-toan-dien.sql`,
   `019_2026-11-24_lan-lap-va-lan-thu-cua-run.sql`,
   `020_2026-11-24_bo-sung-tech-references-chuyen-sau.sql`,
   `020_2026-11-25_failure_analysis_json.sql`,
   `021_2026-11-24_chuan-hoa-url-tech-references.sql`,
   `022_2026-11-24_bo-sung-4-tham-so-aeb-tech-references.sql`.

Hai đường có cùng **34 bảng, 445 cột, 86 FK, 37 CHECK, 48 UNIQUE**, cùng định nghĩa
cột và cùng toàn bộ nội dung 44 mã tham khảo (bỏ ID/timestamp khi so nội dung).
Như vậy không bỏ migration chỉ vì thấy số 019/020 đã tồn tại. DB tạo mới không cần
chạy lại các ALTER TABLE lịch sử. Log: `target/postmerge-audit/schema-verified.log`.

Không ghi vào database của nhóm. Không suy trạng thái migration thực tế của nhóm
từ source; các tài liệu từng nói “chưa áp DB” được sửa thành hướng dẫn kiểm riêng.
Không tự sửa membership đã cấp trước đây hoặc cập nhật run/artifact lịch sử.

## 5. Luồng chính đã thực thi

`MainFlowMysqlTest` gọi HTTP thật, JWT, Spring transaction, JDBC, Redis và simulator
động học Java; không mock kết quả của luồng này:

1. Fixture tạo tài khoản; Manager thêm hai tài khoản Experiencer vào workspace và
   cấp role Engineer/Reviewer qua API. Outsider vẫn bị 404 sau bootstrap lặp;
   guest bị 401 và Manager không tạo được họ kịch bản.
2. Engineer tạo họ bốn biến thể, chạy tám baseline ON/OFF. OFF có collision event
   thật nhưng không có failure/kích hoạt/phanh oan/bỏ sót AEB giả.
3. Dashboard/dataset chỉ có bốn ON. Chèn failure OFF lịch sử trong DB test để kiểm
   KPI, items, tổng và CSV vẫn loại đúng nó.
4. Chốt hai tập tối ưu/xác minh không trùng biến thể, giữ run revision và handoff.
5. Tạo candidate, chạy bốn cặp regression cùng seed/xe/simulator; đạt PASSED.
   Engineer không được Accept; Reviewer Accept đổi baseline và lưu trữ bản cũ.
6. Dataset cũ vẫn đọc được nhưng handoff bị chặn sau khi baseline thay đổi.
7. Chạy một trial MOBO động học với cận hẹp tùy chỉnh và các chiều cố định; lưu đủ
   ba objective. Hủy campaign đã hoàn tất bị từ chối, giữ COMPLETED.
8. Sau khi luồng trên hoàn tất, chỉ trong DB fixture: mô phỏng parent bị gián đoạn
   hoặc đã hủy với run con PENDING. Recovery không dispatch lại chúng, đánh đúng
   FAILED/PRUNED/STOPPED và giữ số đo đã lưu. Không giả lập crash trên DB nhóm.

Các test FA MySQL còn kiểm import result/collection, checksum, project scope,
idempotency, concurrency, transaction/rollback và migration 020 FA.

## 6. Kiểm chứng và tài liệu

| Kiểm tra | Kết quả |
|---|---|
| Java toàn bộ + MySQL/Redis + HTTP main flow | **1.835 test, 0 failure, 0 error, 3 skipped; BUILD SUCCESS.** `target/postmerge-audit/java-complete.log`. |
| Schema mới và nâng cấp | PASS, cấu trúc và dữ liệu tham khảo khớp nhau. |
| Frontend ESLint / TypeScript / Next production build | PASS sau các sửa UI. |
| Frontend unit/contract | 74/74 PASS. |
| Analysis browser | 13/13 suite PASS; `data/postmerge-analysis/summary.json`. |
| Admin browser | **7/7 suite PASS**, 221 ảnh; `data/postmerge-admin/summary.json`. |
| MOBO browser riêng và studio chung | PASS; `data/postmerge-mobo/result.json`: response về muộn/bấm lặp, trial COMPLETED thiếu objective, số không hữu hạn/âm, header contrast ≥4,5 và 12 ảnh ở 320/390/768/1366 px. |
| Dependency production | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities. |
| Worker pytest / Ruff 0.16 | **99 tests PASS / lint PASS**; log `target/postmerge-audit/worker-final.log`, `worker-ruff.log`; có smoke Pillow + ffmpeg thật. |

Ba skip Java: hai test `M1AAuthorizedFixtureTest` cần fixture được cấp quyền và
một `KinematicParityFullTest` cần lưới ngoài repo. Không tính chúng là PASS.

Đã dừng/xóa hai container MySQL/Redis của audit (không volume) và dừng frontend
kiểm thử cổng 3300. Log/ảnh/snapshot phục hồi được giữ ở thư mục gitignore.
Không còn file unmerged; các thay đổi để tại working tree/index để xem xét, chưa
tạo merge commit hoặc đẩy lên remote.

Các lỗi harness cũ được sửa theo shell/tab thực tế: tên nav, mobile menu, focus,
Back và selector. Giữ các assertion về quyền, scroll, focus và trạng thái dữ liệu;
không đổi UI về shell cũ hoặc bỏ kiểm lỗi để lấy PASS. Browser dùng HTTP fixtures;
quyền backend/DB được kiểm riêng bằng Java và HTTP integration.

Đã đọc hướng dẫn root/scoped AGENTS/CLAUDE; đối chiếu ADR-040/044/055/064/065/066/067,
hợp đồng chỉ số, kế hoạch 20/10, README Failure Analysis, schema/từ điển/migration,
controller/security/service/repository, evaluator/bridge, worker và API client/UI.
Đã sửa tài liệu hiện hành về MOBO, hủy tác vụ, profile v16, số cột/FK và migration
trùng số; cập nhật số lượng test trong frontend hướng dẫn. Chỉ có file này làm
báo cáo; log, ảnh và snapshot phục hồi nằm trong `target/` hoặc `data/` đã gitignore.

Lệnh kiểm lại từ gốc repo, PowerShell:

```powershell
.\mvnw.cmd -B test
python -m pytest worker/tests -q
python -m ruff check worker
cd frontend
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test:analysis
npx.cmd next build
npm.cmd audit --omit=dev --audit-level=high
```

Ba test MySQL cần biến môi trường `FA_BE_R1_MYSQL_*`, `FA_DB_DIRECT_MYSQL_*`,
`VSOS_AUDIT_MYSQL_*` đúng localhost, tên DB trống như annotation; main flow dùng
Redis riêng 16379. Browser dùng production app riêng và `ANALYSIS_UI_URL` /
`ADMIN_UI_URL`; MOBO: `node tests/mobo-workflow-ui.mjs`. Không chạy `mvn clean` nếu
cần giữ log/snapshot phục hồi của đợt dọn tài liệu trong `target`.

## 7. Phần còn mở và giới hạn

- CARLA server thực tế chưa chạy trong đợt này: chưa kiểm vật lý/radar/callback,
  calibration, dung sai chạy lặp hoặc hủy tiến trình trên server thật. Worker,
  result intake, bridge và video đã kiểm offline; chúng không thay thế CARLA.
- Nếu từng dùng fallback CARLA cũ, cần đối chiếu `lifecycle.json` (`dev_runner`)
  và artifact, rồi chạy lại baseline trên server thật; identity CARLA của dữ liệu
  lịch sử tự nó chưa chứng minh đã chạy server. Đợt này không tự sửa dữ liệu cũ.
- FA sealed dataset/partition chưa được nối vào request campaign/GP. Một trial
  độc lập chạy được không chứng minh đã hoàn thành đường handoff FA → MOBO.
  Campaign khởi động lại được đóng lỗi rõ ràng, chưa có resume an toàn từ snapshot.
- Sensitivity/Robustness và phạm vi category chưa có simulator vẫn theo nợ kỹ thuật.
  Không tạo kết quả chứng nhận hoặc claim an toàn từ một chỉ số trung bình.
- ADMIN/MANAGER vẫn theo project nhóm mặc định của TD-30; Engineer/Reviewer theo
  membership. Chưa thay thiết kế phân quyền còn mở của hai role kia.
- Không gọi LLM/SMTP/provider thật; không truy cập Figma. Ảnh kiểm trình duyệt là
  bằng chứng rendering/hành vi, không phải xác nhận khớp Figma hoặc E2E CARLA.
- Đây là rà soát theo luồng và rủi ro, có kiểm thử thực thi; không phải chứng minh
  mọi dòng code hoặc mọi tình huống triển khai đều không còn lỗi.
