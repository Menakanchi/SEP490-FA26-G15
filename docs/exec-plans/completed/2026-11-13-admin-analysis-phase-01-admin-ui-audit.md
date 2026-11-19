# Admin & Analysis — Phase 01: Audit toàn bộ Admin UI sau merge

Ngày 13/11/2026. Nhánh `chuvv`, HEAD `ba4d71b`.
Điều kiện đầu vào đạt: working tree sạch, không có MERGE_HEAD.
**Hoàn tất audit, chờ review. Chưa sửa các phát hiện; chưa bắt đầu phase tiếp theo.**
Chỉ thêm tài liệu này. Không đổi frontend/backend/test sản phẩm, AEB, CARLA, DB hoặc dependencies.

## 1. Phạm vi, nguồn và cách kiểm

Đọc [AGENTS](../../../AGENTS.md), [DESIGN](../../../DESIGN.md), [CLAUDE](../../../CLAUDE.md),
[frontend AGENTS](../../../frontend/AGENTS.md), [architecture](../../vehicsim/architecture.md),
hướng dẫn đổi gói/mục 7, Next accessibility/CSS Modules cài trong repo, audit Admin cũ
và [báo cáo merge](2026-11-13-merge-main-admin-conflicts.md).
Đối chiếu routes → AdminFrame/AdminManagement → ba table/editor → adminApi →
AdminController/AdminService/AdminRepository/AdminRequests và guard thực tế.

Đây là audit mới sau merge: giữ các cải tiến đã hoàn thiện, bổ sung kiểm chứng
vùng nhìn thấp, bộ lọc có dữ liệu, focus sau cập nhật và consistency với DESIGN.
Không tạo lại dashboard/KPI, roles page hoặc chức năng chỉ có trong kế hoạch.
Analysis chưa được audit trong phase này; người dùng sẽ cung cấp nội dung phase sau.

- Baseline: production frontend, sáu harness Admin hiện có, 94 ảnh.
- Probe bổ sung: 31 trạng thái/31 ảnh, 11 lượt axe-core 4.14.0, keyboard và DOM geometry.
- Viewport: baseline 1920×1080, 1366×768, 768×1024, 390×844;
  probe thêm 320×568 và dialog 320×256.
- 320×256 là mô phỏng kích thước CSS vùng nhìn thấp (tương đương vùng 1280×1024
  khi thu nhỏ viewport theo hệ số 4); **không phải đã kiểm zoom trình duyệt thật 400%**.
- Đăng nhập qua form thật với HTTP fixtures, email .invalid; không ghi API/DB thật.
  Quyền/nghiệp vụ backend được kiểm riêng bằng MockMvc/service tests.
- Axe được tải độc lập trong data để audit, không cài vào package.json/lockfile.
  Không dùng kết quả scan để chứng nhận WCAG; incomplete cần kiểm thủ công tiếp.

## 2. Bản đồ chức năng và phần đã đạt cần giữ

| Khu vực | Code chính | Đã có / không triển khai lại |
|---|---|---|
| Lối vào | frontend/src/app/admin/page.tsx:3 | /admin chuyển tới /admin/users; không có dashboard riêng cần khôi phục |
| Shell/navigation | frontend/src/components/admin/AdminShell.tsx:13,69,87 | Ba mục Admin, metadata/breadcrumb/h1, active link, skip link, profile/logout, mobile details menu |
| Tài khoản | AdminUsersTable.tsx, AdminUserEditor.tsx | Bảng 4 cột; tìm/lọc/sort/page; create/edit/review; role help theo ADR-049; self/dependency guards; success có email/focus |
| Workspace | AdminWorkspacesTable.tsx, AdminWorkspaceEditor.tsx | Bảng 5 cột/880px; create/reassign; Manager search/paging >100; archived chỉ xem; success giữ filter/focus |
| Tài liệu kỹ thuật | AdminReferencesTable.tsx, AdminReferenceEditor.tsx | List/create/edit/review; 14 field nguồn; DECIMAL giữ string; trạng thái bật/tắt; payload và server errors |
| API/quyền | AdminController.java:19,28,32; AdminService.java | GET/detail/POST/PUT ba resource, requireAdmin, limitWrites, validation; không có Admin DELETE/archive/settings/audit UI độc lập |

Các tên file không kèm thư mục ở bảng này nằm trong `frontend/src/components/admin/`;
Java tương ứng ở `src/main/java/com/vsos/backend/controller/system/` và `service/system/`.

Màu nền/primary/surface theo DESIGN và global theme; chữ/modal 20px, body input 14px,
control 40px desktop/44px mobile được giữ sau merge. Bảng cuộn ngang trong region có tên,
sticky actions, caption/th scope, native dialogs, Escape/dirty/review/busy và giữ draft khi lỗi.
Không thấy overflow ngang toàn document ở các viewport đã đo; đây không có nghĩa mọi nội dung bảng
phải vừa màn hình 320px: cuộn riêng bảng là hành vi có chủ đích.

## 3. Phát hiện và ưu tiên

P0 = chặn diện rộng/mất dữ liệu nghiêm trọng; P1 = cản tác vụ hoặc accessibility cần ưu tiên;
P2 = vấn đề cục bộ, hướng phục hồi hoặc hợp đồng thiết kế cần chốt.
Không phát hiện P0 trong phạm vi đã kiểm. Có **3 P1 + 3 P2**;
4 mục tái hiện trên browser, 1 rủi ro luồng qua code/test, 1 chênh lệch hợp đồng thiết kế.
Mức ưu tiên là đánh giá sản phẩm, không đồng nhất tự động với impact của axe.

| ID | Mức | Phát hiện | Căn cứ |
|---|---|---|---|
| ADM-01 | P1 | Dialog bị cắt body/footer ở vùng nhìn thấp | Browser + ảnh + geometry, cả ba editor |
| ADM-02 | P1 | Accessible name của chip role/type/status thiếu nhãn đang hiển thị | axe label-content-name-mismatch, 5 nút trên ba trang |
| ADM-03 | P1 | Mất focus sau lưu tài liệu làm bản ghi rời bộ lọc | Browser: activeElement = BODY |
| ADM-04 | P2 | Escape từ bên trong popup thông báo làm mất focus | Browser: activeElement = BODY; component dùng chung |
| ADM-05 | P2 | Hướng dẫn chuyển Manager không thực thi được với workspace archived | Đối chiếu UI + guard/SQL + unit test; chưa thử DB thật |
| ADM-06 | P2 | Admin foundation khác metric/layout của DESIGN nhưng chưa ghi ngoại lệ tại nguồn thiết kế | Đối chiếu source; cần quyết định thiết kế, không phải lỗi nghiệp vụ |

### ADM-01 — Dialog ở 320×256 không còn vùng thao tác đầy đủ

- Vị trí: [AdminEditor.module.css](../../../frontend/src/components/admin/AdminEditor.module.css):1,3,4,10,45,55–64.
  Dialog overflow hidden + max-height, header/footer flex-shrink:0; body chỉ còn padding 32px.
- Tái hiện: mở Thêm mới tại từng trang, đặt viewport CSS 320×256.
  Dialog bottom = 246; nút Tạo mới bottom lần lượt users 278,77,
  workspace 330,86 và references 308,77. Workspace footer bắt đầu y=237,47.
  Ảnh cho thấy field nội dung/footer bị cắt dù bounding box dialog vẫn nằm trong màn hình.
- Tác động: người dùng vùng nhìn thấp/phóng to không thấy hoặc thao tác trực quan đầy đủ form.
- Hướng sửa: thêm chế độ low-height cho toàn dialog có thể cuộn; cho header/footer vào flow
  khi không còn đủ chỗ. Giữ native modal, focus trap và kích thước control.
- Nghiệm thu/test: cả 3 editor ở 320×256 và landscape; Tab tới field/nút đều làm vùng đó hiện rõ,
  không chỉ kiểm bounding box dialog. Kiểm cả review, discard, lỗi và text mục tiêu dài.
- Evidence: `users-dialog-320x256.png`, `workspaces-dialog-320x256.png`,
  `tech-references-dialog-320x256.png`; `probe-results.json` có tọa độ.

### ADM-02 — Chip lọc không có tên truy cập chứa nhãn hiển thị

- Vị trí: [AdminUsersTable.tsx](../../../frontend/src/components/admin/AdminUsersTable.tsx):105–106,
  [AdminWorkspacesTable.tsx](../../../frontend/src/components/admin/AdminWorkspacesTable.tsx):86,
  [AdminReferencesTable.tsx](../../../frontend/src/components/admin/AdminReferencesTable.tsx):98–99.
- Tái hiện: users lọc ACTIVE/ENGINEER, workspace ACTIVE, references ACTIVE/PRINCIPLE.
  Ví dụ visible `Đang bật` nhưng aria-label `Bỏ lọc trạng thái`; visible `Kỹ sư` nhưng
  aria-label `Bỏ lọc vai trò`. Axe gắn impact serious, rule label-content-name-mismatch.
- Tác động: tên điều khiển khác nhãn người dùng thấy, gây khó cho điều khiển bằng giọng nói.
- Hướng sửa: tên chứa giá trị hiện tại, ví dụ `Bỏ lọc trạng thái: Đang bật`, đồng thời giữ ý nghĩa gỡ lọc.
- Nghiệm thu/test: scan trạng thái đã lọc trên cả 3 trang; 5 nút trên không còn violation.
  Giữ test URL/filter/remove/Back/Forward; thử q kết hợp role/type/status, không chỉ trang chưa lọc.
- Evidence: `users-filtered`, `workspaces-filtered`, `tech-references-filtered` trong JSON/ảnh.
  Scan có q bổ sung không gắn rule này vào chip tìm kiếm trong lượt kiểm hiện tại.

### ADM-03 — Success của tài liệu chưa có đích focus ổn định

- Vị trí: [AdminReferencesTable.tsx](../../../frontend/src/components/admin/AdminReferencesTable.tsx):85,104;
  [useAdminDialog.ts](../../../frontend/src/components/admin/useAdminDialog.ts):10–12.
- Tái hiện: lọc tài liệu ACTIVE → sửa AUDIT-REF → bỏ bật → xác nhận lưu thành công.
  Bản ghi biến mất theo bộ lọc; dialog đóng, opener bị tháo trong refetch; activeElement = BODY.
  Success chỉ ghi `Đã lưu thành công.`, không nêu mã/tên hoặc giải thích bộ lọc đang giữ.
- Tác động: mất vị trí keyboard và thiếu ngữ cảnh về bản ghi vừa thay đổi.
- Hướng sửa: callback đưa mã/tên đã lưu về list; có focusable success sau refetch, chỉ dẫn filter;
  tận dụng hành vi đã có ở workspace, tránh focus về nút bị tháo.
- Nghiệm thu/test: save làm bản ghi rời filter vẫn giữ URL; focus trên feedback hiển thị được,
  thông báo đúng đối tượng; save lỗi giữ draft, không báo success. Kiểm desktop/mobile.
- Evidence: `reference-filtered-save-focus`. Probe tương tự của tài khoản đạt focus trên feedback,
  sau khi chờ cuộn ổn định 600 ms, nên không gán lỗi này cho tài khoản.

### ADM-04 — Popup thông báo không trả focus khi Escape

- Vị trí: [NotificationBell.tsx](../../../frontend/src/components/NotificationBell.tsx):29,63–64,128;
  được AdminShell.tsx:83 sử dụng.
- Tái hiện: mở chuông bằng Enter → focus `Đánh dấu tất cả đã đọc` → Escape.
  Popup đóng, phần tử đang focus bị tháo; focus = BODY thay vì chuông.
- Hướng sửa: ref trigger và trả focus khi đóng bằng Escape từ popup; phân biệt click ngoài
  để không giật focus khỏi đích người dùng vừa chọn. Không ép popup non-modal thành modal.
- Nghiệm thu/test: mở/Tab/Escape/Tab tiếp theo tại 390px và desktop; điểm tiếp tục là trigger.
  Component dùng chung nên kiểm thêm header ngoài Admin.
- Evidence: `notifications-open-mobile`, `notifications-escape-focus`.

### ADM-05 — Trạng thái phụ thuộc archived thiếu đường phục hồi trong UI

- Vị trí: [AdminUserEditor.tsx](../../../frontend/src/components/admin/AdminUserEditor.tsx):128;
  AdminWorkspaceEditor.tsx:17,104; AdminService.java:72–73,101;
  AdminRepository.java:95–96. Java ở `src/main/java/com/vsos/backend/` theo tầng tương ứng.
- Căn cứ: owns workspace kể cả archived thì không đổi role/khóa tài khoản;
  UI yêu cầu giao workspace cho Manager khác, nhưng workspace archived chỉ xem và PUT bị từ chối.
  Unit `AdminServiceTest#managerOwnershipBlocksRoleChangeAndLockIncludingArchivedWorkspaces`
  và trường hợp archived trong test workspace xác nhận từng guard hiện hành.
- Hướng xử lý trước mắt: báo đúng lý do, phân biệt phụ thuộc archived với active và
  chỉ dẫn quy trình hỗ trợ thật. Quyết định cho phép chuyển archived hoặc đổi guard
  cần phase được duyệt riêng; không tự mở archive/restore hoặc sửa DB để vượt guard.
- Nghiệm thu: có fixture Manager còn archived workspace; lỗi giữ draft và giải thích đường xử lý
  có thật. Khi nghiệp vụ chốt mới bổ sung test server tương ứng. Chưa kết luận đã thử live DB.

### ADM-06 — Cần chốt hợp đồng thiết kế cho Admin

- Vị trí: [DESIGN.md](../../../DESIGN.md):11–20,36;
  [AdminTokens.module.css](../../../frontend/src/components/admin/AdminTokens.module.css):33–35,44–45;
  [AdminShell.tsx](../../../frontend/src/components/admin/AdminShell.tsx):87–96.
- Khác biệt: DESIGN title 34px/section 17px/card 12px/control 8px;
  Admin title clamp 24–30px/section 16px/panel 16px/control 10px.
  DESIGN nói Menu trong header; Admin dùng details menu trong content.
  Palette/Plus Jakarta Sans đã đồng nhất, metric này được giữ có chủ đích qua merge.
- Hướng xử lý: chốt ngoại lệ Admin ngay trong DESIGN hoặc lên thay đổi cục bộ sau review.
  Không coi mọi chênh lệch là bug phải sửa ngay; giữ control mobile 44px và guard tương tác.
- Nghiệm thu: spec và token khớp hoặc có ngoại lệ rõ; screenshot/typography/navigation tests
  phản ánh quyết định đã chốt, không thay test chỉ để hợp thức hóa giao diện.

## 4. Ma trận trạng thái và giới hạn kiểm chứng

| Nhóm | Tài khoản | Workspace | Tài liệu |
|---|---|---|---|
| Loading, unfiltered empty, filtered empty, lỗi/retry | Harness đạt | Harness đạt | Harness đạt |
| Server search/filter/sort/paging, URL/reload/history, page clamp | Đạt | Đạt | Đạt |
| Detail lỗi/sai ID/request cũ; không mở nhầm editor | Đạt | Đạt | Đạt |
| Validation, review, dirty/discard, busy/double submit, lỗi giữ draft | Đạt | Đạt | Đạt |
| Success/refetch/filter | Đạt, focus có đích | Đạt, feedback nằm trong viewport | Đạt dữ liệu, lỗi focus ADM-03 |
| Keyboard/scroll/sticky actions, mobile bounds thông thường | Đạt viewport baseline | Đạt viewport baseline | Đạt viewport baseline |
| Vùng nhìn thấp của dialog | ADM-01 | ADM-01 | ADM-01 |
| Tên chip lọc/axe sau filter | ADM-02 | ADM-02 | ADM-02 |
| Non-admin/guest/expired session | Fixture + guard tests | Fixture + guard tests | Fixture + guard tests |

Không tạo hàng đợi duyệt workspace, settings, role CRUD, chart hoặc KPI vì không có nghiệp vụ/API
được xác nhận. Archived readonly không tự nó là lỗi; ADM-05 nói về thông điệp phục hồi phụ thuộc.
Các trạng thái đạt là bằng chứng harness/fixtures, không phải xác minh deployment/live DB.

## 5. Lệnh kiểm chứng và artifact

| Kiểm tra thực chạy | Kết quả |
|---|---|
| `npm.cmd run lint` trong frontend | PASS |
| `.\mvnw.cmd -B -Dtest=RepoDocsTest test` sau hoàn tất audit | PASS 5 |
| `git diff --check` và kiểm whitespace trực tiếp file mới | PASS |
| `npx.cmd tsc --noEmit` trong frontend | PASS |
| `npx.cmd next build` trong frontend | PASS |
| `.\mvnw.cmd -B -Dtest=AdminServiceTest,AdminSecurityTest test` | PASS 16, không fail/error/skip |
| Sáu harness `node tests/admin-*.mjs` chạy từng file | PASS; redesign 19, forms 16, workspaces 23, users-table 11, consistency 15, dashboard 10 ảnh |
| Probe `node ../data/admin-audit-2026-11-13/probe.mjs` từ frontend | Chạy xong 31 trạng thái, không pageerror/unmapped API; **có phát hiện lỗi**, không phải audit PASS |
| axe-core 4.14.0 | 11 scans: 6 snapshot list/dialog desktop chưa lọc không violation; 5 snapshot có rule ADM-02 (trong đó có ngữ cảnh lặp) |

Baseline chạy production `127.0.0.1:3114`; server QA đã dừng.
Artifact gitignore: `data/admin-audit-2026-11-13/`, 94 ảnh baseline + 31 probe = 125 ảnh.
`probe-results.json` chứa viewport/geometry/focus/axe targets/incomplete; `probe.mjs` giữ cách tái hiện,
`axe.min.js` và tarball axe độc lập để chạy lại. Không thêm công cụ này vào dependencies sản phẩm.

Đã xem trực tiếp ảnh low-height users/workspace, danh sách 320px và success tài liệu sau lọc;
đối chiếu thêm ảnh desktop/mobile baseline. Axe không báo violation ở 6 snapshot không có
nghĩa đã đạt accessibility toàn Admin; filter và focus/geometry bổ sung đã tìm lỗi bị bỏ sót.
Chưa kiểm NVDA/VoiceOver, Firefox/Safari, zoom native, touch/keyboard thật trên thiết bị,
live auth/DB/SMTP hoặc Figma Admin. Một số axe checks incomplete cần kiểm thủ công.

## 6. Bàn giao phase

Audit cung cấp thứ tự ưu tiên, code locations, tái hiện, hướng sửa và tiêu chí regression.
Đề xuất ưu tiên ADM-01/02/03 trước; ADM-04 cần phối hợp component dùng chung;
ADM-05 cần quyết định nghiệp vụ; ADM-06 cần chốt ngoại lệ thiết kế.
Không tự gán các việc này vào nội dung phase tiếp theo chưa được người dùng cung cấp.

Chỉ thêm file completed này; không sửa code/test sản phẩm hoặc nới assertions để xanh test.
Probe tạm ngoài Git phục vụ bằng chứng audit, không thay thế regression test khi sửa thực tế.
Không stage/commit/push. Dừng để người dùng review, tự commit/push và cung cấp phase tiếp theo.
