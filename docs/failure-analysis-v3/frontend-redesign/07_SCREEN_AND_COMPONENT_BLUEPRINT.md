# 07 — Screen và component blueprint

Đây là specification cho task frontend sau, **không phải component đã implement**. Tất cả component tên “đề xuất” dưới đây có thể là composition của source hiện có, không yêu cầu tạo hàng loạt abstractions. Source inventory [03](03_FRONTEND_INVENTORY.md); capability [01](01_BACKEND_CAPABILITY_AUDIT.md); blockers [09](09_BACKEND_BLOCKERS_AND_DEPENDENCIES.md).

## 1. Workspace — `/analysis/failures`

User intent: chọn đúng dữ liệu, xem tổng hợp đúng scope, mở run, chuẩn bị tập nếu cần. Surface này thay4primary modes; reuse existing shared page/context, không thay shell.

```text
DỮ LIỆU & KẾT QUẢ                 [Tải lại]
Project · nguồn baseline DB · phạm vi lọc
[Họ kịch bản] [Trạng thái] [Lọc nâng cao ▾]   active filter chips

Tổng run | Va chạm theo luật | Thiếu/lỗi kỹ thuật
Chỉ số theo từng nhóm cấu hình ▾      [không score trộn nhóm]

RUN TABLE
Run/variant/seed | Thực thi/kết quả đã lưu | 3 metrics | Xem kết quả
[gán vai trò chỉ khi mở tác vụ Chuẩn bị bàn giao]

[Tra cứu lỗi theo luật cũ ▾]   scope khác, có CSV riêng
[Chuẩn bị bàn giao: n tối ưu / m xác minh] → review panel
```

| Block / reuse | Input thật / source | Output/action thật | State/acceptance |
|---|---|---|---|
| Scope header (`BaselineAnalysisDashboard` composition) | shared context + URL AnalysisFilters | GET analysis/runs; chips clear/reset | không request dựa project cũ; show refresh error/loading keyed response |
| Compact summary (`AnalysisOverview`) | dashboard counts/total/objective_groups | read-only; expand group/filter profile | counts toàn scope, groups own identity; không sum objective groups; no absent count→0 |
| Run table (`AnalysisRunExplorer`) | paged items/revision | open inspection, optional role assignment | default identity/status+3metrics/actions; expandable source details; currentpage search label |
| Legacy lookup (`LegacyFailureCases`, `AnalysisFailureExplorer`) | separate f_* filters/FailureList | GET failures; legacy CSV | hidden by default; scope label riêng; giữ tìm cause/outcome/days không hỗ trợ ở runs API |
| Draft tray (`analysisSelectionData`) | account/project role map | open review; remove/reassign if permitted | số thật, unpersisted indicator, no automatic role guessing |
| Review panel (`AnalysisDatasetPreparation`, `AnalysisSelectionSummary`) | chosen runs/revisions/current context; snapshot response | POST selections, GET archive/check; future datasetJSONdownload | warning metadata≠serverapproval; validation sealed; retry and retain draft |

Bố trí tối giản không bỏ source identity. Simulator/vehicle/dt/seed đủ để phân biệt run; columns có thể gộp text nhưng ID không bị gộp/dedup. Baseline/AEB controls là filters/context, không điều khiển4parameter.

Loading/error chỉ thay vùng liên quan; snapshot/read draft không nhảy sang data khác. Nếu group thiếu dt structured field, giữ identity technical string và nói API chưa tách dt; không parse chuỗi định dạng nội bộ để giả field chính thức. Nếu fullglobal search là yêu cầu bắt buộc, đánh dấu dependency B10, không pretend current-page search.

### Review/export interaction

Inline review panel ưu tiên hơn modal: heading focus sau bấm mở, Escape không xóa draft, close trả focus về tray, URL `view=dataset` alias mở lại. Hai section roles được giữ rõ; mỗi section có safe count và run+variant+seed. “Chốt tập” chỉ enabled theo metadata/canWrite; server còn kiểm currentness/trace/objectives/hash. Error429/400 không tạo duplicate snapshot tự retry POST; người dùng chủ động retry sau kiểm lý do.

Snapshot read view phải phân biệt:

- draft chưa lưu;
- v2 archive đã lưu, baseline_current theo lúc fetch, chưa current handoff check;
- v2 được check trong action hiện tại;
- stale v2 chỉ đọc lịch sử;
- v1 archive: thiếu hai partition, không directhandoff; giải thích chốt lại bằng flow v2, không tự convert;
- request failed/unauthorized/notfound.

Không có datasets list API, nên chưa thêm table lịch sử snapshot. Link trực tiếp `dataset_id` hợp lệ vẫn dùng được. Trong FE-R4, nếu thêm download dataset-v2 JSON từ GET checked response, giữ response schema/values/IDs/manifests, không append giả core fields hoặc signature. File phải được gọi dataset-v2, không “MOBO đã sẵn sàng chạy”.

## 2. Result run — `/analysis/failures/{runId}`

User intent: biết điều gì xảy ra, canonical metrics nói gì, bằng chứng nào còn thiếu; chỉ điều tra sâu nếu cần. Không biến mỗi formula/candidate thành screen mới.

```text
← Về danh sách / kiểm chứng đúng context
Run # · variant · seed              [Tác vụ khác ▾]
Trạng thái thực thi · Simulator/xe/dt · nguồn kết quả

TÓM TẮT
Kết quả đã ghi     | AEB: chỉ mốc/lệnh được source hỗ trợ
Đánh giá theo luật | Giới hạn evidence / chưa đủ kết luận

RMS jerk [unit]    Impact [unit]     Stopping distance [unit]
[Giải thích]      [Giải thích]      [Giải thích]

[Điều tra ▾] → timeline + Telemetry / Bằng chứng
[Cấu hình / môi trường ▾]    [Ca có cấu hình gần ▾]
```

| Block / reuse | Dữ liệu hiện có | Gate/presentation bắt buộc |
|---|---|---|
| Run header/identity | inspection.run + detail header | validate run ID match; unfinished detailnull status-only; returnTo whitelist |
| Outcome/assessment (`AnalysisClassification`) | legacy detail.outcome/verdict/failure_type/evaluation_valid | label “theo kết quả/luật đã lưu”; no physical truth/cause claim từ legacy flags |
| AEB fact row | metrics first_detection/decision/brake_onset; events | label command/controller ticks; physical applied onset/actor writer unknown; no implied actual brake từ aeb=true |
| Objective cards (`RunFact`, format helpers) | exact metrics3 stored scalars | no missing→0; no-contact per-run impact không show aggregate0; units explicit; source/version caveats |
| Explanation `<details>` | legacy API inputs + profile version only where verified | frontend copy không xác nhận method lịch sử; current CARLA jerk T_AEB/filter khác raw chart; no substitute numbers |
| Investigation (`AnalysisRunTimeline`, `AnalysisRunTelemetry`, `AnalysisRunEvidence`) | timestamps,stage_evidence,motion_telemetry,events | exact clock/source distinction; timestamps outside range no seek; don't fabricate physical hazard/onset |
| Scene/playback | scene/frames + dimensions with finite guards | reconstructed drawing/source; no geometric overlap⇒sensor contact; CCR geometry limitations explicit |
| Configuration/environment | configuration/environment from current API | keep4parameter read-only; distinguish DB context vs artifact-at-run proof; no confirmed baseline v1 |
| Similar cases | similar[] | “độ gần theo tham số”, not probability/root cause/effect size |
| Other actions | XOSC/CARLA existing module2 operations | secondary, role/error/scope guards; rerun simulation not diagnostic job |

### V3.1 result composition chỉ sau backend unblock

Future result renderer phải nhận nguyên report envelope và source registry có version/digest, không translate legacy chain thành V3 candidates. Bảy trục là hierarchy nội dung:

| Trục | Report data thực ở core | Vị trí đề xuất |
|---|---|---|
| Physical outcome | `report.physical_outcome`, `physical_outcome_basis`, collision evidence/disagreements | summary + evidence source conflict disclosure |
| AEB observed behavior | `observed_behavior`, `aeb_timeline`, physical braking/impact analysis | summary concise; timeline detail |
| Objectives | `report.objectives.<key>` canonical_value/quality/provenance/decomposition |3primarycards + expandable source/filter/window |
| Feasibility/avoidability | feasibility results/physical_feasibility/physical_limit | investigation with assumptions/action set, UNKNOWN respected |
| Failure candidates | `report.failure_candidates` status/evidence/reasons/missing/alternatives | candidate list; supported/suspected/unknown distinct, not roots |
| Causal hypotheses | `report.root_cause_hypotheses`, `confirmed_root_cause` | hypotheses detail; no forced cause |
| Sufficiency/uncertainty | evidence_sufficiency,inconclusive_reasons,uncertainty_notes,validation | visible summary limits; expandable technical refs |

Exact serializer fields phải pin bằng backend integration contract trước implementation; table này mô tả current core report, **không phải REST DTO đã tồn tại**. Cần version dispatch cho archive; raw original pointers and clocks giữ nguyên; no frontend physical solver.

V3 objective card: giá trị+unit+quality label; explanation source producer/signal/filter/window/sim/profile/version; stopping trace vs modeled tail chỉ show khi available, không gọi modeled component measured; impact canonical và contact-derived speed là hai dòng riêng, kể cả disagreement. Hints là read-only SUSPECTED/ABSTAIN từ handoff có scope, không inputform chỉnh controller/searchbounds.

## 3. Playback advanced route hiện có

Giữ paused load, hidden-tab pause, reducer requestKey, rates được kiểm, no interpolation coordinate/flags, duplicate/backward timestamp quality và raw event identity. Giữ detail/list return + signal/time/compare. Không khẳng định related run là matched ON/OFF pair chỉ từ cùngvariant hoặc AEB label; dữ liệu related_runs hiện chưa có toàn bộ tuple.

Đặt timeline/scene/values/event log trong một view, không mở thêm “Timeline page”. Chart source/motion source không tự clock-aligned bằng t=0. Optional link sensor video chỉ xuất hiện nếu backend có resource thực; không render fake video bằng ScenarioMap.

## 4. States, accessibility, responsive và validation checklist

- Run đổi trong lúc request cũ đang chạy: old response không ghi đè current result; chart/playback reset bằng request key, không carry wrong time/data.
- Keyboard: tab focus/arrow/Home/End hiện có được bảo toàn hoặc replacement tương đương; disclosure labels rõ, link đến technical mốc có run/time; tables có caption và focusable scroll region.
- Reading order: status trước outcome; metrics trước technical tables; missing reason/source text đọc được không cần hover/màu. Không live-announce mỗi playback frame.
- Mobile320–375: one-column summary/filter, advanced collapsed, action wrap, table scroll vùng riêng; evidence/raw hashes không kéo rộngviewport. Full table vẫn accessible, không truncate mất run/seed.
- Touch target hướng tới44px và zoom200%; test focus không bị pinnedcol che. Reducedmotion không auto animation; playback chỉ user initiate.
- Error/empty/loading state cho từng panel; schema unsupported khác empty successful; 401/403 giữ semantics transport. API không có reason code thì hiện nguyên thông báo chuẩn hóa/không tự suy diagnosis.
- Claim “working action” phải có route và test boundary. Mocks chỉ trong tests, ghi BROWSER_FIXTURE_ONLY; không ship demo responses để che thiếu backend.

Acceptance từng phase ở [08](08_IMPLEMENTATION_PLAN.md); scope này chưa tạo React/Java source hoặc endpoint mới.
