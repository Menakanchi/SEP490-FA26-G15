# Kiểm chứng luồng nghiệp vụ sau merge — 26/11/2026

Mốc bắt đầu: `5c7fcc9b`, working tree sạch. Đây là báo cáo audit duy nhất;
cập nhật file có sẵn, không tạo báo cáo/kế hoạch/script kiểm thử mới.
Giữ UI mới và breadcrumb gọn; không đổi công thức AEB, GP/qEHVI, tiêu chí
regression, chính sách Reviewer hoặc dữ liệu lịch sử của nhóm.

## 1. Kết luận và trạng thái thực tế

**Toàn bộ luồng CARLA → chẩn đoán V3 → handoff V3 → MOBO chưa thông suốt: BLOCKED.**
CARLA thật không khả dụng; consumer có thẩm quyền cho handoff chẩn đoán V3 vẫn thiếu.
Đã nối và thực thi thành công đường **dataset FA V2 đã chốt → GP/MOBO →
validation độc lập → Reviewer Accept** trên HTTP/MySQL/Redis thật và simulator
động học Java. Không coi đường V2 hoặc browser fixtures là bằng chứng CARLA thật.

| Bước | Trạng thái | Bằng chứng/phạm vi |
|---|---|---|
| Tạo kịch bản và variants | PASS | HTTP có JWT/project scope tạo bốn biến thể, giữ ca an toàn. |
| Chạy CARLA và sinh result.json mới | BLOCKED | `127.0.0.1:2000` từ chối TCP; thiếu server mặc định, worker venv và Python module `carla`. ScenarioRunner có sẵn. Không chạy server/world. |
| Tự nạp result.json của CARLA vào DB | BLOCKED khi chạy thật | Source đã có auto intake sau worker: identity/params → dataset → transaction lưu run/metrics/failure/artifact. Test intake và JSON CARLA lịch sử qua MySQL đạt; chưa có run CARLA mới để kiểm chứng thực địa. Không cần upload JSON thủ công cho luồng chạy backend. |
| FA lấy đúng run, đối chiếu vật lý và chẩn đoán | PASS trong kiểm chứng offline/DB | Adapter chọn numeric run/variant trong project, đọc original result.json, kiểm hash; test DB chạy lại trên JSON CARLA đã có. Không thay canonical metrics bằng derived/reference hoặc hypothesis. Chưa kiểm trên run CARLA mới. |
| Xuất/lưu handoff chẩn đoán V3 | PASS về persistence | Source/execution/report/handoff lưu nguyên byte và SHA-256, đọc lại/dedupe/restart/rollback được kiểm trên MySQL. Trạng thái DIAGNOSTIC_ONLY/BLOCKED giữ nguyên, không cấp quyền dispatch. |
| Sealed dataset V2 → campaign/GP | PASS | API nhận dataset ID + digest; hai trial thật, lượt hai `ACQUISITION`; chỉ optimization partition tham gia chạy và fit. |
| Handoff chẩn đoán V3 → MOBO | BLOCKED | `fa_json_handoffs` chưa có approved-context/cohort/quality authority và consumer adapter. Không bật `dispatch_allowed`, không cập nhật hash authority để ép PASS. |
| Candidate → verification/regression → Reviewer Accept | PASS với simulator động học | Bốn cặp holdout, hai seed mỗi biến thể; cùng source/seed/config/xe/simulator; Engineer bị 403 khi Accept, Reviewer Accept đổi baseline hợp lệ. |

V2 (`vehicsim.analysis-dataset/v2`, `analysis_results`) và V3
(`vehicsim.failure-analysis-mobo-handoff/v1`, `fa_json_handoffs`) là hai contract
khác nhau. MOBO hiện dùng snapshot V2 đã chốt; chưa dùng handoff V3. Người dùng
không cần sửa DB hay tải lên JSON để đi đường V2 đã kiểm chứng.

## 2. Lỗi đã sửa

| Vấn đề/nguyên nhân | Thay đổi |
|---|---|
| MOBO bỏ qua dataset đã chốt, chọn lại generation và baseline mới nhất; validation không được giữ riêng. | Lưu `dataset_ref` trong campaign; kiểm dataset/digest/project/baseline/revision/manifest/config/params; replay chính xác từng optimization run/seed. Verification chỉ dùng validation nguồn. |
| Liên kết FA làm mất dataset ID; form campaign không gửi snapshot; chọn candidate mở danh sách chung. | Giữ ID qua deep links, tải handoff/digest hiện hành, khóa scenario/simulator theo snapshot, gửi đúng baseline/dataset/digest và mở đúng regression ID. Lỗi campaign được hiển thị sau reload cùng liên kết tập nguồn. |
| ID/seed đúng nhưng worker có thể trả kết quả của bộ tham số AEB khác. | Intake động học/CARLA/submit đối chiếu đủ bốn actual params hữu hạn với cấu hình yêu cầu trước khi lưu. GP kiểm lại actual candidate params, exact source pairs và ba aggregate đã lưu trước khi fit. |
| UNIQUE theo test + variant làm gãy verification nhiều seed cùng biến thể. | UNIQUE theo test + baseline run; vẫn giữ unique candidate và pair FK. Frozen evidence kiểm đủ source/candidate IDs và số cặp; regression thường giữ guard cũ. |
| Chọn candidate lặp có thể tạo test trùng hoặc lấy nhầm test custom cùng candidate. | Khóa trial, lưu/tra `verification_ref` đúng campaign + trial; kiểm digest/source set; retry test FAILED/CANCELLED tạo lượt xác minh mới. |
| Campaign lỗi có thể để trial RUNNING/run con PENDING. | Đóng trial chưa xong và dừng run PENDING; giữ số đo đã lưu. Recovery không dispatch lại con của parent bị dừng. |
| Retry đọc criteria ScenarioRunner còn sót từ lượt cũ, kể cả JSON cũ hỏng. | Chỉ nhận JSON được tạo/thay đổi trong attempt hiện tại; không xóa artifact cũ để hợp thức hóa kết quả. |
| Gắn dataset ghi đè trực tiếp có thể làm hỏng result.json khi IO lỗi. | Ghi file tạm cùng thư mục rồi thay thế nguyên tử; dọn file tạm trong finally. |
| Kiểm chứng MySQL phát hiện record Java khác cấu trúc JSON đọc lại; replay config dùng Map.toString không phải JSON. | Chuẩn hóa record thành JSON tree trước so sánh/hash, vẫn so số chính xác; serialize config đúng JSON. Có regression test roundtrip và kiểm chứng HTTP/DB. |

## 3. Những file thay đổi

Source Java, dưới `src/main/java/com/vsos/backend/`:

- `controller/optimization/OptimizationController.java`.
- `service/analysis/AnalysisService.java`, `service/optimization/OptimizationService.java`.
- `service/regression/RegressionService.java`, `repository/regression/RegressionRepository.java`.
- `service/simulation/RunService.java`, `service/simulation/RunDatasetWriter.java`.

Frontend, dưới `frontend/src/`:

- `app/aeb/{page.tsx,mobo/page.tsx,mobo/new/page.tsx,mobo/pareto/page.tsx}`.
- `components/BaselineAnalysisDashboard.tsx` và `components/analysis/{AnalysisDatasetPreparation.tsx,analysisSnapshotData.ts}`.
- `components/vehicsimI18n.ts`, `services/vehicsim.ts`, `types/vehicsim.ts`.

Worker: `worker/run_xosc.py`. Không sửa hai shared header đã làm ở lượt trước.
Mở rộng test hiện có: AnalysisService/OptimizationService/OptimizationEvidence,
RegressionEvidence/MainFlowMysql/CarlaResultSubmission/RunDatasetWriter,
`M1DConsumerProbe` (chỉ cập nhật constructor), ba frontend workflow test và worker
`test_run_xosc.py`. Không tạo script test mới.

Schema: sửa `database/mysql/01_schema.sql`; chỉ thêm một file cần thiết:
`database/mysql/migrations/023_2026-11-26_regression-frozen-seeds.sql`.
Cập nhật các hướng dẫn/contract hiện có (AGENTS, CLAUDE, analysis-metrics-contract,
database-schema, mobo-architecture), không thêm tài liệu trùng lặp.

**DB cũ cần được nhóm sao lưu và áp migration 023 trước verification nhiều seed.**
Audit chưa áp migration vào DB nhóm. Migration chỉ thay một UNIQUE, không sửa/xóa
row cũ. Schema mới và đường nâng index cũ → 023 đã được chạy trong test MySQL.

## 4. Kiểm chứng và giới hạn

| Kiểm tra | Kết quả |
|---|---|
| Java toàn bộ, gồm ba suite MySQL cô lập | Đang chốt kết quả lần chạy cuối sau sửa fixture; sẽ cập nhật ngay bên dưới. |
| MainFlowMysqlTest qua HTTP/JWT/transaction/Redis/MySQL | PASS: bốn variants; baseline ON/OFF và seed thứ hai thực thi bằng Java; seal tám ON run; tạo thêm baseline repetition sau seal; campaign vẫn dùng đúng bốn source tối ưu; hai trial INITIAL_DESIGN/ACQUISITION; bốn cặp validation đúng ID/seed; duplicate select dùng lại test; Reviewer Accept; chặn checksum sai, outsider và baseline cũ; kiểm recovery. |
| FA MySQL persistence và DB adapter | PASS: 10 + 7 ca, gồm original result/collection, report/handoff byte roundtrip, checksum, scope, concurrency/dedupe, missing member, rollback và reload service. Dữ liệu CARLA là JSON có sẵn, không phải chạy CARLA mới. |
| Worker | 101 PASS, không skip, bằng venv kiểm thử có sẵn và Java bridge thật; Ruff 0.16.0 PASS. |
| Frontend | ESLint, TypeScript, production build PASS; 74 unit + 13 Analysis browser suite và MOBO workflow PASS. Browser dùng HTTP fixtures, không dùng làm bằng chứng backend/CARLA. |
| UI | Kiểm desktop/mobile 1366/390/320 px, source/digest pinning, stale/error/retry, response cũ, submit lặp, navigation đúng regression; giữ UI mới. Không truy cập Figma. |

Không thay đổi canonical formula, simulator identity, constraint ADR-044/055,
không tự Accept, không dùng label nguyên nhân lỗi làm GP target, không tạo số 0
cho missing metrics. Giá trị vật lý/diagnostic thiếu authority vẫn UNKNOWN.
Nguồn V3 >1 MiB hoặc collection >16 member vẫn bị reject theo ADR-067;
chưa tự nới budget hoặc chia nhỏ cohort để đổi nghĩa nghiệp vụ.

Đã đọc hướng dẫn root/scoped, handover package/naming, ADR-040/043/044/055/065/067,
hợp đồng chỉ số/handoff V3, kế hoạch 20/10, CARLA local, schema/migration/từ điển,
source/controller/service/repository/core/worker và frontend API/UI tương ứng.

Log/ảnh chỉ ở `target/` hoặc `data/` được gitignore. Next kiểm thử đã dừng.
Bằng chứng quan trọng được tổng hợp tại đây; artifact runtime của người dùng,
result.json/handoff.json đang sử dụng, backup và dữ liệu có sẵn không bị xóa.
Automatic approval review từ chối dọn `target/e2e-flow-audit/python-tools` và
`data/e2e-audit-frontend-{mobo,analysis}` với lý do `blocked by policy`, kể cả
phương án xóa từng file của tooling. Các thư mục tạm này còn lại, không vào Git.
Không commit/push, không dùng hoặc sửa DB của nhóm.