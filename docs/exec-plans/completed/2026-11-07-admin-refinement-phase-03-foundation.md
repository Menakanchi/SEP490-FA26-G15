# Admin refinement — Phase 03: Admin Design Foundation

Ngày 07/11/2026; nhánh chuvv; HEAD trước thay đổi 1438ec3; Git ban đầu sạch.
Trạng thái: hoàn thành triển khai và QA UI; dừng trước Phase 04.

## Phạm vi và căn cứ

Theo [Phase 02](../completed/2026-11-07-admin-refinement-phase-02-audit.md).
Đọc hướng dẫn repo/frontend, đổi gói và tài liệu Next cài sẵn về CSS Modules,
CSS ordering và accessibility. Giữ CSS scoped vì stylesheet có thể tồn tại sau đổi route.
Audit: token cũ chỉ phủ màu cơ bản; chữ phụ 9–11px, weight 650/750 ngoài các weight
Jakarta đã tải, spacing/radius và màu trạng thái rải trong nhiều file.
Button bảng 38px, editor 40px, input 40/42px; primary hover áp dụng cả khi disabled.

Không đổi routes, redirect /admin, số KPI/fetch, guards, form fields/handlers,
API/schema/auth/dependencies hoặc module khác. Dashboard chỉ đổi presentation.
Sidebar vẫn có Overview ở phase này; việc bỏ Overview thuộc Phase 04.

## Nền tảng đã áp dụng

| Nhóm | Quyết định và mục đích |
|---|---|
| Typography | Giữ Jakarta sẵn có; caption 12px, control/table 13px, body 14px, section 16px, modal title 20px, page title clamp 24–30px; weight 600/700 thay 650/750 |
| Palette | Giữ nền trung tính và primary tối; bổ sung accent, success/danger/warning cùng nền/viền có ngữ nghĩa |
| Control boundary | Input border từ #dce3ee sang #7c8ba1 để thấy ranh giới rõ hơn trên nền trắng |
| Spacing | Scale 4/8/12/16/20/24/32px; áp dụng margin/padding/gap trong shell, table, editor và các resource |
| Radius | Small 6px, control 10px, panel 16px; avatar giữ hình tròn |
| Control size | Min-height 40px, mobile dưới 640px là 44px cho button/select/editor input và search wrapper; giữ kích thước checkbox/radio riêng |
| States | Accent dùng chung cho active nav/Manager selection; màu thông báo semantic; disabled opacity dùng token, primary hover chỉ enabled |
| Containers | Giữ sidebar 248px/content max 1480px, gom thành token; mobile/form/body scroll và sticky actions giữ cấu trúc |
| Breakpoints | Giữ sidebar desktop từ 1100px, mobile dưới 640px, grid table dưới 1280px; grid dashboard sẵn có không đổi |
| Navigation/header | Giữ menu desktop/mobile, breadcrumb/h1, skip link và metadata; chữ/cách dòng/focus dễ đọc hơn, không thêm menu song song |

Không thêm shared component: shell/table/editor/dialog hook đã dùng chung;
thay token/style đủ cho nhu cầu tái sử dụng này.
Token scope chỉ gắn trên Admin sidebar/frame; native dialog kế thừa token từ DOM.

## Lỗi phát hiện qua ảnh và sửa

Selector cũ .list h2 tác động cả tiêu đề modal nằm bên trong danh sách; thứ tự CSS
có thể làm modal title chỉ còn 16px. Giới hạn vào .listHeader h2/.resultsHeader h2.
Harness hiện có kiểm cả ba modal title luôn 20px và input 14px.
Không thay DOM/TSX component hoặc logic đóng/mở/lưu form để sửa lỗi trình bày.

## Kiểm chứng

- `npm.cmd run lint`: PASS trên bản cuối.
- `npx.cmd tsc --noEmit`: PASS; build cuối cũng hoàn tất TypeScript.
- `npx.cmd next build`: PASS trên bản cuối, 22 static pages cùng dynamic routes hiện có.
- `node --check frontend/tests/admin-redesign.mjs` và `git diff --check`: PASS.
- Kiểm tĩnh tất cả --admin-* được dùng đều có khai báo.
- Tính trực tiếp contrast token: muted/soft 4,55:1; input border/white 3,46:1;
  success/bg 6,81:1; danger/bg 5,91:1. Không coi đây là kiểm WCAG toàn ứng dụng.
- Chạy app production 127.0.0.1:3100, đăng nhập qua form thật với HTTP fixture;
  mọi /api/v1/** được intercept riêng ở browser, không ghi backend/DB thật.
- Cả sáu harness dưới đây PASS trên build cuối:

| Lệnh trong frontend (ADMIN_UI_URL=http://127.0.0.1:3100) | Ảnh / bằng chứng local gitignored |
|---|---|
| node tests/admin-redesign.mjs | 19 ảnh + result.json tại data/admin-phase3-ui (ADMIN_UI_OUTPUT) |
| node tests/admin-consistency.mjs | 15 ảnh + result.json tại data/admin-batch8-ui |
| node tests/admin-user-forms.mjs | 13 ảnh + result.json tại data/admin-batch4-ui |
| node tests/admin-workspaces.mjs | 20 ảnh + result.json tại data/admin-batch5-ui |
| node tests/admin-users-table.mjs | 10 ảnh + result.json tại data/admin-batch3-ui |
| node tests/admin-dashboard.mjs | 9 ảnh + result.json tại data/admin-batch2-ui |

Đã kiểm desktop 1920/1366, tablet 768 và mobile 390px, không tràn document.
Harness layout thêm assertion font/control height/focus/nhận token modal/title,
giữ toàn bộ assertion cũ: navigation/history/skip link/notification bounds, loading,
empty/error/retry, guards/401/logout và thoát Admin về profile không mang style theo.
Các harness form kiểm review/dirty/busy/error giữ draft; table kiểm query/pagination/
sticky action; dashboard kiểm nguyên nguồn total, partial errors và không API ghi.
Đã xem ảnh desktop/mobile menu, ba form, tablet Manager picker và review đổi Manager;
đối chiếu lại ảnh modal sau sửa selector, không chỉ dựa trên test pass.

`.\mvnw.cmd -B -Dtest=RepoDocsTest test`: PASS 5/5, không failure/error/skip.

## File và bàn giao

Modified (8): AdminTokens.module.css, AdminShell.module.css, AdminTable.module.css,
AdminEditor.module.css, AdminDashboard.module.css, AdminWorkspaces.module.css,
AdminReferences.module.css (tất cả dưới frontend/src/components/admin/);
frontend/tests/admin-redesign.mjs.
Added (1): docs/exec-plans/completed/2026-11-07-admin-refinement-phase-03-foundation.md.
Deleted: không. Harness có tùy chọn ADMIN_UI_OUTPUT để giữ riêng bằng chứng từng lần QA.

Git chỉ gồm thay đổi phase này, không staged/commit/push.
Diff src/, database/, worker/, frontend app/services/context/Analysis rỗng.
API/dữ liệu/migration: không thay đổi. Không thêm package hoặc cấu hình máy.
Frontend QA server do phiên này khởi động đã dừng; cổng 3100 không còn listener.

Giới hạn: chưa có Figma Admin/Final Report gốc; không đối chiếu thiết kế đó,
không xác nhận live auth/backend/MySQL, CARLA hoặc chứng nhận accessibility.
Không chạy lại full backend/worker test vì không thay code của chúng.
KPI và quick actions vẫn như trước, chờ Phase 04; không coi chúng đã bị bỏ.

Commit đề xuất: `refactor(admin): establish consistent layout and design system`.
Bước tiếp theo chưa thực hiện: Phase 04 — Admin Overview Redesign theo audit Phase 02.
Dừng để review.
