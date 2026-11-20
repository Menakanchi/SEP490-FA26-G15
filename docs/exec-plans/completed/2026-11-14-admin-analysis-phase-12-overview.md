# Admin & Analysis — Phase 12/20: Analysis Overview Dashboard Refinement

Ngày 14/11/2026. Nhánh `chuvv`, nền `ce250e2`; Phase 11 đã commit, working tree sạch khi bắt đầu.
Chỉ thực hiện Phase 12; không stage/commit/push hoặc chuyển Phase 13.

## 1. Overview hiện tại và nguồn sự thật

Route `frontend/src/app/analysis/failures/page.tsx` render BaselineAnalysisDashboard.
Chỉ `view=overview` render AnalysisOverview; runs/failures/dataset là các view khác, còn
Run Detail và Playback là route con riêng. Không gộp các component này thành một màn rồi redesign.

`GET /api/v1/vehicsim/analysis/runs` trả total/counts/objective_groups cho **toàn bộ bộ lọc**;
items chỉ là một trang, theo page/page_size. API client ở `frontend/src/services/vehicsim.ts:73`,
types ở `frontend/src/types/vehicsim.ts:863`, mapper/backend tại
`src/main/java/com/vsos/backend/service/analysis/AnalysisService.java:78/95`.
Không đổi API/type contract hoặc truy vấn backend.

Người chạy mô phỏng (Engineer/Experiencer, Admin khi có quyền) cần thấy run/seed/điều kiện và mở evidence.
Người phân tích cần phân biệt lỗi thực thi với nhãn đánh giá, thiếu trace và nguồn metric.
Reviewer/Manager đọc trong project/quyền hiện hành; Overview không thêm mutation.
Chỉ các hành động sẵn có của parent dùng canWrite; liên kết đọc evidence không cấp thêm quyền backend.

Đã đọc AGENTS.md, frontend/AGENTS.md, CLAUDE.md, frontend/CLAUDE.md, DESIGN.md,
hướng dẫn đổi package/mục 7 naming, Next installed accessibility guide;
[Phase 11 đầy đủ](2026-11-14-admin-analysis-phase-11-audit.md),
[architecture](../../vehicsim/architecture.md), [metric contract](../../vehicsim/analysis-metrics-contract.md),
[ADR-040](../../adr/ADR-040-rut-scope-4-tham-so-aeb-7-category.md),
[ADR-042](../../adr/ADR-042-loi-aeb-mo-phong-cham-diem-chuyen-sang-java.md),
[ADR-050](../../adr/ADR-050-mo-category-xe-phia-truoc-bo-dong-hoc.md),
[ADR-051](../../adr/ADR-051-hieu-chuan-phanh-carla-xosc5.md), production route/hooks/services/types và harness.
Phase 11 là đầu vào audit, không phải ủy quyền triển khai toàn bộ roadmap trong đó.

## 2. Vấn đề đã xác nhận và phạm vi lựa chọn

| ID / mức | Vị trí trước sửa | Bằng chứng / ảnh hưởng | Đã xử lý |
|---|---|---|---|
| O12-01 / P1 | AnalysisOverview.tsx:91 | Mọi CARLA đều bị ghi “vật lý phanh chưa hiệu chuẩn”, không đúng với ADR-051 e-tron; profile không đủ chứng minh calibration của mỗi run | Cảnh báo có điều kiện theo nguồn: phụ thuộc xe/profile, tổng hợp chưa xác nhận calibration và không là thực địa |
| O12-02 / P1 | AnalysisOverview.tsx:97; Phase11 F11-05 | evaluation_version thực là AnalysisMetrics.VERSION, bị gọi “Hợp đồng đánh giá” | Gọi rõ “Phiên bản tổng hợp”; không gán nó thành phiên bản luật chấm lịch sử |
| O12-03 / P1 | AnalysisOverview.tsx:12/29/87, shared ObjectiveSummary | Count nhận số phân số; objective chỉ kiểm value finite, chưa xét status/unit/sample metadata. Runtime counts/groups hỏng có thể crash hoặc gây cảm giác đủ dữ liệu | Guard cục bộ Overview; status/units/samples/finite/âm/null rõ; dữ liệu sai shape có alert, không empty |
| O12-04 / P2 | Overview chỉ có aggregate/KPI | Không run identity và evidence link trực tiếp; cần đổi view rồi mới mở chi tiết | Bảng gọn tối đa 5 items của trang API hiện tại, ghi rõ page và tổng scope; links detail/telemetry/evidence/playback |
| O12-05 / P2 | Loading và giải thích kết quả | Loading rất ngắn so với nội dung; collision/count dễ bị đọc như kết luận lỗi | Reserve 340px khi loading; nói rõ phân loại theo luật, collision chưa chứng minh AEB lỗi, command khác deceleration |
| O12-06 / P1 kiểm thử | analysis-redesign.mjs:846/852 trước sửa | Phase11 suite FAIL vì tìm menu Analysis cũ; shell dùng nút Menu chung với breakpoint lg | Assert nút Menu hiện tại, expanded/visible/Escape/return focus/navigation, không khôi phục DOM cũ |
| O12-07 / P1 presentation mới | Bảng run trong lần QA đầu | Fixture RUNNING vẫn mang impact cũ; không nên trình bày như kết quả hoàn tất | Chỉ hiển thị impact khi status=COMPLETED và backend outcome=COLLISION; số khác/null/âm không thành 0 |

P0: không phát hiện lỗi mới đủ bằng chứng trong phạm vi UI này.
O12-01 được test RED trước sửa: harness dừng tại assertion cảnh báo hiệu chuẩn, exit1;
artifact `baseline.log` và 5 ảnh trước sửa. O12-03 được kiểm bằng fixtures sai unit/status/count/shape,
không tái chấm hoặc sửa công thức backend.

Không triển khai F11-01/02/03 evaluator, F11-04 trace, F11-06 cảnh CCR của Run Detail/Playback,
F11-07 manifest hoặc calibration research. TD-58/59/60, TD-53/54 còn nguyên.
Gỡ TD-61 vì regression menu đã sửa và toàn suite Analysis chạy qua; giữ bằng chứng trong báo cáo này.

## 3. Information architecture trước/sau

| Thành phần | Giá trị / dữ liệu đầu vào | Quyết định |
|---|---|---|
| Phạm vi / bộ lọc parent | Scenario/AEB/status/environment từ URL/context, cùng scope API | Giữ controls và logic. Overview nhắc rõ tổng hợp toàn bộ bộ lọc, không một run riêng lẻ |
| 4 KPI | total, counts.SAFE/COLLISION/FALSE_BRAKING | Giữ số lượng/card; bổ sung “nhãn theo luật”, không thêm KPI confidence/severity |
| Run evidence preview | items của trang hiện tại, không phải toàn bộ dataset | Bổ sung một bảng kỹ thuật, không card/widget trang trí; giới hạn 5 dòng, mở danh sách đầy đủ giữ URL |
| Outcome distribution | counts toàn scope, trùng một phần KPI nhưng giúp đọc đủ các loại còn lại | Giữ; đổi heading/ghi chú cho đúng nguồn và giới hạn kết luận |
| Technical/data states | ERROR/TIMEOUT/CANCELLED/INCOMPLETE/NOT_FINISHED | Giữ tách khỏi outcome AEB; không coi missing là SAFE |
| Objective groups | baseline/xe/profile/dt identity và 3 objective đã lưu | Giữ nhóm, CARLA trước, details và filter profile; renderer mới chỉ dùng trong Overview |
| Phiên bản/nguồn/cảnh báo | aggregation version, simulator profile, sample metadata | Sửa nghĩa nhãn/điều kiện áp dụng; không suy actual calibration hay rule version |

Thứ tự mới: scope → KPI → run và evidence → phân bố nhãn/trạng thái kỹ thuật → objective theo nhóm.
Các route/shared dashboard, bố cục shell và typography/tokens hiện hành được kế thừa.
Không đổi kích thước sidebar/header/breakpoint chung, không thêm chart/gradient/animation/dependency.

## 4. File thay đổi và lý do

| File | Thay đổi |
|---|---|
| `frontend/src/components/analysis/AnalysisOverview.tsx:25` | Guard response/states; giải thích nguồn/scope/aggregation; bảng run/links; renderer objective cục bộ |
| `frontend/src/components/analysis/analysisOverviewData.ts:4` (mới) | Count/response/row/group guards, formatter finite/null/tiny-positive, objective status/unit validation và tỷ lệ |
| `frontend/src/components/analysis/AnalysisOverview.module.css:2` | Loading reserve; typography/tabular numbers, objective grid, bảng cuộn riêng và focusable actions/mobile targets |
| `frontend/src/components/BaselineAnalysisDashboard.tsx:215` | Chỉ truyền returnTo và nhãn scope hiện có vào Overview; không đổi fetch/draft/save/handoff |
| `frontend/tests/analysis-overview.mjs` (mới) | Login qua form với HTTP fixtures, mapping/states/context/keyboard/responsive và ảnh trước/sau |
| `frontend/tests/analysis-redesign.mjs:290/847/854` | Chờ draft control sẵn sàng rồi giữ assertion cũ; menu assertions theo shell hiện tại |
| `docs/exec-plans/tech-debt-tracker.md` | Gỡ TD-61 khi suite đã PASS; không coi nợ evaluator/scene/trace đã sửa |
| Báo cáo này | Kế hoạch active được chuyển completed kèm kết quả thực thi |

Không sửa ObjectiveSummary/AnalysisSelectionSummary dùng chung với dataset và AEB;
không thay global tokens, Admin, backend, worker, schema, API services hoặc permission model.

## 5. Metric mapping và data integrity trước/sau

| API → hiển thị | Mapping sau sửa / đơn vị / null / status |
|---|---|
| total → KPI tổng | Safe integer ≥0; không lấy items.length làm tổng |
| counts[key] → KPI/bar | Safe integer trong [0,total]; thiếu/fraction/âm/NaN/quá total → “—”, không vẽ progress giả |
| count/total → tỷ lệ | Chỉ khi total>0 và count hợp lệ; tối đa1 chữ số thập phân. Positive<0,1% hiển thị “<0,1%”; gần100% chưa đủ100 dùng “>99,9%”, không làm tròn thành 0/100 sai nghĩa |
| items → run preview | Giữ thứ tự API, không search/sort lại; tối đa5 dòng hợp lệ, không tính aggregate từ chúng |
| run IDs / family / variant / seed | Từ API; guard định danh/nguồn, không suy category từ code/tên family |
| simulator / dt / baseline / vehicle / weather / time | Dữ liệu từng run, không lấy xe/baseline hiện tại thay cấu hình đã chạy |
| status vs outcome | Hai dòng riêng “Chạy” và “Phân loại”; không tự tạo taxonomy hoặc suy root cause từ impact |
| metrics.impact_speed_mps → impact từng run | Chỉ COMPLETED+COLLISION, SI m/s giữ nguyên, không nhân3,6; null/invalid/âm hoặc chưa hoàn tất → “—”. Collision impact0 vẫn hiển thị0.000 m/s |
| objective value | Chỉ hiển thị khi status VALID, đúng SI unit, samples>0, missing0, notApplicable hợp lệ, value finite≥0; INCOMPLETE không xuất mean như hợp lệ |
| objective missing / NA | “Chưa đủ dữ liệu hợp lệ” khác “Không áp dụng”; vẫn giữ samples/missing/notApplicable từ API |
| Format nhỏ | 3 số lẻ như hiện hành; positive<0,001 dùng scientific notation, không biến0,0004 thành 0.000 |
| RMS jerk / impact / stopping units | m/s³, m/s, m tương ứng; unit sai không tự chuyển hoặc gắn nhãn SI vào số đơn vị khác |
| aggregation version | Chỉ hiển thị string metadata; không dùng làm rule version/certification |
| Quãng phanh / aggregate impact | Chú thích có thể ngoại suy; impact là ego speed; valid non-collision đóng góp0 là quy ước aggregation backend, không một số đo va chạm mới do frontend tạo |

API items **chưa trả** category, lệnh AEB, minimum separation, actual duration hoặc μ.
Không thêm cột/giá trị giả cho những trường này. Overview nói rõ cần mở Chi tiết;
không dùng có/không collision hay jerk để suy command/brake response.
Thời điểm created_at là queued time, không gọi nó là thời gian thực thi.

Màu outcome/KPI hiện có theo luật backend được giữ, kèm nhãn chữ/giới hạn;
run preview trung tính, không tự tô severity. Không tuyên bố CARLA hoặc lý thuyết là ground truth thực địa.

## 6. States, navigation và accessibility

- Loading: aria-busy/status, chưa render KPI/row/progress cũ; min-height 340px giảm khoảng nhảy ban đầu,
  không tuyên bố đã đo CLS=0 hay giữ toàn bộ chiều cao dữ liệu thay đổi.
- Empty có filter: “Không có run khớp bộ lọc”; unfiltered: API chưa trả baseline trong scope.
  API chưa phân biệt never-run toàn hệ thống với project chưa có analysis, nên UI không tự kết luận thêm.
- HTTP 503/network/403: alert/retry hiện có của parent; không biến thành empty, không giữ rows cũ.
- Response sai shape: alert riêng “Dữ liệu tổng quan không hợp lệ”, dùng nút Tải lại hiện hành.
- Partial: từng field/metric có trạng thái rõ, chưa hoàn tất/thiếu trace giữ riêng; không đoán số thiếu.
- Liên kết summary/telemetry/evidence/playback đều vào route có thật. Run có status COMPLETED và trace mới
  hiện ba link trace; run khác vẫn có Chi tiết để xem trạng thái. Link không khẳng định evidence đủ để kết luận.
- returnTo giữ scenario, weather, page/page_size, q/d_q và view; quay lại giữ selection từ session storage.
  Không thay cơ chế selection/handoff hoặc quyền ghi.
- Failure Explorer tiếp tục qua navigation chung, giữ scenario context. “Mở danh sách” giữ query và draft.
- Bảng có caption/th scope, named scroll region/tabIndex, focus-visible; Tab/Enter và cuộn ArrowRight thực thi.
  Focusing evidence link đưa nó vào vùng nhìn thấy trong bảng, không kéo ngang cả page.
- Objective 3 cột desktop, xuống1cột mobile; controls mobile ≥40px; tokens màu/fonts/radius kế thừa.
  Không thay responsive/layout của các view khác; suite chung kiểm các màn liên quan.

## 7. Regression tests và bằng chứng

`analysis-overview.mjs` kiểm giá trị/route/trạng thái thực render, không chỉ text tĩnh:

| Yêu cầu | Fixture/thao tác/assertion |
|---|---|
| Context và full-scope | scenario 42/weather RAIN/page 2/size 10 thực gửi API; total80 không thành 6 items; chỉ 5 run preview; seed 48846/profile/dt/xe/baseline hiển thị |
| Collision vs AEB | Run 101 COLLISION có impact10.000 m/s; không xuất “AEB đã/không phanh” vì API thiếu command; RUNNING có impact kế thừa không hiện như hoàn tất |
| Units/null/zero | 10 m/s không thành36 km/h; null→dash; collision 0 và aggregate 0 giữ số; unit km/h sai không gắn m/s vào value 36 |
| Status/partial | INCOMPLETE với mean 9,5 vẫndash; NOT_APPLICABLE riêng; số âm và fractionalcount không hiển thị như hợp lệ; tiny 0,0004 giữ scientific |
| Loading | Hold/release response bằng promise; rows/progress chưa xuất hiện, không fixed API sleep |
| Empty/error | Filtered/unfilteredempty;503/network/403+retry; malformedcounts/groupsnull, không crash hoặc “không có run” giả |
| Navigation/context | Click bằng Enter đến summary/telemetry/evidence; section/returnTo đúng, quay lại URL và selection nguyên; scenario giữ khi mở Failure Explorer |
| Responsive/a11y |375/390/768/1024/1440, không page overflow; bảng scroll ArrowRight và link focus vào viewport; Menu Enter/Escape/return focus |
| Nguồn/role | CARLA+kinematic giữ nhóm riêng; Manager có link đọc evidence, không link tối ưu;0 business writes, không fabricatedfailure |

Suite `analysis-redesign.mjs` chạy toàn bộ overview/runs/failures/draft/snapshot/detail/telemetry/evidence/playback,
các state và navigation cũ, batch8 gồm8 màn × 5 viewport. Sửa menu theo actual DOM/semantics,
**không xóa assertion hành vi**. TD-61 đóng sau lượt PASS.

Lượt đầu suite rộng FAIL ở assertion restore selection vì kiểm select vừa xuất hiện trước khi draft sẵn sàng;
đã thêm chờ select enabled rồi giữ nguyên assertion OPTIMIZATION. Không sửa production selection.
Harness mới cũng đã sửa setup focus sang keyboard modality trước :focus-visible, và khôi phục filtered URL
sau testcase unfiltered-empty trước khi kiểm Manager navigation. Không nới expected values.
Log lỗi phát triển giữ ở `analysis-regression-first.log` và `overview-context-setup.log`.

## 8. Browser QA và ảnh trước/sau

Artifact gitignored: `data/analysis-phase12-2026-11-14/`.
Production Next 16.4.1 tại 127.0.0.1:3124, Windows Edge headless; login form dùng API interception và tài khoản
`overview@example.invalid`. Không login thật backend hoặc dùng dữ liệu cá nhân.

- `before/overview-{375,390,768,1024,1440}.png`:5 ảnh baseline và assertion RED cảnh báo cũ.
- `after/overview-*.png`: cùng5 viewport sau sửa, thêm ảnh bảng cuộn/focus ở từng viewport.
- Các ảnh states: loading, empty filtered/unfiltered, error/network/forbidden, malformed, partial-invalid,
  mixed sources/zero impact; result.json ghi 19 ảnh của lượt mới (5 ảnh toàn trang, 5 ảnh bảng và 9 ảnh trạng thái/nguồn).
- Đã xem ảnh desktop1440/mobile375 và ảnh bảng final. Trước chỉ aggregate, sau có run/context và evidence,
  nhóm metric có status/units và cảnh báo calibration/aggregation đúng nghĩa.
- Fixture baseline từng đặt invalid_runs 9 cạnh objective VALID; fixture cuối sửa thành 0 cho nhất quán.
  So sánh layout/nguồn/metric chính giữ nguyên; không coi việc biến mất cảnh báo 9 là thay đổi production.
- Suite rộng lưu ở `data/analysis-batch8-ui/`; kết quả PASS chỉ đọc sau exit0 của lượt hiện tại.
  result.json cũ đã xóa trước lượt final, không dùng artifact cũ để nhận PASS.
- Không có Figma truy cập được để đối chiếu. Không tuyên bố fidelity thiết kế hoặc screen reader conformance.

## 9. Validation thực thi

| Lệnh / kiểm tra | Kết quả |
|---|---|
| Git trước sửa |chuvv, sạch; Phase 11 HEAD ce250e2 |
| Frontend npm.cmd run lint |PASS exit 0 (lượt cuối sau sửa production) |
| Frontend npx.cmd tsc --noEmit |PASS exit 0 |
| Frontend npm.cmd run build |PASS exit 0, Next 16.4.1 |
| Frontend node tests/analysis-overview.mjs |PASS;5 viewport bắt buộc, login fixture,0 writes, không page errors |
| ANALYSIS_UI_URL=http://127.0.0.1:3124 node tests/analysis-redesign.mjs |PASS exit 0; full suite fixture Analysis |
| npx.cmd eslint tests/analysis-overview.mjs tests/analysis-redesign.mjs |PASS exit 0 sau tất cả thay đổi harness |
| Java AnalysisMetricsTest/AnalysisServiceTest/RepoDocsTest |PASS 24 tests: AnalysisMetrics 5 + AnalysisService 14 + RepoDocs 5, không fail/error/skip |
| git diff --check và file mới |PASS; kiểm cả file mới chưa stage |

Không có backend logic thay đổi; Java kiểm contract/aggregation bằng unit/mock, không live API/DB.
Frontend tests là fixture/browser tests; không phải CARLA runtime hoặc xác minh vật lý.

## 10. Giữ nguyên, rủi ro và bàn giao

Giữ ba objective/công thức/ngưỡng, IDs/seed/simulator grouping, API authorization, backend evaluation,
schema/database, worker/CARLA, Admin, parent fetch/request guards, draft/save/handoff, shared dataset renderer.
Không thêm dependency hoặc widget/chart mới.

Chưa thực hiện backend integration với MySQL/Redis, CARLA runtime, calibration, xe thật, screen reader,
touch/zoom thật, Firefox/Safari hoặc Figma. Không chứng minh physical accuracy chỉ từ fixture UI.
Vẫn còn nợ: evaluator/defaults/misattribution/taxonomy, canonical trace/calibration/rule identity,
cảnh CCR của Run Detail/Playback, scalability API và related-run matching.

Overview preview là một phần trang, không full history; không tìm kiếm server bằng q.
AEB activation/min separation/category/duration thiếu trong API list cần mở Detail; không che bằng0.
Chặn đơn vị/status sai ở UI không sửa nguồn backend hoặc tái chấm lịch sử.

Không stage/commit/push. Dừng Phase 12 để người dùng review và commit thủ công.
Commit đề xuất: `feat(analysis): refine overview dashboard and metric presentation`.
