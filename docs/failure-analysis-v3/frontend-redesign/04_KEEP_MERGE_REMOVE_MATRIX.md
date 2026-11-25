# 04 — KEEP / MERGE / REPLACE / REMOVE / BLOCKED

Quyết định thiết kế dựa trên capability IDs trong [01](01_BACKEND_CAPABILITY_AUDIT.md) và inventory [03](03_FRONTEND_INVENTORY.md); chưa xóa/sửa production file. REMOVE chỉ thực hiện ở task FE được giao sau audit và có reference/test gate.

| Feature hiện tại / cần có | Quyết định | Lý do / source | Đích đến / điều kiện |
|---|---|---|---|
| Global entry Kết quả & phân tích | KEEP | một entry đủ; shared vehicsimFlow | không sửa shared shell/sidebar |
| Four local AnalysisNav tabs | MERGE | overview/runs lặp selection context; dataset là tác vụ phụ | workspace chính; legacy lookup/export panel giữ backend scope riêng |
| Overview KPI + technical counts | KEEP/MERGE | C01/02 actual counts toàn server filter | summary gọn phía trên table; không dựng count từ current page |
| Overview five-run shortcut table | REMOVE khỏi layout mặc định | lặp explorer ngay bên dưới sau merge | một run table; deep links đã có trong row |
| Per-identity objective_groups | KEEP | đúng canonical aggregate C02 | collapsed group cards; không cross-profile total/score |
| Run explorer/table | KEEP | C01/03; primary select task | rút cột mặc định, details row/secondary context |
| Family/baseline/status/advanced filters | MERGE | tránh lặp filter; API9filter thực | common run-scope header, chips; manual IDs ở nâng cao |
| Search/sort loaded page | KEEP có nhãn | API không server search/global sort | ghi “Tìm/sắp xếp trong trang”; không hứa tìm toàn bộ |
| Separate legacy failure lookup | MERGE entry, KEEP query | C05 không phải subset tùy ý của C01 | accordion/tool “Tra cứu lỗi theo luật cũ”; giữ f_* scope và KPI riêng |
| Failure stage/confidence distributions | MERGE vào legacy lookup |4stage là heuristic taxonomy; không causal truth | label “khâu được luật nhắc tới”; score ≠ probability |
| Detail summary/telemetry/evidence | MERGE hierarchy | một result page, summary trước, investigation theo nhu cầu | giữ URLsection aliases/deep link timestamps |
| Repeated classification blocks | MERGE | repeated summary/evidence cùng source | một canonical legacy presentation, nguồn và evaluation_valid gate |
| Three objective values | KEEP | C03/04 giá trị đã lưu, canonical aggregate version | primary results; null/state khác0; không recompute |
| Static formula explanation copy | REPLACE phần khẳng định thiếu version | METHODS.rms onset/no-filter không đúng mọi CARLA; stopping vintage khác | conservative profile-backed explanation; unknown nếu thiếu lineage; không sửa producer |
| Timeline/linked telemetry | KEEP | C07 actual recorded clocks | điều tra; no fabricated hazard/applied onset |
| GT/perceived TTC, jerk chart | KEEP | recorded projections/diagnostic derivative | separate signals; never use chart RMS as objective |
| Reconstructed scene summary | MERGE dưới investigation | lặp playback; không đủ currentgeometry cho mọicategory | preserve guards; không sửa shared ScenarioMap ở scope này |
| Dedicated playback route | KEEP | useful deep tool + regression incoming links | advanced fullscreen route, không primary nav thứba |
| Similar failures | KEEP secondary | C08 similarity param-distance only | “Ca có cấu hình gần”; score không calibrated confidence |
| Related/compare links | KEEP có giới hạn | playback related_runs không đủ seed/xe/profile để tự xác nhận pair | chỉ gọi paired khi authority có evidence; cross-module link không sửa regression |
| Session draft/role map | KEEP | account/project-scoped, revisions preserved | inline selection tray; no auto role assignment |
| Dataset 3-step full-page preparation | MERGE bố cục | optional export task không main reading flow | expandable review panel; giữ authoritative gates/checklist |
| Two partitions/safe cases/variant isolation | KEEP bắt buộc | C09 business rules, validation sealed | không “đơn giản hóa” thành latest variant selection hay all-to-opt |
| Snapshot v2 read/revalidate | KEEP | C10/11 immutable/freshness checks | archive/read-only + check-on-export riêng |
| Snapshot v1 display | REPLACE unsupported state bằng archive path | C12 readable backend, dashboard hiện reject | archive warning, no directhandoff; không chuyển v1 thành v2 ở FE |
| Unreferenced AnalysisDatasetPanel | REMOVE sau gate | rg src không importer | không xóa API/type v1 dùng ngoài scope |
| Uncalled FE freezeAnalysisDataset client | KEEP dependency / không dùng flow mới | endpoint vẫn callable, client shared | chỉ owner shared client xử lý sau; không gỡ trong FE-R1 |
| “Tiếp tục Tối ưu AEB” wording | REPLACE | check+navigation ≠ dataset consumption C23 | “Kiểm tra tập / Mở module tối ưu”; note execution integration BLOCKED |
| “Tối ưu toàn họ” primary CTA | REMOVE khỏi primary toolbar, KEEP secondary explicit link | bypass current selection/cohort | “Mở tối ưu toàn họ (không dùng bản nháp này)”; do not change MOBO page |
| CARLA rerun/XOSC download | KEEP secondary | module2 genuine operation, no FA recomputation | menu “Tác vụ mô phỏng”, permission/error unchanged |
| Legacy CSV export | KEEP scope label | C06 lacks3objective/full core report | “CSV lỗi theo bộ lọc legacy”; không generic “Diagnostic Report” |
| JSON upload / collection select for V3 | BLOCKED web | C14 code offline, no service endpoint | B01/B02 file09; no hidden mock bridge or browser local Java simulation |
| Analyze / re-analyze V3 job | BLOCKED web | C21 missing orchestrator/status contract | show dependency once if needed; no active fake Analyze button |
| V3 physical outcome/candidates/dossiers | BLOCKED web, core KEEP | C17/18 implemented offline | add renderer only once supported backend report boundary exists |
| Diagnostic Report download | BLOCKED web | C22; current GET run not versioned core report | no client synthesis claiming core digest/provenance |
| V3.1 MOBO Handoff + compatibility download | BLOCKED web | C19/20 no REST | separate from existing dataset-v2 JSON archive/export |
| Download saved dataset-v2 JSON | KEEP as planned FE action | GET archive/check return JSON today, no need new scoring logic | FE-R4 may serialize exact checked response with clear schema; byte authenticity not claimed |
| Full collection/replicate aggregation UI | BLOCKED for web intake; KEEP existing grouped aggregate | C01 excludesOFF/lacksrep/attempt, C14 offline | not equivalent to whole-scenario frozen cohort |
| Hints/search ranges controls | BLOCKED web | no M1C endpoint, scoped approvals; not parameter editor | future read-only hints; ABSTAIN kept; no invented ranges |
| Frontend charts re-scoring/auto root confirmation | REMOVE from proposals | violates backend truth, not found as actual feature | no client physics or aggregate replacement |
| New screens named batch/G01/P01/EvidenceGates | REMOVE from proposal | implementation terms not user task | put formula/reason IDs only technical detail/searchable source |

## Safe removal gate

Trước REMOVE: check production imports, dynamic references, tests, docs/incoming links, cross-module consumers và schema aliases. Chỉ xóa source thuộc FA được giao; không xóa APIs/fixtures/shared data hoặc historical results. Nếu reference nằm module khác, giữ compatibility hoặc tạo dependency ticket. Không xóa helper chỉ vì không được REST gọi — offline/report use là use hợp lệ.

Mọi feature MERGE phải giữ data-source badge và scope. “Gộp màn” không gộp run-vs-failure denominator, archived-vs-current approval, core-vs-recorder clocks, canonical-vs-sensor impact, hay optimization-vs-validation evidence.
