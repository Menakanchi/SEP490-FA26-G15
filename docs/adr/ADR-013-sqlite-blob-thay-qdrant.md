# ADR-013: Dùng SQLite + embedding BLOB cho retrieval MVP, thay Qdrant

**Ngày:** 2026-08-04
**Trạng thái:** Accepted — **supersedes [ADR-003](ADR-003-qdrant-lam-vector-store.md)**

## Bối cảnh

[ADR-003](ADR-003-qdrant-lam-vector-store.md) (28/07) chọn Qdrant vì cần *vector search kết hợp payload filter theo nhãn ODD*, và vì muốn giữ RAM backend dưới trần 512MB của Render.

Từ đó có ba thứ thay đổi:

1. **Quy mô thật đã rõ.** Thư viện MVP dưới 1000 scenario. Với `text-embedding-3-small` (1536 chiều, float32): `1000 × 1536 × 4 B ≈ 6 MB`. Toàn bộ ma trận embedding nằm gọn trong RAM backend, cosine brute-force bằng numpy chạy dưới 1 ms.
2. **Tài liệu đã mâu thuẫn nhau.** `docs/overview_v3.html` mô tả `retrieve` là hybrid search trên SQLite với embedding BLOB, trong khi ADR-003, `ARCHITECTURE.md` và PRD §6.3 nói Qdrant. Hai tài liệu đang bảo người implement làm hai việc khác nhau.
3. **ADR-011 sắp chốt.** Persistence schema phụ thuộc trực tiếp vào chỗ embedding sống. Không chốt chuyện này trước thì ADR-011 phải chốt hai lần.

## Các lựa chọn

### Lựa chọn 1: Giữ Qdrant đúng ADR-003
- Ưu: đúng stack đề bài gợi ý; payload filter là tính năng gốc; sẵn sàng cho quy mô lớn.
- Nhược: thêm một container ở dev và một dịch vụ Cloud ở production; phải viết đường **sync/rebuild** từ transactional store sang Qdrant, kèm một failure mode mới là hai store lệch nhau; thêm một API key, một network hop, một thứ có thể chết vào ngày demo.

### Lựa chọn 2: SQLite + cột BLOB, cosine bằng numpy
- Ưu: một file `.db`, một nguồn truth, không sync; zero hạ tầng thêm; retrieval và transactional state cùng một transaction.
- Nhược: không có index ANN; sẽ phải đổi nếu thư viện lớn hơn nhiều bậc.

### Lựa chọn 3: Chạy cả hai sau một interface
- Ưu: linh hoạt.
- Nhược: gấp đôi chi phí hiện thực và test cho một nhu cầu chưa ai chứng minh là có. Loại.

## Quyết định

**Lựa chọn 2 cho MVP.**

- Embedding lưu cùng bảng `scenarios` dưới dạng **BLOB**.
- Lọc ODD bằng `WHERE` trên các cột payload; khoá filter vẫn trùng tên trường của `ODDCell` như hiện tại.
- Xếp hạng bằng cosine (numpy) trên tập đã lọc, trả tối đa ba examples (FR-03 không đổi).
- Mọi truy cập retrieval đi qua **một** interface `Retriever` trong `src/services/`. HTTP layer không tự viết truy vấn vector — bất biến này giữ nguyên, chỉ đổi tên thứ bị cấm.

[ADR-003](ADR-003-qdrant-lam-vector-store.md) chuyển sang `Superseded by ADR-013`. **ADR-009** (chọn index Qdrant HNSW vs exact) **đóng lại**, chỉ mở lại nếu chạm ngưỡng đảo ngược bên dưới.

## Lý do

1. **Lập luận RAM của ADR-003 không còn đứng ở quy mô thật.** ADR-003 §3 tách vector store ra ngoài process để giữ RAM dưới 512MB. Nhưng 6 MB embedding không phải thứ đe doạ trần đó — thứ đe doạ nó là torch, và [ADR-006](ADR-006-embeddings-openai-thay-vi-sentence-transformers.md) đã loại torch rồi.
2. **Bỏ được một bài toán nhất quán có thật.** `ARCHITECTURE.md` ghi "Qdrant có thể rebuild từ dữ liệu đã duyệt" — đó là code phải viết, phải test, và là một failure mode phải xử lý (index lệch transactional store sau khi review đổi trạng thái). Một store thì không có lớp lệch nào để lệch.
3. **Đề bài liệt kê Qdrant ở mục "Tech stack *gợi ý*".** Lệch khỏi gợi ý kèm lý do đo được là đúng thứ ADR sinh ra để làm — không phải vi phạm đề.
4. **Ít hạ tầng hơn là ít thứ hỏng vào ngày demo.** Không container phụ, không API key phụ, không network hop giữa backend và index.
5. **Không mất tính chất nào đang được bảo vệ.** Lọc theo nhãn ODD vẫn là lọc theo nhãn ODD; ràng buộc "khoá filter phải trùng tên trường của `ODDCell`" (`tests/test_fixtures.py:555`) vẫn còn nguyên ý nghĩa, chỉ đổi nơi thi hành từ payload filter sang mệnh đề `WHERE`.

## Ngưỡng đảo ngược

Viết ADR mới quay lại Qdrant (hoặc index ANN khác) khi **đo được** một trong các điều sau — không đổi vì cảm giác:

- Thư viện vượt ~10 000 scenario, **hoặc**
- p95 của retrieval vượt 200 ms trên tập thật, **hoặc**
- Cần nhiều backend instance ghi đồng thời — khi đó SQLite cũng phải lên PostgreSQL, trùng đúng tiêu chí đã ghi trong [ADR-011](README.md).

## Hệ quả

**Tài liệu cập nhật cùng lúc với ADR này:** `ARCHITECTURE.md` (sơ đồ, bất biến, bảng ranh giới, bất biến CI, bảng trạng thái), `docs/plan.md` (§3, §4 W3, §10), `docs/adr/README.md`, `docs/adr/ADR-003` (đánh dấu Superseded).

**Nợ code — làm ở PR riêng**, theo "Quy tắc thay đổi" của `ARCHITECTURE.md` (đổi hình dạng dữ liệu thì sửa `schemas.py`, fixtures và tests trong cùng PR):

- `requirements.txt:13-14` — bỏ `qdrant-client`.
- `src/config.py:34-39` — bỏ `qdrant_url`, `qdrant_api_key`, `qdrant_collection`; thay bằng cấu hình đường dẫn `.db` theo ADR-011.
- `src/models/schemas.py` — docstring nhắc Qdrant ở các dòng 14, 153-158, 275-277, 332-336, 547, 930 phải viết lại theo SQLite; ngữ nghĩa `ODDCell.filter_payload()` **không đổi**, chỉ đổi chỗ tiêu thụ.
- `tests/test_architecture.py:58-62` — đổi bất biến "router không `import qdrant`" thành "router không tự truy vấn retrieval store", để test còn ý nghĩa sau khi bỏ Qdrant.

**Gate-1 artifacts đã cập nhật theo** (`02-prd.md` §3.2, §6.3, FR-02, §9, §10; `03-wireframe-ui-flow.md` §1, §6) và **phải upload lại bản mới lên Drive** — nếu không, bản trên Drive sẽ mô tả một kiến trúc không còn tồn tại.

**Một ràng buộc của ADR-006 đổi chỗ thi hành, không đổi nội dung.** [ADR-006](ADR-006-embeddings-openai-thay-vi-sentence-transformers.md) §Hệ quả yêu cầu *"ghi tên model vào payload của mỗi điểm trong Qdrant để biết vector nào sinh bằng model nào"* — vì đổi model embedding đòi re-embed toàn bộ corpus. Yêu cầu đó giữ nguyên, chỉ chuyển thành **một cột `embedding_model` nằm cạnh cột BLOB**. Không viết errata cho ADR-006 vì quyết định của nó không đổi.

**Rủi ro chấp nhận:** nếu đề bài được chấm theo đúng chữ "Vector DB (Qdrant)", việc không dùng Qdrant cần được giải thích khi demo. ADR này là phần giải thích đó.
