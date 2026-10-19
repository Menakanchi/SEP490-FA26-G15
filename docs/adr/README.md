# Nhật ký quyết định kiến trúc (ADR)

Mỗi file là **một quyết định**: chọn X thay vì Y, và vì sao (Bối cảnh · Các lựa chọn · Quyết định ·
Lý do · Hệ quả). Đáng ghi ADR: lựa chọn framework, database, LLM provider, kiến trúc, cách deploy.

**ADR-001 → ADR-022 là lịch sử của Scenario Forge** — dự án gốc mà repo dựng lên từ đó, đã gỡ ngày
04/10/2026 ([ADR-032](ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md)). File và thư mục chúng
nhắc tới (`ARCHITECTURE.md`, `docs/guide/`, `eval/`, `fixtures/`…) chỉ còn trong lịch sử git. Vẫn còn
hiệu lực với VehicSim: ADR-001 (`src/` không `import carla`), ADR-002 (venv riêng cho worker CARLA),
ADR-005 (chỉ CARLA) và ADR-010/012/016/020 (thiết kế bộ sinh `.xosc` được
giữ lại). VehicSim: ADR-023 trở đi.

| ADR | Quyết định | Trạng thái |
|---|---|---|
| [ADR-001](ADR-001-carla-worker-tach-khoi-backend.md) | Tách CARLA ra worker riêng; backend cloud không `import carla` | Accepted |
| [ADR-002](ADR-002-python-version-hai-venv.md) | Hai venv: `src/` 3.11, `worker/` theo wheel CARLA (đo được: **3.10**) | Accepted |
| [ADR-003](ADR-003-qdrant-lam-vector-store.md) | Qdrant thay ChromaDB của template | ⛔ Superseded by ADR-013 (04/08) |
| [ADR-004](ADR-004-deepeval-va-metric-retrieval-tu-implement.md) | DeepEval cho scenario; Recall/MRR/nDCG tự implement | Accepted |
| [ADR-005](ADR-005-bo-isaac-sim-khoi-pham-vi.md) | Chỉ CARLA/ScenarioRunner; Isaac Sim ngoài phạm vi | Accepted |
| [ADR-006](ADR-006-embeddings-openai-thay-vi-sentence-transformers.md) | OpenAI embeddings; không đưa torch vào image backend | Accepted |
| ADR-007 | Vì sao workflow, không agent, không multi-agent | ⏳ W2 — khung lập luận ở `ARCHITECTURE.md` §Workflow 7 nodes |
| ADR-008 | Model routing + lớp trừu tượng provider (LiteLLM) | ⏳ W4 |
| ADR-009 | Chọn index Qdrant (HNSW vs exact) | ⛔ Đóng theo ADR-013 — chỉ mở lại nếu chạm ngưỡng đảo ngược |
| [ADR-010](ADR-010-vi-tri-tuong-doi-theo-lan-thay-vi-spawn-index.md) | Vị trí tương đối theo làn, không dùng `spawn_index` | Accepted — *cách hiện thực đang được ADR-012 xem lại* |
| [ADR-011](ADR-011-persistence-schema-va-state-transitions.md) | Persistence schema, `ScenarioStatus` + transition, `.xosc` trong DB, SQLite local ↔ Supabase deploy | ✅ **Accepted 04/8** — bảng transition được ADR-018 thay thế |
| [ADR-012](ADR-012-converter-dung-relativelaneposition.md) | Converter dùng thẳng `RelativeLanePosition`, không tự phân giải offset | ✅ **Accepted 31/7** — smoke test chạy được, kèm 3 bẫy converter |
| [ADR-013](ADR-013-sqlite-blob-thay-qdrant.md) | SQLite + embedding BLOB cho retrieval MVP, thay Qdrant | ✅ **Accepted 04/8** — supersedes ADR-003; kèm ngưỡng đảo ngược đo được |
| [ADR-014](ADR-014-duyet-theo-lo-va-batch-khong-vao-thu-vien.md) | Batch: `BEFORE_SIM` duyệt theo **lô**; scenario sinh hàng loạt **không** vào thư viện | 🕐 **Proposed 12/8** — thi hành ở Phase 4, nhưng ràng buộc schema phải chốt **trước** khi viết review API |
| [ADR-015](ADR-015-chan-trung-o-loi-vao-bang-so-khop-chuoi.md) | Câu hỏi trùng: so khớp chuỗi chuẩn hoá ở API layer trước graph; **không** ngưỡng embedding ở MVP | ✅ **Accepted 21/8** |
| [ADR-016](ADR-016-pham-vi-converter-mot-anchor-da-kiem-chung.md) | Phạm vi converter = các anchor đã đo; **72 ô** gồm 5 maneuver highway + `run_red_light` đô thị | ✅ **Accepted, cập nhật 24/8** |
| [ADR-017](ADR-017-muc-kiem-chung-tach-khoi-trang-thai-duyet.md) | Mức kiểm chứng (`VerificationLevel`) là trục **riêng**, không phải trạng thái duyệt | 🕐 **Proposed 15/8** — thứ tự xử lý kết quả được ADR-018 thay thế |
| [ADR-018](ADR-018-dao-thu-tu-hai-cong-duyet.md) | `BEFORE_SIM` → CARLA → `BEFORE_LIBRARY`; chỉ publish sau khi reviewer xem kết quả thực thi | ✅ **Accepted 19/8** |
| [ADR-019](ADR-019-chan-trung-o-dau-ra-truoc-khi-tieu-gpu.md) | Trùng ở **đầu ra**: so khớp động học tất định ở cổng `BEFORE_SIM`, cảnh báo trước khi tiêu GPU; **không** embedding | ✅ **Accepted 24/8** — cảnh báo mềm, có `force_simulate`; tuner có ngoại lệ nhưng vẫn qua HITL |
| [ADR-020](ADR-020-cut-in-trigger-theo-vi-tri-dan-truoc.md) | `cut_in` dùng `lead_distance` + `ReachPositionCondition` động, không suy vị trí từ tốc độ lệnh | ✅ **Accepted 24/8** |
| [ADR-021](ADR-021-danh-gia-controller-tach-khoi-xac-minh-kich-ban.md) | Lượt đánh giá mô hình lái tách khỏi xác minh scenario; BehaviorAgent chạy trong tick loop qua `ControllerAction` | ✅ **Accepted 24/8** |
| [ADR-022](ADR-022-closed-loop-dung-o-cap-ab-co-nguoi-khoi-dong.md) | Closed-loop MVP dừng ở cặp A/B có người khởi động; không tự chạy nhiều thế hệ | ✅ **Accepted 24/8** |
| [ADR-023](ADR-023-vehicsim-mvp-dung-simulator-dong-hoc.md) | VehicSim MVP chạy trên simulator động học tất định sau hợp đồng `execute_run`; CARLA cắm vào sau | 🕐 **Proposed 30/9** |
| [ADR-024](ADR-024-vehicsim-mysql-redis-tach-khoi-sqlite-forge.md) | VehicSim + tài khoản trên MySQL 27 bảng, Redis cho OTP/rate limit/Celery; Forge giữ SQLite; biến thể = `scenario_versions` | 🕐 **Proposed 30/9** |
| [ADR-025](ADR-025-cong-regression-cung-seed-khong-tu-accept.md) | Regression so từng cặp cùng seed; không bao giờ tự Accept; chặn quyết định trên baseline đã đổi | 🕐 **Proposed 30/9** |
| [ADR-026](ADR-026-mo-ta-sang-ir-dung-lop-llm-chung.md) | Bước 1 câu mô tả → Scenario IR dùng lớp LLM chung, không qua graph 7 node | 🕐 **Proposed 30/9** |
| [ADR-027](ADR-027-bo-mo-phong-cam-duoc-hop-dong-json.md) | Bộ mô phỏng cắm được: JSON chung, AEB dùng chung, CARLA chạy bằng tiến trình con; không ghép cặp khác simulator | 🕐 **Proposed 1/10** |
| [ADR-028](ADR-028-tro-ly-du-an-rag-chi-doc.md) | Trợ lý dự án: RAG chỉ đọc trên dữ liệu project + tài liệu repo, vector trong bảng MySQL `knowledge_chunks` | ⛔ **Superseded by ADR-035** (6/10) — bỏ Meomeo Agent |
| [ADR-029](ADR-029-tro-ly-react-cong-cu-chi-doc-guardrails.md) | Meomeo Agent: ReAct với 9 công cụ chỉ đọc + guardrails bảo vệ người dùng, chống prompt injection | ⛔ **Superseded by ADR-035** (6/10) — bỏ Meomeo Agent |
| [ADR-030](ADR-030-bo-viewer-them-expert-va-forum.md) | Bỏ role VIEWER; thêm EXPERT; một forum AEB chung — bài của ENGINEER chờ ADMIN/EXPERT duyệt, comment không duyệt | ⛔ **Superseded by ADR-034** (5/10) — role đổi, forum bỏ |
| [ADR-031](ADR-031-database-phu-du-chuc-nang.md) | Database phủ FE-01 → FE-14: 36 bảng (+8), một xe không phiên bản (thêm xe = clone từ CARLA), migration SQL đánh số | ⛔ **Superseded by ADR-036** (7/10) — schema 29 bảng; giữ migration SQL đánh số |
| [ADR-032](ADR-032-go-scenario-forge-giu-bo-sinh-openscenario.md) | Gỡ Scenario Forge (graph 7 node, SQLite, 8 trang, worker ScenarioRunner); giữ bộ sinh OpenSCENARIO ở `src/services/openscenario/`; một database duy nhất | 🕐 **Proposed 4/10** |
| [ADR-033](ADR-033-cau-hinh-xe-de-so-sanh.md) | Cấu hình xe chỉ để so sánh (38 bảng); DB lái blueprint + vật lý xe vào CARLA, bảng đối chiếu cấu hình ↔ CARLA | ⛔ **Superseded by ADR-035** (6/10) — bỏ cấu hình xe; giữ việc ép xe chính vào CARLA |
| [ADR-034](ADR-034-role-he-thong-va-role-trong-workspace.md) | Role hệ thống ADMIN / MANAGER / EXPERIENCE (EXP, tự đăng ký = EXPERIENCE), role trong workspace ENGINEER / REVIEWER (Reviewer duyệt bước 6), project cá nhân không thuộc workspace; bỏ forum (36 bảng) | ⛔ **Superseded by ADR-035** (6/10) — 5 role hệ thống, mỗi người một role |
| [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md) | 5 role hệ thống ADMIN / MANAGER / ENGINEER / REVIEWER / EXPERIENCE, mỗi người một role (`users.role_id`); chỉ REVIEWER duyệt, EXP không có recommendation; bỏ cấu hình xe so sánh và Meomeo Agent (32 bảng) | 🕐 **Proposed 6/10** — quyền API đã làm, lọc theo workspace chưa (TD-30); phần schema thay bởi ADR-036, role tự đăng ký đổi mã thành EXPERIENCER |
| [ADR-036](ADR-036-schema-29-bang.md) | Schema 29 bảng theo 13 FE: gộp bảng 1:1, phiên bản xe + hiệu chuẩn, khuyến nghị tách khỏi regression, cộng tác workspace, `tech_references`; DB ép regression cùng seed + biến thể + xe + bộ mô phỏng; field khớp CARLA 0.9.16 và đủ cho tối ưu (Pareto, robustness) | 🕐 **Proposed 7/10** — schema, migration 005, code đã chuyển; phiên bản xe và xin / duyệt workspace thay bởi ADR-038 |
| [ADR-037](ADR-037-thanh-vien-project-near-miss.md) | Chốt chỗ UC List lệch DB: `project_members` (30 bảng), lỗi `NEAR_MISS`, thông báo `FAILURE_DETECTED` / `CANDIDATE_CREATED`; Reviewer tự duyệt, mỗi người một role không đổi, bỏ UC-11 | 🕐 **Proposed 7/10** — schema, migration 005 (gộp), bộ chấm đã đổi; chưa có API thành viên |
| [ADR-038](ADR-038-bo-phien-ban-xe-admin-tao-workspace.md) | Bỏ phiên bản xe (thông số cố định trong `carla_vehicle_models`, project chọn xe), Admin tạo workspace và gán Manager, báo cáo công việc theo project (`task_reports`); 29 bảng | 🕐 **Proposed 7/10** — schema, migration 006, code đã đổi; chưa có API workspace / báo cáo |
| [ADR-039](ADR-039-backend-java-mo-phong-o-worker-python.md) | Backend Spring Boot (Java) cho API và nghiệp vụ; AEB + bộ mô phỏng + luật chấm ở lại `worker/vehicsim_core` (Python, chỉ thư viện chuẩn), gọi qua bundle JSON → `result.json` kèm kết quả chấm; hàng đợi là thread pool thay Celery | 🕐 **Proposed 14/10** — auth + 19 route `/vehicsim/*` đã port và đối chiếu với Python trên DB thật |
| [ADR-040](ADR-040-rut-scope-4-tham-so-aeb-7-category.md) | Rút scope theo bản chuẩn hoá luận văn: 4 tham số AEB (6 tham số còn lại thành hằng số của lõi), 3 mục tiêu MOBO, 7 category kịch bản Euro NCAP; IR vẫn tính người đi bộ bằng m/s; 29 bảng | 🕐 **Proposed 15/10** — schema, migration 007, code đã đổi; 60/192 run của v1.3 không còn tái lập (TD-40) |
| [ADR-041](ADR-041-xosc-va-scenariorunner-tu-web.md) | Xuất OpenSCENARIO và chạy ScenarioRunner + AEB dùng chung từ web trên CARLA 0.9.16 local | Proposed 18/10 |

## Luật

- **Quyết định không được chỉ tồn tại trong tài liệu kế hoạch.** Kế hoạch có thể nằm ngoài git; ADR thì không. Chỗ nào cần trạng thái thì link về bảng này, đừng chép nội dung quyết định ra ngoài.
- ADR **không sửa** sau khi Accepted. Đổi ý thì viết ADR mới và đánh dấu cái cũ `Superseded by ADR-XXX`.
- Chỗ nào quyết định phụ thuộc số đo chưa có, ghi rõ ô trống và ai đo — **không điền bằng phỏng đoán** (xem ADR-002).
