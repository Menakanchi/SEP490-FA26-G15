# ADR-003: Dùng Qdrant làm vector store thay vì ChromaDB của template

**Ngày:** 2026-07-28
**Trạng thái:** Accepted

## Bối cảnh

Thư viện kịch bản cần tìm kiếm ngữ nghĩa: cho một câu tiếng Việt, tìm 3 scenario cũ giống nhất để làm few-shot cho LLM, và cho người dùng tra cứu thư viện.

Template của chương trình có sẵn `chroma_persist_dir` trong `config.py` và tài liệu free-accounts khuyên ChromaDB. Đề bài RAV-03 lại nêu đích danh Qdrant.

Yêu cầu thật của bài toán: lọc theo **nhãn ODD** (loại xe, thời tiết, loại đường, tình huống) cùng lúc với tìm kiếm vector — không phải tìm vector thuần.

## Các lựa chọn

### Lựa chọn 1: ChromaDB theo template
- Ưu: template đã cấu hình sẵn; nhúng trực tiếp trong process, không cần service riêng.
- Nhược: lọc metadata yếu hơn; chạy nhúng trong process backend ⇒ ăn vào 512MB RAM của Render; không có bản cloud miễn phí tương đương.

### Lựa chọn 2: Qdrant
- Ưu: **payload filter** kết hợp với vector search là tính năng hạng nhất — đúng thứ bài toán ODD cần; có Qdrant Cloud free tier 1GB; chạy được local qua `docker-compose` cho dev.
- Nhược: lệch với cấu hình mặc định của template; thêm một service trong `docker-compose`.

### Lựa chọn 3: pgvector trên Postgres
- Ưu: một database cho cả dữ liệu quan hệ lẫn vector.
- Nhược: phải tự dựng Postgres; không có free tier tiện; thêm việc cho đội đang gấp.

## Quyết định

**Lựa chọn 2: Qdrant.**

Giữ nguyên **cơ chế cấu hình** của template (`pydantic-settings`), chỉ thay nội dung: bỏ `chroma_persist_dir`, thêm `qdrant_url` và `qdrant_api_key`.

Dev chạy Qdrant local qua `docker-compose`; production dùng Qdrant Cloud free tier.

## Lý do

1. **Đề bài thắng template ở chỗ này.** Đề yêu cầu Qdrant; template chỉ *gợi ý* Chroma và bản thân tài liệu free-accounts của chương trình cũng liệt kê Qdrant Cloud free 1GB.
2. Tìm kiếm của Forge về bản chất là **vector + filter theo nhãn ODD**. Payload filter của Qdrant làm việc này trực tiếp; với Chroma phải lọc sau hoặc lọc thô.
3. Tách vector store ra khỏi process backend giúp giữ RAM backend dưới trần 512MB của Render.
4. Đổi vector store là quyết định **khó đảo ngược ở giữa dự án** (phải re-embed, đổi query, đổi eval) — nên chọn đúng từ tuần 1, không thử rồi đổi.

## Hệ quả

- Thêm service `qdrant` vào `docker-compose.yml`.
- Cần tài khoản Qdrant Cloud (miễn phí, không cần thẻ) — thuộc việc của Chi trong 48 giờ đầu.
- `src/services/library/store.py` viết theo Qdrant client; nếu sau này đổi, đây là file duy nhất phải sửa.
- Corpus dự kiến dưới 10K vector nên giữ **HNSW mặc định** của Qdrant. Việc kiểm chứng lựa chọn index (chạy lại eval với `search_params={"exact": True}` để so với brute force) tách thành **ADR-009**, không thuộc phạm vi ADR này.
