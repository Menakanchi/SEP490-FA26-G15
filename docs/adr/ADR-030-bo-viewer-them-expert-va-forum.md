# ADR-030 — Bỏ role VIEWER, thêm role EXPERT và forum AEB chung toàn hệ thống

**Trạng thái:** Proposed 03/10/2026 (TrungDQ, nhánh `trungdam`; chờ nhóm duyệt). Phần role (EXPERT, bỏ
VIEWER) và hai bảng forum **đã vào schema** cùng [ADR-031](ADR-031-database-phu-du-chuc-nang.md) — DDL chuẩn
ở `database/mysql/01_schema.sql`, khối SQL bên dưới là bản đề xuất ban đầu. API/màn hình forum chưa code.
**Phạm vi:** role hệ thống của VehicSim + xác thực dùng chung (MySQL `roles`/`user_roles`) và hai
bảng forum mới. Role riêng của Scenario Forge (SQLite: creator/reviewer/viewer) **không** đổi.

## Bối cảnh

Ngày 03/10 TrungDQ chốt:

- Không cần tài khoản "chỉ xem" nữa — **bỏ hẳn VIEWER**.
- Thêm **EXPERT**: chuyên gia ngoài, dùng mọi chức năng chạy/kiểm thử như ENGINEER, đăng bài forum
  và trả lời comment.
- **Một forum chung cho cả hệ thống**, nội dung xoay quanh **AEB** (không gắn với từng project).
- ENGINEER cũng đăng bài được nhưng **bài phải được ADMIN hoặc EXPERT duyệt**; **comment không cần
  duyệt** với mọi role.
- ADMIN/EXPERT được **ẩn/xoá** bài và comment vi phạm, kể cả nội dung đã duyệt.
- EXPERT là **role hệ thống** (bảng `roles`), không phải role trong từng project.

ERD `vehicsim_erd.drawio` (PhuongNA, 03/10) đã vẽ `forum_posts` / `forum_comments` theo project;
DB và code chưa có. DB dev lúc quyết định: ADMIN 1 user, ENGINEER 1 user, VIEWER 0 user,
`project_members` rỗng.

## Các lựa chọn

1. Giữ VIEWER, thêm EXPERT — bị loại: nhóm không cần tài khoản chỉ xem.
2. EXPERT là role trong project — bị loại: code phân quyền hiện chỉ đọc role hệ thống.
3. Forum theo từng project — bị loại: nhóm muốn kiến thức AEB dùng chung giữa mọi người.
4. **EXPERT là role hệ thống, một forum AEB chung, chỉ duyệt bài của ENGINEER** — chọn.

## Quyết định

**Role hệ thống còn ba:** `ADMIN`, `EXPERT`, `ENGINEER` (người tự đăng ký vẫn mặc định ENGINEER;
EXPERT và ADMIN chỉ gán tay bằng script, không có API công khai — giống ADMIN hiện nay).

| Quyền | ADMIN | EXPERT | ENGINEER |
|---|---|---|---|
| Đọc mọi màn VehicSim, chạy/kiểm thử, regression, Accept/Reject, hỏi Meomeo Agent | ✓ | ✓ | ✓ |
| Xem forum (bài đã duyệt, chưa ẩn) | ✓ | ✓ | ✓ |
| Đăng / sửa / xoá **bài của mình** | – | ✓ hiện ngay | ✓ **chờ duyệt** |
| Comment, trả lời comment | ✓ hiện ngay | ✓ hiện ngay | ✓ hiện ngay |
| Đánh dấu câu trả lời chuyên gia (`is_expert_answer`) | – | ✓ | – |
| Duyệt / từ chối bài chờ duyệt | ✓ | ✓ | – |
| Ẩn / xoá bài hoặc comment vi phạm (kể cả đã duyệt) | ✓ | ✓ | – |

**Luồng bài viết** (`forum_posts.moderation_status`):

```
ENGINEER đăng ─▶ PENDING ─(ADMIN/EXPERT duyệt)─▶ APPROVED ─(vi phạm)─▶ HIDDEN
                    └──────(từ chối + lý do)───▶ REJECTED
EXPERT đăng ───────────────────────────────────▶ APPROVED
```

- `PENDING`/`REJECTED`/`HIDDEN` chỉ tác giả, ADMIN, EXPERT thấy; `REJECTED` và `HIDDEN` bắt buộc lý do.
- Không ai tự duyệt bài của chính mình (EXPERT đăng thì hiện ngay, không qua bước duyệt).
- ENGINEER sửa bài đã duyệt ⇒ quay về `PENDING`.
- **Comment** hiện ngay khi gửi; ADMIN/EXPERT chỉ can thiệp sau (`is_hidden`).
- "Xoá" của moderator là ẩn (giữ dấu vết ai ẩn, lúc nào, vì sao); tác giả xoá bài/comment của mình
  là xoá thật.

Trong code: `WRITE_ROLES = {"ADMIN", "EXPERT", "ENGINEER"}`, thêm `MODERATOR_ROLES = {"ADMIN", "EXPERT"}`
và `require_moderator`; truy vấn danh sách bài chỉ trả `APPROVED` trừ khi người xem là tác giả hoặc
moderator; comment `is_hidden = 1` chỉ moderator thấy.

**Nội dung AEB:** mỗi bài có `topic` theo bốn khâu lỗi của dự án + các chủ đề AEB khác, và có thể gắn
một trong 10 tham số AEB (`aeb_parameters`, bảng dùng chung, không thuộc project nào).

**Schema đề xuất** (bám cột ERD của PhuongNA; bỏ `project_id`, thay `reference_simulation_id` bằng
`aeb_parameter_id` — xem Hệ quả):

```sql
INSERT INTO roles (code, name, description) VALUES
  ('EXPERT', 'Expert', 'Chuyên gia: chạy và kiểm thử như Engineer, đăng bài và duyệt forum AEB');
-- bỏ VIEWER: chỉ chạy khi không còn user nào mang role này
DELETE FROM roles WHERE code = 'VIEWER';
ALTER TABLE project_members
  MODIFY member_role ENUM('OWNER','ENGINEER','EXPERT') NOT NULL DEFAULT 'ENGINEER';

CREATE TABLE forum_posts (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id         BIGINT UNSIGNED NOT NULL,                -- EXPERT hoặc ENGINEER (kiểm ở API)
  title             VARCHAR(255) NOT NULL,
  content           LONGTEXT NOT NULL,                       -- Markdown
  post_type         ENUM('QUESTION','DISCUSSION','GUIDE','ANNOUNCEMENT') NOT NULL DEFAULT 'DISCUSSION',
  topic             ENUM('PERCEPTION','DECISION','CONTROL','VEHICLE_DYNAMICS',
                         'SCENARIO','PARAMETER_TUNING','REGRESSION','GENERAL') NOT NULL DEFAULT 'GENERAL',
  aeb_parameter_id  TINYINT UNSIGNED NULL,                   -- tham số AEB được bàn tới, tuỳ chọn
  status            ENUM('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  view_count        INT UNSIGNED NOT NULL DEFAULT 0,
  is_pinned         TINYINT(1) NOT NULL DEFAULT 0,
  moderation_status ENUM('PENDING','APPROVED','REJECTED','HIDDEN') NOT NULL DEFAULT 'PENDING',
  moderated_by      BIGINT UNSIGNED NULL,                    -- ADMIN/EXPERT, khác author_id
  moderated_at      DATETIME NULL,
  moderation_note   VARCHAR(500) NULL,                       -- bắt buộc khi REJECTED/HIDDEN (kiểm ở API)
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fp_list (moderation_status, is_pinned, created_at),
  KEY idx_fp_topic (topic, created_at),
  CONSTRAINT fk_fp_author    FOREIGN KEY (author_id)        REFERENCES users(id),
  CONSTRAINT fk_fp_moderator FOREIGN KEY (moderated_by)     REFERENCES users(id),
  CONSTRAINT fk_fp_parameter FOREIGN KEY (aeb_parameter_id) REFERENCES aeb_parameters(id),
  CONSTRAINT ck_fp_no_self_moderation CHECK (moderated_by IS NULL OR moderated_by <> author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE forum_comments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id           BIGINT UNSIGNED NOT NULL,
  parent_comment_id BIGINT UNSIGNED NULL,                    -- trả lời theo luồng
  author_id         BIGINT UNSIGNED NOT NULL,
  content           TEXT NOT NULL,
  is_expert_answer  TINYINT(1) NOT NULL DEFAULT 0,           -- EXPERT đánh dấu câu trả lời chuyên gia
  is_hidden         TINYINT(1) NOT NULL DEFAULT 0,           -- comment không cần duyệt, chỉ ẩn khi vi phạm
  hidden_by         BIGINT UNSIGNED NULL,
  hidden_at         DATETIME NULL,
  hidden_note       VARCHAR(500) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fc_post (post_id, is_hidden, created_at),
  CONSTRAINT fk_fc_post   FOREIGN KEY (post_id)           REFERENCES forum_posts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_fc_parent FOREIGN KEY (parent_comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_fc_author FOREIGN KEY (author_id)         REFERENCES users(id),
  CONSTRAINT fk_fc_hider  FOREIGN KEY (hidden_by)         REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

DB lên **30 bảng** (28 + 2), vẫn trong khoảng 25–40 của giảng viên.

## Hệ quả

- **Luật cứng 3** (`AGENTS.md`) đổi thành: mọi route `/api/v1/vehicsim/*` cần đăng nhập; bài forum
  của ENGINEER chỉ hiện cho người khác sau khi ADMIN/EXPERT duyệt; không ai tự duyệt bài của mình;
  chỉ ADMIN/EXPERT ẩn được nội dung người khác. Test `test_viewer_can_read_but_not_write` thay bằng
  test quyền + luồng duyệt forum; fixture `viewer` trong `tests/test_vehicsim/conftest.py` bỏ, thêm
  `expert`.
- **Mất tài khoản chỉ xem:** ai đăng nhập cũng chạy mô phỏng và Accept/Reject được. Cần cho giảng
  viên/khách xem demo mà không sửa gì thì phải mở lại quyết định này.
- **Forum chung ⇒ không link run của project.** `reference_simulation_id` trong ERD bị bỏ: forum ai
  cũng đọc, còn run thuộc project riêng — link vào sẽ lộ dữ liệu project cho người ngoài. Muốn dẫn
  chứng thì tác giả tự chép số liệu vào bài. ERD cần sửa theo (bỏ `project_id`,
  `reference_simulation_id`; thêm `topic`, `aeb_parameter_id`, các cột duyệt/ẩn).
- **Comment không duyệt** ⇒ cần giới hạn tần suất (như `/assistant/ask`) và kiểm duyệt sau bằng ẩn.
- **Meomeo Agent** (ADR-029): bản này agent **không** đọc forum. Nếu sau này cho đọc thì forum là dữ
  liệu do người dùng viết — phải đi qua lớp nhốt nonce + `guardrails.clean` và che tên tác giả.
- **Nội dung do người dùng nhập:** Markdown render phía frontend phải tắt HTML thô (chống XSS).
- **Màn hình mới** (luật giảng viên: 4 màn/thực thể chính): `ListForumPost`, `AddForumPost`,
  `EditForumPost`, `ViewForumPostDetail` (comment nằm trong màn chi tiết), cộng hàng chờ
  "Bài chờ duyệt" cho ADMIN/EXPERT. Forum nằm ngoài project ⇒ trang mới ở thư mục gốc phải thêm
  tiền tố vào `VEHICSIM_PREFIXES`.
- Sửa cùng PR khi code: `01_schema.sql` + `tables.py` (luật mềm), seed `roles`, `vehicsim_routes.py`,
  `frontend/src/types/auth.ts`, `VehicSimContext.tsx`, nhãn role ở `VehicSimUi.tsx`; DB đang chạy
  `ALTER` tay theo khối SQL trên.
