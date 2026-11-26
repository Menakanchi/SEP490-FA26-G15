# Kiểm chứng Failure Analysis V3 → MOBO — 26/11/2026

## Sửa lỗi capacity khi hoàn tất run — 26/11/2026

- **Đã sửa nguyên nhân được báo:** producer nội bộ lưu `result.json` không còn
  cạnh tranh hai suất xử lý dành cho API Failure Analysis. API vẫn giữ giới hạn;
  source và trạng thái COMPLETED vẫn được lưu cùng transaction.
- Thử đồng thời bằng MySQL cô lập còn phát hiện deadlock khi nộp nhiều kết quả qua
  API tương thích. RunService thử lại transaction sau xung đột khóa tối đa bốn lần,
  không chạy lại mô phỏng; chỉ phát sự kiện sau khi lưu thành công.
- **Kiểm chứng:** 88 ca chạy, 87 PASS, 1 SKIP (external collection), không lỗi.
  Bao gồm 16 producer khi cả hai suất FA đang bận; bốn lượt nộp đồng thời với MySQL;
  bốn lượt worker simulator động học hoàn tất đồng thời khi hai suất FA đang bận,
  kiểm nguyên bytes trong DB và tiếp tục luồng FA/regression. Chưa chạy lại baseline
  40 lượt, RT-003 hay CARLA thật trên môi trường nhóm.
- **Giới hạn còn lại:** lỗi lưu DB kéo dài hoặc lỗi dữ liệu vẫn rollback và có thể
  làm run FAILED. Chưa có staging bền và cơ chế khôi phục result sau restart để
  tách trạng thái mô phỏng khỏi trạng thái lưu; không đánh dấu COMPLETED khi thiếu
  source DB. Các run đã FAILED trước bản sửa chưa được tự phục hồi.
- Source sửa: `FailureAnalysisService.java`, `RunService.java`; mở rộng các test
  `FailureAnalysisServiceTest`, `FailureAnalysisDatabaseMysqlTest`, `MainFlowMysqlTest`,
  `CarlaResultSubmissionTest`. Không thay DB nhóm, không commit/push.

**Bốn blocker đã được triển khai và kiểm chứng tích hợp với HTTP/JWT, MySQL 8.4,
Redis 7.4 và simulator Java `vehicsim-kinematic-1.4`.** Luồng DB → FA V3 → handoff
DB → campaign → GP → candidate → regression đã chạy thật trong môi trường cô lập.
Không dùng fixture/mock làm target của lượt tối ưu này. **Chưa xác minh CARLA thật
hoặc triển khai/approval trên DB của nhóm.** Đợt này chỉ hoàn thiện tích hợp V3,
không thay thế kết luận kiểm chứng thực địa bằng số test PASS.

Tiếp tục working tree của `trungdam`, HEAD `7967d3aa7f088129dcfee23d2a6592bc4a7c04eb`
(đã đối chiếu remote ở đầu đợt trước). Không commit/push, không sửa DB nhóm,
không thêm bảng/migration hoặc báo cáo mới. Giữ sửa chữa Module2 → DB từ đợt trước.

## Trạng thái bốn blocker và luồng chính

| Bước/blocker | Trạng thái | Bằng chứng/phạm vi |
|---|---|---|
| Module2 result → DB → FA | PASS integration | Simulator thật của ứng dụng sinh kết quả; producer lưu toàn bộ bytes theo project/run/attempt. FA kiểm SHA, identity/config/dt và projection DB, không đọc file thay DB hoặc yêu cầu upload. CARLA mới chưa chạy. |
| Approved Context V3 | PASS implementation/integration | Người có quyền ghi rà soát selection, xác nhận phạm vi, lý do và controls ở cả hai partition. UUID/digest/reviewer/time/baseline/source revisions persist trong `analysis_results`, method `FA_V3_CONTEXT`. Service mới đọc lại được cùng context và execution. |
| Quality Policy V3 | PASS trong phạm vi canonical | Adapter cấp policy có refs tới review thực đã lưu; tái dùng ADR-040/044/055, ba objective, collision không tăng và false braking tăng tối đa 5 điểm %. Thiếu xác nhận, dữ liệu hoặc controls phù hợp đều bị chặn. Không cấp calibration/physical requirement/confirmed cause giả. |
| Approved Domain V3 | PASS implementation/integration | Snapshot catalog DB, engine bounds và review cùng project/baseline/selection; bốn mã AEB, chỉ giao hoặc thu hẹp miền hiện hành. Catalog thay đổi bị 409; campaign không thay miền đã chốt. |
| Handoff V3 → campaign | PASS integration | Đọc `fa_json_handoffs`, kiểm bytes/content digest, contract, context/currentness, report và replay. POST nhận riêng handoff ID/digest; không fallback dataset V2. |
| Sealed optimization → GP → candidate | PASS integration | Hai trial COMPLETED: INITIAL_DESIGN rồi ACQUISITION. Candidate chạy đúng source IDs/config/seed; ba aggregate canonical của trial được kiểm độc lập trước khi sử dụng cho GP. Holdout không tham gia fitting. |
| Frozen verification/regression | PASS integration | Candidate V3 kiểm trên đúng hai source holdout, regression #2 PASSED; chọn lại dùng cùng test. Provenance handoff giữ trong regression. |
| Reviewer | PASS luồng hiện hành; chưa nghiệm thu candidate V3 | Trong cùng test, Engineer Accept bị 403; Reviewer Accept candidate của nhánh V2 đổi baseline. Handoff V3 cũ sau đó bị 409. Không tự Accept candidate V3 thay người dùng. |
| CARLA thật / DB và approval của nhóm | BLOCKED/chưa xác minh | Theo phạm vi đợt này không chạy CARLA thật, không truy cập DB nhóm. Người dùng có thẩm quyền còn phải rà soát dữ liệu thật qua workflow mới. |

## Lỗi và điểm đứt đã sửa

- Runtime trước đây luôn dùng context rỗng, từ chối context_id, không có producer
  quality/domain và consumer handoff V3. Thêm hai adapter/service cần thiết, tái dùng
  kho selection và bảng JSON hiện có; không dựng optimizer hoặc hệ thống Reviewer khác.
- Selection V2 chỉ được tái dùng làm **nguồn lựa chọn/review hiện hành**. Canonical
  samples lấy từ original producer JSON trong DB; sealed V3 và campaign có contract,
  checksum, partition và provenance riêng. Handoff thiếu/sai không chuyển sang V2.
- Collection trước đây làm artifact SHA của từng run thành SHA container. Nhánh được
  duyệt nay phân tích từng original document với SHA độc lập, giữ đúng report/member binding.
- Contract provenance offline yêu cầu worker/ScenarioRunner/JAR cho cả simulator Java.
  Thêm profile DB canonical có original SHA độc lập và hash binary thực (JAR hoặc loaded
  core bytecode). Không điền hash/sidecar CARLA giả; profile offline vẫn giữ gate cũ.
  Nhãn offline trong payload có scope riêng; `runtime_consumer` chỉ rõ backend phải
  kiểm lại quyền dispatch. READY không chỉ dựa vào một cờ trong JSON.
- Campaign trước đây chưa pin V3 domain/cohort. Consumer mới kiểm lại nguồn trước
  trial/select, kiểm source của candidate và GP history, loại holdout khỏi fitting.
- Chặn sai config, timestep, telemetry/scalars, attempt, baseline, catalog hoặc bytes.
  Runner hiện đọc road_friction từ variant: khi giá trị này khác nguồn đã chốt,
  chặn replay thay vì âm thầm dùng ma sát mới. Không đổi hành vi runner bình thường.
- Context dùng chung analysis_results từng bị route dataset V2 nhận nhầm; đã lọc
  `method=IMMUTABLE_SNAPSHOT`. Lỗi V3 qua API optimization nay giữ đúng 404/409/503,
  không thành 500 chung. Cache execution có thêm version của runtime mapping.
- Frontend có bước review rõ ràng, retry cùng context, mở MOBO bằng handoff ID/digest,
  khóa source/domain và hiển thị blockers. Giữ UI và luồng V2 hiện hành.

## Bằng chứng lượt tích hợp cuối

Project=1, scenario=2, baseline=1; bốn run được chọn từ tám variants CLEAR/RAIN chạy
bằng simulator Java thật. Tập tối ưu `[29,35]`; holdout `[30,36]`, không trùng variant.
Controls được xem và xác nhận riêng; một tập V2 có ca curb-stop phanh oan bị từ chối,
không hạ gate để làm nó đạt V3.

| Run, attempt=1 | Bytes producer DB | SHA-256 nguyên bytes (đã kiểm roundtrip download và FA binding) |
|---|---:|---|
| 29 — optimization | 29.797 | `f1c33721dd4ba9693a123732c73d03b5ff729a7ebf886ffd1c350907405737dd` |
| 35 — optimization | 26.337 | `44673da9db1edde65df1cc2bc612b84b4571810f55983dc10b1b5e6981d26262` |
| 30 — holdout | 31.992 | `16ffc5f5c26a64b567d06af66d27efdef90438e423be1219393ef080207402bd` |
| 36 — holdout | 26.319 | `db9308f9cf20ccaa6c76c0860da5c7e4bd2b4ad00b29bb5130027d341e3df9c6` |

- Context: `d527e859-1912-4b7a-9fa9-07eeb5916714`.
- Handoff: `826794a9-7a7f-4339-9214-cff0df43d90e`, execution
  `b5678829-8b87-447d-a01d-9e1301ad0cf3`.
- Handoff content digest: `8242f30834c15236b457745868c48a0aa0282f843f4f61c7c1097829e88ec047`;
  SHA bytes lưu DB: `003b3b673920bda43e2c52cdff0050878d355316822374c369aec319c6d8d76b`.
- Campaign #2 lưu `objective_config_json.handoff_ref`, không có dataset_ref V2;
  sealed cohort digest `c06d5cf559a586e569a6160b9391eb3264156457fd617f45ca8c3e56be24c6f6`.
- Trial #3/#4 đều COMPLETED, objective `[10.000,0.000,9.332]`; trial #4 là
  ACQUISITION, acquisition_value=2.090762. Source code MoboEngine tạo ba GP từ
  completed trial history; consumer kiểm đúng candidate children/aggregate, test
  đối chiếu số đo DB và không có holdout IDs trong candidate training runs.
  Đây là bằng chứng fit/propose thật, không phải cam kết candidate đã cải thiện.
- Regression #2 PASSED dùng đúng `[30,36]`; retry giữ nguyên ID. Service mới đọc
  lại được context/source/handoff/projection và execution ID cũ. Chưa thử tắt/khởi
  động lại toàn bộ tiến trình đang chạy; không gộp kết quả này thành full restart PASS.

## Kiểm thử

| Kiểm chứng | Kết quả |
|---|---|
| Java toàn bộ, build/output cô lập từ source | 1.878 ca: **1.874 PASS, 4 SKIP**, 0 failure/error. Có MainFlow V3, physics, Golden18, GP và regression. |
| Hai suite MySQL JSON | 10 DatabaseMysql + 11 FailureAnalysisMysql PASS trong lượt toàn bộ: bytes, transaction rollback, checksum, scope, dedupe/reload, missing/old attempt. |
| Lượt cuối sau guard contract/catalog/cache | **48/48 PASS**: MainFlowMysqlTest, FailureAnalysisServiceTest, OptimizationServiceTest, AnalysisSnapshotTest. |
| Negative/retry | Thiếu context/review/domain, false-braking control, sai project/checksum, đổi revision/attempt/config/dt/friction/catalog/baseline bị chặn; context/execution/select retry giữ ID. Offline fixture tự nhận DB profile vẫn không vượt gate. |
| Frontend | Production build, TypeScript và toàn bộ ESLint PASS; 76 unit tests PASS; MOBO V2/V3 và 17 nhóm diagnostic browser PASS. Browser dùng HTTP fixtures, không phải bằng chứng DB/GP/CARLA. |
| Bốn SKIP | Một external CARLA collection, hai authorized exports và một full Python parity grid chưa được cung cấp/bật; không tính là PASS. |

Lệnh Java dùng Maven offline với POM/output tạm trong target, cùng source/resources
thật và Surefire working directory tại repo, tránh class cache IDE. MySQL/Redis dùng
container --rm, nhãn riêng `codex.audit=v3-20261126`, cổng 13316/16379, không mount
volume nhóm. Đã thu bằng chứng ở trên; container và POM/build/log tạm của đợt này
được dọn. Giữ các thư mục/fixture đã có, original business result/handoff và dữ liệu
thành viên khác. Không dùng cấu hình datasource của nhóm để chạy test.

## Source thay đổi và giới hạn còn lại

- Backend mới: `service/analysis/FailureAnalysisHandoffService.java`,
  `FailureAnalysisHandoffAdapter.java`.
- Backend sửa: `FailureAnalysisController`, `OptimizationController`,
  `AnalysisViewService`, `FailureAnalysisService`, `OptimizationService`,
  `RunService`, `RunDatasetWriter`, `FailureAnalysisJson`.
- Core sửa contract/adapter: `RestJsonAnalysis`, `MoboHandoffBuilder`,
  `HandoffSchemaValidator`. Không sửa công thức vật lý, GP/qEHVI hay objective.
- Frontend sửa mobo/new và mobo pages; BaselineAnalysisDashboard,
  AnalysisDatasetPreparation, FailureAnalysisV3, failureAnalysisV3Data,
  vehicsimI18n; services failureAnalysisV3/vehicsim và types/vehicsim.
- Mở rộng test hiện có: MainFlowMysqlTest, OptimizationServiceTest,
  AnalysisSnapshotTest, MoboHandoffBuilderTest, analysis-v3.mjs, mobo-workflow-ui.mjs.
  Giữ sửa DB SSOT/controller và các test/constructor của đợt trước. Chỉ cập nhật
  README module, ADR-067, database-schema hiện có cùng báo cáo này; không sinh báo cáo khác.

**Kết luận:** bốn điểm đứt kỹ thuật V3 đã nối và qua integration trên dữ liệu thực
của simulator Java. Chưa thể tuyên bố luồng CARLA thực địa đã thông suốt hoặc hệ
thống hết lỗi. Physical calibration/clock/requirements thiếu vẫn UNKNOWN; workflow
review canonical không cấp chứng nhận nguyên nhân vật lý hoặc an toàn. Dữ liệu thật
của nhóm chưa được review bằng context mới; run lịch sử thiếu producer source phải
chạy lại producer, không backfill JSON từ file/telemetry. Giữ giới hạn 1 MiB/result,
2 MiB/collection, 16 members; vượt giới hạn phải báo lỗi, không cắt hoặc thay dữ liệu.
