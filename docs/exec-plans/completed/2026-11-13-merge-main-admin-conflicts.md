# Tích hợp origin/main và giữ Admin UI trên chuvv

Ngày 13/11/2026. Nhánh `chuvv`; HEAD ban đầu `8a6a579`;
MERGE_HEAD và origin/main `a84349d`. Người dùng đã khởi tạo merge trước phiên này.
Trạng thái: hoàn tất xử lý nội dung và QA; chờ người dùng review/commit merge.

## Căn cứ và phạm vi

Đã đọc AGENTS.md, DESIGN.md, CLAUDE.md, hướng dẫn frontend,
hướng dẫn đổi gói/mục 7, Next CSS Modules cài trong repo và bàn giao theme 09/11.
Đọc lại kết quả Admin refinement: /admin chuyển tới /admin/users, ba mục quản trị,
foundation có token kích thước, bảng workspace năm cột và success focus sau refetch.

Đã gọi `git show :2:<path>` và `git show :3:<path>` cho cả 8 file.
Stage 2 là chuvv, stage 3 là main. Dashboard CSS không có stage 2 vì chuvv đã xóa;
lỗi exit 128 của lệnh show đó là trạng thái deleted-by-us đã xác nhận.
Đối chiếu CSS classes/imports, component sử dụng thực tế, globals.css, AdminShell,
VehicSimShell, project context/navigation, guards regression và fixture hiện hành.

Chỉ sửa 8 file conflict, mô tả Reviewer bị lỗi thời do quyền mới từ main,
và sáu harness Admin cần cập nhật hợp đồng UI/context để kiểm chứng tích hợp.
Thêm báo cáo này theo quy trình exec plan. Không sửa backend, schema hoặc file
production đã merge sạch nào khác. Không tạo tính năng Admin mới.

## Quyết định cho từng conflict

| File | Giữ từ chuvv | Tích hợp từ main và lý do |
|---|---|---|
| frontend/src/components/VehicSimSidebar.tsx | Ba mục Admin: tài khoản/workspace/tài liệu; không thêm lại Overview | Giữ project journey/switcher, reviewer project context, my-work, decision history và query-aware active nav; chỉ hòa giải mục Admin |
| frontend/src/components/admin/AdminDashboard.module.css | Giữ xóa | Không còn AdminDashboard.tsx hoặc import CSS trong frontend/src; /admin redirect tới users. CSS main chỉ phục vụ dashboard đã gỡ, không được khôi phục UI cũ |
| frontend/src/components/admin/AdminEditor.module.css | Metric/token, header/footer cố định, body scroll, chữ 20px/14px, control 40/44px, focus/error/review | Backdrop màu theme và palette qua scoped tokens, primary hover mới; giữ cấu trúc dialog đã QA |
| frontend/src/components/admin/AdminReferences.module.css | Grid 2 cột/mobile 1 cột và kích thước textarea | Màu chữ/viền qua token theme; không đổi fields hoặc payload |
| frontend/src/components/admin/AdminShell.module.css | Sidebar 248px, ba mục, active indicator, mobile menu, skip/focus, spacing/typography | Surface/canvas/accent qua palette chung; giữ layout Admin thay vì dùng metric nhỏ hơn của main |
| frontend/src/components/admin/AdminTable.module.css | Sticky actions, responsive, control height, selector tiêu đề chỉ listHeader/resultsHeader | Semantic colors và primary hover theo theme. Không hồi quy selector .list h2 làm ảnh hưởng tiêu đề modal |
| frontend/src/components/admin/AdminTokens.module.css | Toàn bộ spacing/font/radius/control/mobile/layout tokens | Ánh xạ ink/surface/canvas/accent/focus/success/danger/warning sang --color-vehicsim-*. Thêm primary-hover; viền input dùng faint cùng palette để giữ tương phản 5,44:1 với surface |
| frontend/src/components/admin/AdminWorkspaces.module.css | Bảng 880px/năm cột, counts gộp, feedback/focus và Manager search/paging | Màu ô chọn, textarea, viền/chữ theo theme chung, không quay lại bảng 1050px |

Đã kiểm tra không thiếu CSS class nào của main trong sáu module CSS được giữ.
Palette từ DESIGN.md được dùng cho Admin trong khi metrics của chuvv được bảo toàn.

## Lỗi tích hợp trực tiếp và cập nhật harness

- `AdminUserEditor.tsx`: mô tả REVIEWER được chạy regression để kiểm tra, chấp nhận/
  từ chối trong project được cấp quyền, không tạo kịch bản/candidate. Theo
  `requireRegressionRunner`, RegressionController và ADR-049 từ main; không sửa quyền.
- `admin-redesign.mjs`: cập nhật tên thông báo AuthGate, chiều rộng global sidebar
  232px (Admin vẫn 248px); kiểm màu theme mới và link my-work của ENGINEER/REVIEWER.
- `admin-user-forms.mjs`: kỳ vọng quyền REVIEWER mới.
- Sáu harness Admin: context fixture có reviewer_projects/reviewer_can_decide,
  projects fixture rỗng cho navigation mới, text thiếu quyền đúng UI main.
- `admin-consistency.mjs`: kiểm focus bám primary theme thay cho hardcode xanh dương.
  Cho phép output riêng để không ghi đè evidence cũ.
- Giữ các assertion quota/permission/self/dependency/stale/payload/dirty/busy/refetch,
  precision số tài liệu, keyboard/mobile và success focus.

## Validation thực chạy

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` trong frontend | PASS, cả vòng cuối sau cập nhật harness |
| `npx.cmd tsc --noEmit` trong frontend | PASS |
| `npx.cmd next build` trong frontend | PASS, có các route projects/my-work/validation/decisions mới |
| `node --test tests/chat-stream.test.mjs tests/reviewer-project.test.mjs` trong frontend | PASS 6 |
| `.\mvnw.cmd -B -Dtest=AdminSecurityTest,VehicSimSecurityTest,RepoDocsTest test` | PASS 21, không fail/error/skip; compile backend/test sources sau merge |
| `admin-redesign.mjs` | PASS, 19 ảnh; theme mới và metrics cũ cùng hoạt động |
| `admin-user-forms.mjs` | PASS, 16 ảnh |
| `admin-workspaces.mjs` | PASS, 23 ảnh |
| `admin-users-table.mjs` | PASS, 11 ảnh |
| `admin-consistency.mjs` | PASS, 15 ảnh |
| `admin-dashboard.mjs` (entry regression) | PASS, 10 ảnh |
| `git diff --check` (worktree sau xử lý) | PASS |
| `RepoDocsTest` sau hoàn tất báo cáo | PASS 5, không fail/error/skip |
| `git diff --cached --check` (toàn bộ merge) | FAIL: 9 dòng trailing whitespace có sẵn trong main, xem dưới |

Browser chạy production frontend ở `127.0.0.1:3113`, login bằng HTTP fixture,
không ghi API/DB thật. Đã xem ảnh Admin desktop/mobile, review đổi role và workspace
success focus sau lọc. Tổng 94 ảnh. Server QA đã dừng.
Đối chiếu DESIGN.md và code theme; chưa có Figma Admin để đối chiếu trực tiếp.
Chưa kiểm live auth/DB, CARLA hoặc toàn bộ chức năng backend mới bằng E2E.

Bản stage 2/3, nội dung conflict ban đầu, hash các file đã merge sạch và artifacts:
`data/merge-admin-2026-11-13/`, gitignore. Sáu thư mục suite chứa result.json PASS.
Bản đầu suite consistency còn kỳ vọng #2563eb đã thất bại; sửa fixture/assertion
để phản ánh theme mới, chạy lại consistency và entry đều PASS.

## Phần còn lại và bảo toàn merge

9 dòng whitespace đã kiểm trực tiếp bằng `git show MERGE_HEAD:<path>`:
- `frontend/src/app/projects/[projectId]/improve/page.tsx`: 24
- `frontend/src/app/projects/[projectId]/results/page.tsx`: 274
- `frontend/src/app/projects/[projectId]/rounds/[testId]/page.tsx`: 187
- `frontend/src/app/projects/[projectId]/start/page.tsx`: 141, 152, 163
- `frontend/src/app/workspace/[workspaceId]/reports/page.tsx`: 294
- `frontend/src/app/workspace/[workspaceId]/tasks/page.tsx`: 563
- `frontend/src/components/project/ProjectForms.tsx`: 373

Giữ nguyên bảy file này vì đã merge sạch và ngoài phạm vi conflict; không tuyên bố
toàn bộ staged diff sạch whitespace. Đây là vấn đề formatting, không phải marker merge.

Hash baseline xác nhận trước staging: ngoài một file mô tả role và sáu harness
được liệt kê, toàn bộ file đã merge sạch giữ nguyên working bytes và stage-0 blob.
HEAD/MERGE_HEAD giữ nguyên. Không commit/push, không sửa main, reset/abort/rebase.
Đánh dấu các file đã giải quyết trong index để người dùng review và tự commit merge.


Kiểm tra index cuối: 0 unmerged (cả diff-filter=U và ls-files --unmerged),
0 unstaged; không còn marker trong frontend/src/docs/database/worker.
Scoped cached diff của các file xử lý PASS whitespace; toàn bộ cached diff vẫn có
đúng 9 dòng từ main nêu trên. Hash/index ngoài 7 file tích hợp trực tiếp giữ nguyên.
HEAD và MERGE_HEAD không đổi; merge vẫn mở để người dùng commit thủ công.
