# Nhật ký quyết định kiến trúc (ADR)

Mỗi file là **một quyết định**: chọn X thay vì Y, và vì sao. Theo mẫu ở `docs/guide/chapter-03.md`
(Bối cảnh · Các lựa chọn · Quyết định · Lý do · Hệ quả).

**Nguồn của yêu cầu này:** `docs/guide/chapter-03.md` — chương kiến trúc đặt mục tiêu "ít nhất 2–3 ADR cho các quyết định quan trọng" (dòng 678) và liệt kê thứ đáng ghi ADR: *lựa chọn framework, database, LLM provider, architecture pattern, deployment strategy* (dòng 660).

ADR **không** nằm trong 10 deliverables mà ban tổ chức yêu cầu (chương 9). Nó là **bằng chứng cho PLO1** (kiến trúc) và là chỗ dựa cho Deliverable #3 (Architecture Diagram) — không phải một mục nộp riêng.

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
| [ADR-019](ADR-019-chan-trung-o-dau-ra-truoc-khi-tieu-gpu.md) | Trùng ở **đầu ra**: so khớp động học tất định ở cổng `BEFORE_SIM`, chặn trước khi tiêu GPU; **không** embedding | 🕐 **Proposed 21/8** — Phase 2, đo trước khi triển khai |
| [ADR-020](ADR-020-cut-in-trigger-theo-vi-tri-dan-truoc.md) | `cut_in` dùng `lead_distance` + `ReachPositionCondition` động, không suy vị trí từ tốc độ lệnh | ✅ **Accepted 24/8** |
| [ADR-021](ADR-021-danh-gia-controller-tach-khoi-xac-minh-kich-ban.md) | Lượt đánh giá mô hình lái tách khỏi xác minh scenario; BehaviorAgent chạy trong tick loop qua `ControllerAction` | ✅ **Accepted 24/8** |
| [ADR-022](ADR-022-closed-loop-dung-o-cap-ab-co-nguoi-khoi-dong.md) | Closed-loop MVP dừng ở cặp A/B có người khởi động; không tự chạy nhiều thế hệ | ✅ **Accepted 24/8** |

## Luật

- **Quyết định không được chỉ tồn tại trong tài liệu kế hoạch.** Kế hoạch có thể nằm ngoài git; ADR thì không. Chỗ nào cần trạng thái thì link về bảng này, đừng chép nội dung quyết định ra ngoài.
- ADR **không sửa** sau khi Accepted. Đổi ý thì viết ADR mới và đánh dấu cái cũ `Superseded by ADR-XXX`.
- Chỗ nào quyết định phụ thuộc số đo chưa có, ghi rõ ô trống và ai đo — **không điền bằng phỏng đoán** (xem ADR-002).
