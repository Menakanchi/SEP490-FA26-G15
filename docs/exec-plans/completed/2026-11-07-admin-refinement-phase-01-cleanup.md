# Admin refinement — Phase 01: Project Cleanup

Ngày: 07/11/2026. Nhánh: chuvv. Mốc kiểm kê: 1bcf2d6.
Trạng thái: hoàn thành Phase 01; dừng chờ review.

## Phạm vi và tiêu chí

Yêu cầu mới bắt đầu chuỗi 10 phase từ Phase 01; không tiếp tục đợt 9 của
chuỗi cũ. Chỉ kiểm kê và xóa file thừa khi đã có bằng chứng không còn sử dụng.
Không sửa UI, API, nghiệp vụ, quyền, schema, dependencies hoặc dữ liệu local.
Không tự commit/push và không triển khai Phase 02.

Tiêu chí: đối chiếu Git/history, phân loại test/tài liệu/output, kiểm references,
giữ file chưa đủ bằng chứng, kiểm chứng thay đổi thực tế và bàn giao độc lập.

## Trạng thái ban đầu và cách kiểm tra

- `git status --short --untracked-files=all`: sạch; không có thay đổi có sẵn.
- `git log -10 --oneline`: các đợt Admin trước đã commit; HEAD 1bcf2d6.
- Đọc AGENTS.md, CLAUDE.md, hướng dẫn frontend, hướng dẫn đổi gói và quy tắc tên.
- Kiểm kê 621 file tracked bằng `git ls-files`; kiểm file untracked không bị ignore.
- `rg --files --hidden` kiểm tên test/debug/temp/output/report và DOCX.
- Quét thêm file bị ignore ngoài .git/node_modules/.next/target/venv/data/camera
  để tìm Word/PDF/log/tmp/bak/debug/output; không có kết quả trong phạm vi này.
- `git status --short --ignored --untracked-files=normal` chỉ ra build/cache và
  bằng chứng QA local. Chỉ xem tên, không đọc cấu hình máy hoặc dữ liệu cá nhân.
- Đọc CI, Makefile, pytest.ini, package.json, scripts và tài liệu bàn giao;
  dùng `rg` tìm references, `git log -- <path>` xác minh nguồn gốc.

## Quyết định giữ/xóa

| Nhóm | Bằng chứng | Quyết định |
|---|---|---|
| 60 lớp Java *Test.java | CI chạy Maven test; kiểm nghiệp vụ, security, core, tài liệu | Giữ |
| 9 worker test_*.py và conftest.py | pytest.ini chọn worker/tests; CI chạy pytest/ruff | Giữ |
| 6 Admin browser harness + 2 Analysis harness | Có assertion; được dẫn trong các kế hoạch hoàn thành, không chỉ chụp ảnh | Giữ |
| scripts/TestAdminIntegration.mjs | Kiểm HTTP/MySQL/Redis, race, rollback trên QA riêng; kế hoạch Admin gốc dẫn tới | Giữ |
| scripts/TestAdminMigration.mjs | Kiểm migration 012 và dữ liệu cũ; khác phạm vi test UI | Giữ |
| scripts/TestAdminBrowser.mjs | Bằng chứng browser/backend thật của Admin gốc; cần kiểm lại selector/flow sau redesign | Giữ, chưa đủ căn cứ xóa |
| scripts/IntegrationSmoke.java | Chế độ analysis/merge được tài liệu dẫn; sinh evidence cho UI integration | Giữ |
| tests/schemas và tests/test_openscenario/goldens | Java đọc XSD; kiến trúc dẫn bộ 6 golden lịch sử | Giữ |
| 118 Markdown trong docs/ | ADR, đặc tả, kế hoạch và bằng chứng bàn giao; lịch sử không tự trở thành tài liệu thừa | Giữ |
| Word/PDF trong tracked files | Không có .docx/.doc/.pdf | Không có file để xóa |
| Output tạm trong tracked files | Không có .log/.tmp/.bak/.old hoặc tên kết thúc bằng ~ | Không có file để xóa |
| data/*-ui và result.json local | Bằng chứng QA được các kế hoạch trước dẫn tới, đã gitignore | Giữ |
| target/, frontend/.next/, node_modules/, tsbuildinfo, next-env.d.ts | Build/dependency/cache được ignore; xóa không tạo cleanup có thể review trong Git | Giữ |

SHA-256 của 8 browser harness và 4 script tích hợp không có cặp file trùng byte.
Kết quả này chỉ loại trừ bản sao nguyên file, không chứng minh không trùng logic.
Các harness fixture và live integration kiểm hai phạm vi khác nhau; việc không
được gọi trong npm scripts/CI không đủ chứng minh test thủ công đã bỏ dùng.

**Kết quả cleanup: 0 file bị xóa.** Không có ứng viên đạt đủ điều kiện.
Không xóa bằng chứng QA hoặc test hữu ích để tạo diff cleanup.

## Kiểm chứng

- `.\mvnw.cmd -B -Dtest=RepoDocsTest test`: PASS, 5 test, 0 failure/error/skip.
- `git diff --check`: PASS cho tracked diff; không có thay đổi tracked/staged.
- Kiểm riêng file báo cáo mới: UTF-8, không BOM, không whitespace cuối dòng.
- Git sau phase: duy nhất 1 báo cáo mới, không sửa/xóa file có sẵn.
Không cần frontend/backend full build hoặc browser QA vì chỉ thêm báo cáo,
không xóa/đổi đường dẫn source, imports, dependencies hay test fixtures.

## Hạn chế và bàn giao

- Không chạy lại live integration, không xác nhận các harness cũ còn tương thích UI.
  TestAdminBrowser dùng flow/selector từ trước redesign; cần revalidate khi làm QA.
- Header analysis-ui-smoke.mjs còn nhắc script Python đã port sang
  IntegrationSmoke.java; giữ nguyên vì ngoài phạm vi cleanup Admin.
- Không kiểm nội dung cá nhân hay xóa artifact trong data/target; không kết luận
  tất cả file bị ignore là rác.
- Không sửa UI; không có đánh giá Figma hoặc xác nhận app sẵn sàng demo ở phase này.
- File thêm duy nhất: docs/exec-plans/completed/2026-11-07-admin-refinement-phase-01-cleanup.md.
- Không có file sửa/xóa, migration, API hoặc dữ liệu thay đổi.

Commit gợi ý theo thay đổi thực tế:
`docs(admin): record project cleanup inventory and retention decisions`
Không dùng commit “remove obsolete…” vì thực tế không xóa file.

Bước tiếp theo (chưa thực hiện): Phase 02 — Admin Audit & UX Strategy;
đọc nghiệp vụ/source và phân loại dashboard P0/P1/P2/Reject, chỉ viết Markdown.
