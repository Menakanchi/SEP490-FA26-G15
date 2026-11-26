# 09 — Backend blockers và dependencies

Ngày25/11/2026. Owner dưới đây là **vai trò/module chịu trách nhiệm**, chưa phải người được giao ticket và chưa được cấp quyền implement trong audit này. Chỉ đọc dependency module khác, không sửa hoặc chạy chúng. Source evidence IDs/capability matrix ở [01](01_BACKEND_CAPABILITY_AUDIT.md), exact routes/DB ở [02](02_API_AND_DATABASE_MAPPING.md).

## 1. Các blocker phải giải quyết trước khi hứa web V3.1 end-to-end

| ID / mức ưu tiên | Khoảng thiếu / bằng chứng source | Chặn tính năng gì? | Owner | Điều kiện unblock / kiểm chứng cần có |
|---|---|---|---|---|
| B01 P0 | JsonInputAdapter/FailureAnalysisInput có code; AnalysisController không có import/analyze route hoặc gọi core | chọn/upload result/collection trên web | Module3 backend + module2 producer phối hợp | authenticated/project-bound intake, resource limits/error schema/hash/identity/partial-manifest contract; real producer fixtures và negative HTTP tests; không viết parser physics thứhai |
| B02 P0 | Không backend orchestrator gọi DiagnosticReport; chỉ OfflineDiagnosticAnalysis | “Chạy phân tích” thực, status/retry/cancel nếu có | Module3 backend | chốt sync hay async; run_key/offline identity/resource lifetime/operation IDs; same core invocation; job lifecycle nếu async; duplicate/retry semantics; no writes historical evaluation |
| B03 P0 | Legacy FailureDetail/Map không phải report envelope V3.1 | physical outcome, functional candidates, sufficiency, objective explanation/dossiers V3 trên web | Module3 backend/contracts | typed/versioned resource boundary, source registry/refs/clocks/reasons/digest, archive compatibility + source ownership; endpoint tests dùng core thật; không translate legacy chain thành new diagnosis |
| B04 P0 | CLI xuất files nhưng chưa report/handoff/compatibility REST resource/storage/download | tải DiagnosticReport/M1C Handoff từ web | Module3 backend | report identity, per-project permissions, immutable snapshot/currentness, download format/size/content disposition/error handling; no path disclosure/arbitrary filesystem access |
| B05 P0 | GET datasets/{id}/handoff trả **analysis-dataset/v2**, MoboHandoffBuilder cần independently pinned selection/quality/baseline/member inputs | xuất operational M1C handoff đủ binding qua web | Module3 backend + module4 contract owner | adapter từ authorized freeze snapshot sang builder inputs với source refs/digests/quality policy/domain; no invented canonical sample/baseline score; verify partition/run identity/version; preserve unknown |
| B06 P1 | AnalysisService.freeze L186+ hardcode impact EGO_SPEED_NOT_RELATIVE; current ADR-055 profiles relative | xác nhận provenance và copy impact cho snapshot mới | Module3 metric/backend owner, module2 producer hỗ trợ vintage evidence | owner xác định per-profile metadata rule/archive handling; scalar/history không đổi; version/provenance conflict tests. UI không tự sửa metadata để che conflict |
| B07 P1 | Legacy API không có đầy đủ metric producer/filter/window/calibration; frontend METHODS.rms hardcode onset/unfiltered | lời giải thích RMS chính xác theo run; stopping measured/extrapolated breakdown | Module3 backend + frontend owner, module2 cung cấp producer provenance | expose verified profile metadata hoặc conservative unknown UI; distinguish T_AEB/filter/trace window/current vs historic; no recomputation/overwrite objectives |
| B08 P0 ở execution | OptimizationRequest không dataset_id; service latest baseline by variant; proposal dùng ParameterBounds.defaults; compatibility core chỉ offline/source inspection | “MOBO chạy đúng tập này”, dispatchready | Module4 optimizer/consumer; module5 với validation execution | M2 adapter độc lập: exact frozen cohort/seed/rep identity, canonical parity, bounds enforcement, validation sealed, baseline objectives; executable tests chứng minh consumer thực thi. FE không sửa consumer |
| B09 P1 | AnalysisRun projection chỉ DB runID/variant/seed, excludesOFF và không rep/attempt; JSONcollection giữ thêm identity | collection-wide V3 dashboard/ON-OFF pair view/replicate accounting | Module3 backend + module2 | separate supported report collection boundary, no lossy conversion; expected/analyzed/blocked and grouping; retain all ON/OFF/rep/attempt without relabel legacy dashboard completeness |
| B10 P2 | Runs API không server q/outcome/global sort; failures có filter/outcome riêng; dashboard SQL fetch toàn scope rồi paginate memory | tìm toàn dữ liệu, lọc run theo outcome, hiệu năng khi project lớn | Module3 backend; frontend ghi đúng scope | giữ “trong trang” và công cụ legacy hiện tại; nếu product bắt buộc global search/filter thì contract/performance task riêng, không filter trang rồi gọi toàn bộ |
| B11 P1 | Archive GET trả v1/v2, missing handoff_ready normal; client typed v1/castv2; FE /aeb navigation chưa receiver consumption | archive/currentness UX, snapshot summary/export | Module3 frontend typed boundary + backend contract owner xác nhận | discriminate schema/read states; check handoff separately; v1 readonly no directhandoff; no falseverified/dispatch flag; preserve other projectresults caller |
| B12 P1 | outcome precedence dashboard collision-first vslegacy FP-first/detail savedraw; flags có thể conflicting | hợp nhất outcome label một nguồn “truth” | Module3 backend/evaluation owner quyết định, FE preserve source | contract test conflict fixtures + explicit authority policy/versioning; không FE reclassify hoặc thay stored outcome |
| B13 P2 | Không datasets/report-list endpoint; analysis_results statusENUM không có job lifecycle hiện hành | lịch sử job/report/snapshot browser hoàn chỉnh | Module3 backend/product | API list ownership/pagination/scope/status semantics nếu thật cần; IA hiện chưa yêu cầu page history riêng |
| B14 P1 ở scientific claims | calibration/requirement/coverage/collision authority/context có thể UNKNOWN ngay cả report hợp lệ | confirmed root cause, certified physical limit, absence⇒SAFE, verified baseline v1 | Evidence/domain reviewers + module3; calibration owner/module2 | scoped authorized evidence/policy/model certificate; UI giữ UNKNOWN, không hạ evidence gate vì UX |
| B15 P1 có điều kiện | Dashboard SELECT left-join failure/root không DISTINCT; schema cho phép nhiều failure_type/run | số run/denominator và objective membership nếu dữ liệu có nhiều failure rows | Module3 backend owner | fixture một run có nhiều failure rows, xác định intended row grain và aggregation; DB occurrence hiện UNKNOWN; FE không dedup một phía làm lệch KPI/source |

P0 trong bảng là blocker **cho lời hứa đầy đủ tương ứng**, không phải yêu cầu dừng mọi cải tiến read-only hiện có. FE-R1 và DB-based portions FE-R2/3 vẫn làm được trong task sau mà không giải B01–B05; chúng không được nghiệm thu như web V3 end-to-end.

## 2. Dependencies có thật, chỉ đọc/tái sử dụng

| Dependency | Có sẵn | Cách dùng được phép trong blueprint | Ranh giới |
|---|---|---|---|
| Module2 result producer | ADR-065 dataset, result/v1, collection/v1; export collection endpoint | giữ input mapping/source pointers; link tải file hoặc tới module2 nếu phù hợp | không sửa AEB/CARLA/calibration/RunService/producer trong audit |
| Module2 rerun/XOSC | download run XOSC, POST run/carla, trang `/analysis/carla` | secondary links/labels rõ “chạy mô phỏng” | không giả đây là analyzeV3 hoặc sửa UI module2 |
| AnalysisMetrics | stored canonical aggregator phiên bản1 | nhận response values/status/denominators | không viết lại aggregation TS, rounding hay nguồn filter |
| Auth/project/shell | bearer/project scope/role, context hooks/shared page/sidebar | giữ provider/headers/deep links và canWrite | không redesign auth/shared layout/sidebar |
| Module4 MOBO | existing engine/service/API | hiện chỉ link tới module đó; future read-only compatibility status | không tạo trial/campaign/candidate từ FA; no automatic ranges/dispatch |
| Module5 regression | incoming returnTo/compare links | giữ safe return path/exact run context | không thay verification consumer hoặc dùng validation để hint |
| Shared charts/map/UI | recorded display primitives | reuse composition và props hiện có | dependency ticket nếu shared fix vượt scope; no physics solver in visualization |

## 3. Những quyết định nhóm còn phải chốt

| Decision | Phương án / khuyến nghị thiết kế | Ai chốt / tác động |
|---|---|---|
| D01 Ưu tiên release | (A) simplify web stored baseline trước; (B) đợi core API rồi rollout full V3. Khuyến nghị A có scope label và B01–B05 tracked, không claim thay legacy bằng core | Product + module3; acceptance chia nhánh rõ |
| D02 Sync/async analysis | sync bounded request phù hợp input nhỏ; async thêm progress/cancel/storage/ownership cần thiết với collection lớn. Chọn dựa resource budget/latency thật, chưa có số đo thì OPEN_DECISION | Module3 backend/ops; FE không tự vẽ job statuses |
| D03 Report resource identity | DB-backed runID khác offline run_key/container/member pointer; resource ID riêng có thể giữ cả hai. Khuyến nghị giữ nguyên run identity trong report và xác định analysis resource độc lập khi cần | Module3 contracts/security; không dùng fake DB ID cho offline |
| D04 Provenance vintage authority | dùng recorded producer/profile evidence; không generic currentcodecopy cho history. Snapshot impact metadata mismatch cần explicit resolution/versioning | Module2 + module3; canonical scalar/history giữ nguyên |
| D05 Collision/absence/caution authority | conflicting canonical/sensor/geometry giữ song song; no-contact không tự SAFE. Approved caution/coverage/requirement policy cần owner, không UI tự chốt threshold | Domain/evidence owner; physical outcome/candidate confidence |
| D06 Baseline/currentness/partition | DB currentbaseline không tự chứng minh historicalv1; export review pin identity/digest/asof và partition authority; consumer enforcement riêng | Module3 + module4/5; handoff eligibility |
| D07 Export release scope | dataset-v2 JSON có thể từ checked REST response; Diagnostic/M1C/compatibility export đợi B03–B05. Khuyến nghị dùng filename/schema rõ, không gọi mọi loại file là handoff.json | Product + module3 + module4; tránh import nhầm contract |
| D08 Legacylookup retention | API runs chưa hỗ trợ tất cả lỗi filters/cause search; giữ advancedlegacy tool đến khi backend có equivalentcontract | Module3 backend/frontend; không bỏ nghiệp vụ đang dùng |
| D09 Archived v1 UX | read-onlycompatibility + hướng dẫn chốt lại v2, hoặc chỉ link archive khi có owner screen. Không auto-upgrade không có partition/revision evidence | Module3 + projectresults owner (read-only dependency) |
| D10 Live QA/account/browser | provision dev account/project/fixture quyền rõ trước smoke persistence; browserfixtures không chứng minh live permission/currentness | QA + backend/security owner; không dùng production data để test ghi |

Acceptable caution, physical avoidability assumptions, root-cause evidence threshold, calibration validity domain và MOBO quality policy trong [OPEN_DECISIONS](../OPEN_DECISIONS.md) vẫn còn quyền quyết định của nhóm. Audit frontend không tự đóng các vấn đề đó hoặc đổi data contract cho giao diện dễ hiểu hơn.

## 4. Điều kiện bàn giao blueprint sang implementation

Người nhận có thể triển khai local layout/refactor dựa trên các route đã xác minh, test commands và phases trong [08](08_IMPLEMENTATION_PLAN.md). Trước mở nút capability V3 phải có HTTP contract/version/errors/permissions và integration tests gọi cùng core, real exports giữ identity/null/hash. Trước dùng từ “MOBO sẵn sàng chạy” phải có consumer thực thi frozen cohort, canonical aggregation và bounds/validation isolation; validate JSON hoặc navigation không đáp ứng điều kiện đó.

Không có production code, API, DB migration hoặc MOBO integration được tạo trong bộ tài liệu này. **Dừng sau audit/blueprint; không tự triển khai FE-R1.**
