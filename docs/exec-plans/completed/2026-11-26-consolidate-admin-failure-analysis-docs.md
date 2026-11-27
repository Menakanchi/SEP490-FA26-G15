# Gộp tài liệu Admin và Phân tích lỗi

Người dùng yêu cầu dọn tài liệu thuộc phần của mình và cho phép một tài liệu
tổng hợp. Baseline: `main`, `668f1504`, Git sạch. Giới hạn Module3 và chuỗi
Admin/Analysis của chuvv; giữ ADR, hợp đồng khoa học và tài liệu module khác.

1. Đối chiếu lịch sử tác giả, ADR-067 và source hiện hành; chốt danh sách file dư.
2. Gộp hướng dẫn bảo trì, API/input, chạy/test và giới hạn còn mở vào README
   của Failure Analysis. Giữ bytes của mẫu/fixtures cần cho tests.
3. Bỏ báo cáo/kế hoạch sinh lặp, sửa các liên kết tham chiếu; có bản khôi phục
   trong target bị Git bỏ qua. Không sửa implementation hoặc DB.
4. Kiểm hash, links, test đọc fixture và RepoDocsTest; ghi kết quả rồi đóng plan.

Hoàn tất26/11/2026: gộp nội dung bảo trì/API/input/chạy/test/giới hạn vào
docs/failure-analysis-v3/README.md. Loại169file khỏi docs (164file dư, năm HTTP
fixtures chuyển nguyên bytes sang frontend/tests/fixtures/fa-v3). Phần Failure
Analysis còn19files: hướng dẫn tổng hợp, AGENTS, tám đặc tả, M2 plan, CLI helper,
original inputs/provenance và Golden18 fixture. Giữ các kế hoạch/module khác.

Đã đọc AGENTS/CLAUDE/scoped guides, Admin handover, metric contract/ADR-055,
ADR-067 và source controller/client hiện hành, REST/input mapping, runbook/M2 plan.
Sửa mô tả lỗi REST theo source mới: code/detail/retryable ở cấp ngoài cùng;
AdminFrame/sidebar chung và workspace scope theo code hiện tại.

Kiểm chứng:149/149 Java tests PASS (gồm RepoDocsTest5 và Golden18 integration79),
0fail/error/skip; frontend analysis-v3:7/7PASS sau npm ci theo lockfile do thiếu
TypeScript lúc đầu. Không sửa package/lockfile hoặc assertions.806local Markdown
links:0link thiếu mới/0anchor lỗi; git diff --check PASS.766protected files và
năm fixtures chuyển vị trí giữ hash. Không chạy live DB/CARLA/MOBO hoặc full build.

Implementation Java/frontend, schema/DB và cấu hình giữ nguyên. Chỉ sửa test
fixture path, hướng dẫn AGENTS và link tới tài liệu đã gộp ở các file ngoài docs
đang dọn. Bản khôi phục169files có hash tại target/docs-consolidate-668f1504/removed
(gitignored). Không stage/commit/push.
