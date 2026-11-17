# Bàn giao kỹ thuật Admin và Analysis — 17/11/2026

Đối chiếu source tại `9d315bb` trên `chuvv`. Phase 20 chỉ cập nhật tài liệu và chạy QA;
không đổi API, schema, quyền, công thức, calibration hoặc dữ liệu lịch sử.
[Final QA và phase matrix](../exec-plans/completed/2026-11-17-admin-analysis-phase-20-handover.md)
là nguồn kết quả thực thi; tài liệu này là bản đồ bảo trì, không phải chứng nhận an toàn.

## 1. Phạm vi và kiến trúc

Next.js 16 / React 19 → REST Spring Boot Java 21 → MySQL; Redis cho OTP/hạn mức.
Nghiệp vụ ở `com.vsos.backend`, lõi thuần JDK ở `com.vsos.core`.
Java `RunService` dùng cùng Simulator/AebStack/Evaluation cho bộ động học và adapter CARLA;
worker Python chỉ đọc/áp trạng thái CARLA, trao đổi lõi qua `vsos-bridge/1`.
Bộ xuất `.xosc` ở Java `core/xosc/XoscExport`; không khôi phục FastAPI/Celery/Forge.

Luồng có thật: kịch bản → baseline → Analysis → candidate → regression → quyết định.
Admin quản trị tài khoản/workspace/reference, không có dashboard riêng và không tự tạo run.
MOBO/optimizer có code riêng ngoài phạm vi QA tính năng 20 phase này; không suy readiness của nó
từ Admin/Analysis tests hoặc từ mô tả cũ “chưa triển khai” trong tài liệu tổng quan.

## 2. Admin: entry points và bất biến

| Trang | Component chính | Hành vi hiện có |
|---|---|---|
| `/admin` | app/admin/page.tsx | Redirect `/admin/users`; không khôi phục Overview |
| `/admin/users` | AdminUsersTable, AdminUserEditor, adminUsersQuery | List/search/filter/sort/page, create/edit/review, trạng thái, role và self/dependency guards |
| `/admin/workspaces` | AdminWorkspacesTable, AdminWorkspaceEditor | List/search/page/create/reassign Manager; archived chỉ xem |
| `/admin/tech-references` | AdminReferencesTable, AdminReferenceEditor, adminReferences | List/search/type/status/page, metadata, create/edit/bật-tắt; DECIMAL dạng string, URL http/https |

Các component trên ở `frontend/src/components/admin/`. AdminShell dùng AuthGate, ba navigation links,
breadcrumb/skip link/mobile menu; CSS Modules dùng token Admin có scope, không đổi global tokens.
Table scroll trong region riêng; native dialog qua useAdminDialog có inert background, Tab/Escape,
scroll lock, dirty/review/busy và return focus. Chiều cao ≤480px cho cả dialog cuộn để tiếp cận form/footer.

Search là submit Enter/nút Tìm, không gọi API theo từng phím: **không có debounce và không cần
thêm debounce để gọi là đã tối ưu**. URL giữ query đang áp dụng; input có draft riêng.
List/detail dùng request key, live/sequence và pathname/query guard để bỏ response cũ;
query chuẩn hóa page 1..100000, page size 10/20/50/100. Refresh sau save giữ filter,
focus thông báo đúng bản ghi; mutation lỗi giữ draft, không báo success hoặc tự retry khi chưa rõ kết quả ghi.
Submit dùng ref lock ngoài disabled UI; form không autosave và không reset payload khi API lỗi.

Admin **không quản lý workspace members**. Manager dùng WorkspaceController:
member-candidates chỉ email đúng hoàn toàn của EXPERIENCER, có hạn mức riêng;
add gán ENGINEER/REVIEWER, duplicate và dependencies do service kiểm. Không thêm UI member cho Admin.

## 3. API và quyền truy cập

Tất cả đường dẫn sau có tiền tố `/api/v1/vehicsim` và yêu cầu đăng nhập.

| Contract | Source / quy tắc |
|---|---|
| `/admin/{users,workspaces,tech-references}` | GET list/detail, POST create, PUT update; AdminController/System AdminService/AdminRepository; requireAdmin + limitWrites cho writes; không DELETE |
| Admin list | q, status, role, sort, page, page_size; role của References là loại tài liệu, không phải role tài khoản |
| `/workspaces/{id}/members`, `/member-candidates` | WorkspaceController/WorkspaceService; Manager quản lý đúng workspace, không gộp với `/admin/workspaces` |
| `/analysis/runs`, `/analysis/runs/{id}` | AnalysisService dashboard/inspection; query scope và status, inspection có detail khi hoàn tất |
| `/failures`, `/runs/{id}`, `/runs/{id}/playback` | AnalysisViewService list/detail/playback; runBundle tra id **và** project_id; unfinished/missing có gate |
| `/runs/{id}/bundle`, `/runs/{id}/xosc`, `/runs/{id}/carla-data` | Source/artifact của run; file CARLA theo whitelist, không cho client chọn path tùy ý |
| `/analysis/selections`, `/analysis/datasets/{id}`, `/analysis/datasets/{id}/handoff` | Dataset v2, tách optimization/validation, giữ ca an toàn, revisions/digests; GET handoff không tự chạy optimizer |
| `/regression`, `/recommendations/{id}/decision` | RegressionService/ReviewDecisionService: role/header/membership/quota, cùng seed/xe/simulator, baseline còn hiệu lực |

`ProjectAccess` resolve một lần/request. EXPERIENCER theo project cá nhân có owner check;
REVIEWER theo `ReviewerScope` membership workspace và header `X-VehicSim-Project`.
Reviewer được chạy regression (ADR-049), không có scenario/candidate/baseline write độc lập;
Accept cần test PASSED, baseline còn hiệu lực, lý do/xác nhận và không tự duyệt.
Project/workspace archived chỉ đọc. ADR-048 còn Proposed dù code đã triển khai; không đổi trạng thái ADR.

**TD-30 còn mở:** ADMIN/ENGINEER/MANAGER dùng firstActiveTeamProject qua ProjectScope,
không cách ly mọi Engineer theo workspace membership. Không triển khai nhiều workspace độc lập
với giả định membership đã bảo vệ toàn bộ dữ liệu kỹ thuật. Đây là giới hạn contract được xác nhận
qua code, không phải phát hiện bypass mới đã tái hiện trên live deployment.

Đổi role/trạng thái/email: AdminService tính revoke → AdminRepository tăng auth_version,
disconnect chat; JwtAuthenticationFilter tra user hiện tại, JwtService kiểm av/enabled/password fingerprint.
Frontend AuthContext đọc `/auth/me` khi khôi phục và xóa session khi API trả 401.
Menu đang mở có thể giữ role cũ đến request bị từ chối/reload; chưa có push đồng bộ role mọi tab.
Code/unit xác nhận chuỗi xử lý, chưa có QA hai tài khoản + JWT/MySQL thật trong Phase 20.
Frontend guard không thay authorization backend.

## 4. Analysis: data flow và component

`/analysis/failures` → BaselineAnalysisDashboard → AnalysisOverview / RunExplorer /
FailureExplorer / DatasetPreparation. Context scenario/filter được đưa theo link/query.
`/analysis/failures/[runId]` → analysisInspection → AnalysisService.inspection →
AnalysisViewService.failureDetail. Detail chứa Summary, Telemetry, Classification và RunEvidence.
`/[runId]/playback` tải playback riêng, dùng cùng timestamps đã ghi.

RunService.persist lưu scalar và telemetry_json → read services chọn trường nguồn → JSON → helpers
frontend → rendering. Không tính lại objective/threshold ở frontend. Shared golden test bỏ qua
RunService.persist/MySQL/HTTP bằng Row mock; không gọi đó là toàn pipeline E2E.
Detail và Playback kiểm run_id đúng URL, request key/cleanup bỏ response cũ. Missing validity
không cấp badge SAFE; recorded frames vẫn xem được nếu còn hợp lệ.

Các helpers chính trong `frontend/src/components/analysis/`:
analysisMetricFormat, analysisClassificationData, analysisMetricExplanationData,
analysisEvidenceData, telemetryChartData, playbackClockData, playbackPresentation.
Code số đo: `core/simulation/Simulator`, LeadVehicleSimulator, CarlaSession, RecordedTelemetry;
luật chấm: `core/evaluation/Evaluation`, AnalysisMetrics. Đọc [metric contract](analysis-metrics-contract.md)
trước khi thay mapping hoặc glossary.

## 5. Metric glossary và provenance thực tế

| Số đo / field nguồn | Đơn vị / chuyển đổi | Điều kiện và giới hạn |
|---|---|---|
| Frame.ego_v → motion.ego_speed_mps | m/s; UI km/h nhân 3,6 **một lần** | telemetry.speed_kmh đã được backend đổi/làm tròn 2 số, không nhân lại |
| Frame.ttc → telemetry.ttc / motion.ttc_perceived_s | s | Perceived TTC, không lấy ttc_gt thay khi thiếu |
| Frame.ttc_gt → motion.ttc_gt_s | s | GT mô phỏng; CP theo gap/ego speed khi conflict, CCR theo closing speed; không áp CP formula cho CCR |
| metrics.min_ttc_s | s, core thường 3 số lẻ | Collision core có thể lưu 0; không suy timestamp argmin nếu API không có |
| ego_x, target_x/y; crossing_distance_m | m | crossing_distance=max(0,crossing_x−ego_x), không phải radar range; target_vx/relative speed chưa là canonical field riêng |
| first_detection_t / first_detection_distance_m | s / m | Timestamp tuyệt đối theo run và khoảng tại phát hiện; thiếu giữ null |
| metrics.aeb_activation_t / stage DECISION.decision_t | s | AEB decision latch, không chứng minh phanh vật lý tác dụng |
| metrics.brake_onset_t / stage CONTROL.brake_onset_t | s | Mốc controller ghi; không có measured applied/decel-onset độc lập trong API |
| stage CONTROL.response_time_s ← DB braking_response_time_s ← braking_latency_s | s, duration | brake_onset−decision; không biến duration thành timestamp để seek |
| decel_cmd / brake pedal | Chưa có numeric field canonical trong Analysis | Không suy % pedal từ ego_a hoặc aeb boolean; command không bằng effective braking |
| motion.ego_accel_mps2 / jerk_mps3 | m/s² / m/s³, có dấu | RecordedTelemetry lấy ego_a, jerk Δa/Δt thực; thiếu/duplicate không nối qua; không thay objective RMS |
| max/mean_deceleration_mps2 | Độ lớn giảm tốc dương m/s² | Khác signed acceleration và available limit; CARLA DecelMeter là speed-difference/window/clamp, không phải raw IMU |
| raw metrics.decel_available_mps2 | m/s² | Model/config limit; CARLA current format min(AEB, xe, μg, full-brake measured); không phải đo lực mỗi tick |
| metrics.stopping_distance_m | m | Quãng từ onset tới frame cuối **cộng phần ngoại suy** v_last²/(2a_available); không mặc định là đo đến dừng |
| metrics.impact_speed_mps / impact_speed_kmh | Ego m/s / km/h backend 1 số lẻ | Chỉ khi va chạm; không phải relative vector. Không collision: số đo null; aggregate valid mới đóng góp 0 |
| metrics.min_distance_m | m | Scalar mô phỏng/collision 0; không có argmin timestamp riêng để tạo marker |
| metrics.rms_jerk_mps3 | m/s³, core 3 số lẻ | Nominal dt từ onset tới cuối, có acceleration trước onset; no-brake null; không tính lại từ chart |

Objective hiển thị 3 số lẻ, số rất nhỏ dùng scientific để không thành 0 giả. Formatter bỏ
NaN/Infinity/sai kiểu và số âm ở metric không âm; không xóa dấu acceleration/jerk.
Backend rounding đã mất precision thì UI không thể phục hồi. Source raw được giữ trong Evidence;
rounding hiển thị không sửa payload hoặc giá trị dùng trong calculation.

`SIMULATOR_RESULT` và `SENSOR_RECOMPUTED` là hai nguồn khác nhau. Sensor evaluate bỏ warmup
0,5s, đoạn collision và invalid samples theo TelemetryMetricsService; không ghi đè canonical objective.
`evaluation_version = adr040-stored-aggregation/1` là version tổng hợp hiện hành, **không phải**
immutable rule/build/calibration version của run lịch sử (TD-59).

## 6. Taxonomy, evidence và playback

Backend hiện phát năm mã: COLLISION, FALSE_BRAKING, MISSED_BRAKING, LATE_BRAKING, NEAR_MISS.
UI dùng nhãn theo luật, không tự threshold/classify. Outcome, technical status, verdict và
failure_type là các trục riêng. Completed/valid/PASS nhưng failure_type null vẫn “API chưa có phân loại lỗi”.
Collision → FAIL là rule backend hiện hành; không tự chứng minh AEB gây lỗi hoặc có thể tránh được.
No collision/decision command không chứng minh AEB success/effective braking.
INEFFECTIVE_BRAKING, avoidability/counterfactual, confirmed cause và lifecycle inconclusive theo từng khâu
chưa có contract riêng; fallback UI thiếu dữ liệu không phải classifier mới (TD-58).

Evidence giữ source field, raw value, unit, stage và link mốc thật. `evidence_policy` là
RULE_BASED_HYPOTHESIS_NOT_CAUSAL_PROOF; fixed confidence score không là xác suất đã hiệu chuẩn.
Thiếu chain/stage/provenance không biến thành kết luận khâu đạt. Link thời gian chỉ dùng timestamp thật,
giữ context/run ID; derived duration/aggregate không có timestamp thì không tạo link giả.

Charts dùng timestamps từng mẫu, tách TTC/speed axes, không downsample hoặc nội suy tín hiệu.
Nominal dt hỗ trợ gap policy ở Detail; Playback chưa có cadence/loss metadata để xác nhận mọi gap.
Playback clock dùng elapsed requestAnimationFrame, một loop, pause khi tab ẩn; đổi run/seek/unmount
có cleanup/key guard. Frame lookup theo mẫu đã ghi, duplicate time giữ cảnh báo ambiguity.
Play/Pause/Seek/Restart/speed/end không sinh thêm physics hoặc event.
TD-60: shared scene còn pedestrian-centric với CCR/annotation mobile; số đo chữ không khắc phục
toàn bộ hiểu sai geometry. TD-61: canonical/controller và recorder/camera chưa có verified t0 mapping.

## 7. Phân hạng dữ liệu mô phỏng

| Loại | Bằng chứng hiện có | Cách trình bày |
|---|---|---|
| Theoretical Reference | Công thức/giả định trong core và giải thích theo category/profile | Tham chiếu mô hình, không phải phép đo xe |
| Calibrated Kinematic Model | Có configurable vehicle và deterministic parity tests; chưa đủ hồ sơ fit/validation từ đo thực tế | Không gắn nhãn “đã hiệu chuẩn” chỉ vì tham số khớp CARLA/DB |
| CARLA Simulation Result | `.xosc` v5, CARLA 0.9.16 / ScenarioRunner 0.9.16; ADR-051 có báo cáo đo e-tron ngày 08/11 | Mô phỏng; calibration mô-men có phạm vi, TD-17 vẫn mở |
| Real-world Measurement | Phase 20 không tìm được dataset đo xe thật có lineage đáp ứng kiểm chứng này | Chưa xác minh; không gọi sensor CARLA là real-world |

CARLA baseline phải giữ seed, variant, xe/physics, profile/source, weather/friction, dt và artifacts;
không ghép xosc1..4 với xosc5 hoặc CARLA với động học. Town04 road40/lane−4 và step0,01s là
cấu hình `.xosc` hiện hành, không thay metadata run cũ. E-tron xosc5 đã nối 1800 N·m,
full-brake metadata; 4 xe khác, tốc độ thấp, mặt đường trơn và perception GT còn giới hạn.
[ADR-051](../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md) Accepted không đóng toàn bộ TD-17.
Plan công thức CARLA ngày 11/11 còn active; quyết định/thử mưa và runtime chưa đủ bằng chứng hoàn tất.
Phase 20 không chạy CARLA hoặc calibration mới; bằng chứng ADR là lịch sử, không phải lần đo lại.

## 8. Chạy tests và cấu hình QA

Node.js 22, JDK21; Python ≥3.10 cho unit adapter (máy Phase20 dùng3.15; CARLA Windows cần3.12 riêng).
Xem [CLAUDE](../../CLAUDE.md) cho Docker/MySQL/Redis và migrations; không dùng down -v.
Không sửa `.env`, tài khoản hoặc DB cá nhân để chạy QA. NEXT_PUBLIC_API_URL là cấu hình lúc build;
build với backend khác thì phải build lại. Fixture harness không dùng tài khoản thật.

Từ repo root: `.\mvnw.cmd -B clean test`, sau đó `python -m pytest worker/tests -q` và
`python -m ruff check worker` nếu tool đã cài trong môi trường QA. Worker bridge cần target/classes;
không clean Maven song song với bridge tests đang dùng classes đó.
MAVEN_OPTS `-Xmx512m -XX:ActiveProcessorCount=2` đã dùng cho lần QA này.

Trong frontend: npm.cmd run lint; npx.cmd tsc --noEmit; npm.cmd run build.
Chạy Admin/Analysis repeat2 theo [tests README](../../frontend/tests/README.md), app/browser local riêng;
outputs dưới data gitignore, không dùng artifact cũ thay kết quả mới. Không thêm framework/dependency.
Java AnalysisApiContractTest so golden reviewed; không auto-regenerate khi thất bại.
Full parity1296 cần external fixture và property `vsos.parity.full`; default SKIP không tính PASS.

## 9. Troubleshooting và bảo trì

- Build SecurityFatalError: giữ log lỗi và audit, thử lại đúng lệnh nếu native tool cho phép;
  retry thành công không có nghĩa hết advisory. TD-62 cần dependency change riêng và regression đầy đủ.
- Analysis output bị chặn: dùng absolute path dưới repo/data, không frontend/data; giữ log lần thất bại.
- API error sau mutation: kiểm danh sách/persistence trước retry; không tự autosave hoặc fake success.
- 401 sau đổi role/email/lock: session cũ bị thu hồi; login lại, không dùng frontend role để bỏ gate.
- 403/404: đối chiếu role/project header/membership, archived và context; không tự đổi project để né lỗi.
- ID response khác URL: giữ error, không render evidence; kiểm producer và request scope trước khi sửa guard.
- Java class hỏng: dừng đúng tiến trình build/IDE liên quan rồi clean; không reset Git hoặc sửa golden để che lỗi.
- Browser không chạy: chọn Edge/BROWSER_EXECUTABLE hoặc provision Playwright Chromium ở môi trường QA;
  fixture PASS không chứng minh persistence/authorization trong deployment.

Trước QA/staging cần môi trường dev riêng, dữ liệu thử có quyền dùng và hai tài khoản/role:
Admin create/edit → refresh → verify DB/session invalidation; Manager member/exact-email/duplicate →
Reviewer scope; Scenario/baseline → overview → detail/evidence → playback → regression decision guards.
Ghi actual requests/IDs/seed/source và dọn chỉ dữ liệu thử thuộc phiên. Nếu thiếu môi trường,
ghi NOT RUN; không gọi kiểm fixture là full E2E.

Ưu tiên bảo trì: TD-30 trước nhiều workspace độc lập; TD-58/59/60/61 trước kết luận chẩn đoán
hoặc đồng bộ sensor; TD-17 trước mở rộng calibration; TD-62 dependency; TD-57 browser CI.
[Tracker hiện hành](../exec-plans/tech-debt-tracker.md) giữ ID gốc, Final QA ghi severity/owner/status;
không tạo bản sao backlog hoặc tự gán owner/deadline. Sau bàn giao dừng để review/commit thủ công.
