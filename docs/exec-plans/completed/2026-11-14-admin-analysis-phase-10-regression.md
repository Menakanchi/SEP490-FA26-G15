# Admin & Analysis — Phase 10/20: Regression Testing & Quality Hardening

14/11/2026, nhánh `chuvv`, HEAD ban đầu `be23ec4`; Phase 9 đã commit, working tree sạch.
Chỉ Phase 10, chờ review; không stage/commit/push hoặc chuyển Phase 11.
Không phát hiện production bug mới trong các ca đã chạy; không sửa production.
Hash 335 file frontend/src và src/main/java trước/sau giống nhau.

## Audit và coverage matrix

Đối chiếu AGENTS/DESIGN/CLAUDE/frontend guides, kiến trúc/API, ADR-045/048/049 và
báo cáo Phase 1–4/6–9 trong thư mục này; không có Phase 5 cùng chuỗi.
Đọc components/query/editor/hooks/CSS của ba trang Admin, services/types, bảy harness,
package/CI và các backend security/service tests. Component Admin nằm trong frontend/src/components/admin,
browser harness trong frontend/tests; Java tests trong src/test/java/com/vsos/backend.

| Module | Behavior / production | Existing Test | Gap / rủi ro | Action |
|---|---|---|---|---|
| Navigation | AdminShell, /admin redirect, active nav, history, logout | admin-dashboard, admin-redesign | Đã có; P2 layout | Chạy lại, không khôi phục Overview |
| Layout | 1440/768/390/375, region scroll, long text, focus ring | admin-redesign và ba table suites | Đã có; P2 | Giữ assertions/viewport, không tạo ảnh trùng |
| Users | AdminUsersTable: list/null identity/search/filter/paging | admin-users-table | Đã có; P1 dữ liệu/trang | Chạy lại |
| Users | Search race, changed q/page, draft/caret, stale success/error/unmount | admin-user-search | Đã có; P1 | Không viết suite trùng |
| Users | Create/edit, role/status/self guards, validation/dirty/review/double-click | admin-user-forms; AdminServiceTest | Đã có; P0 | Giữ payload/draft/ref-lock assertions |
| Users | Mutation API actor/target/DTO | AdminSecurityTest | P0: valid delegation chỉ có create user | Kiểm đủ sáu POST/PUT với actor 1, target 42, DTO đúng |
| Workspace | Admin list/detail/create/reassign/archived read-only | admin-workspaces; AdminServiceTest | Đã có; P0/P1 | Giữ search/Manager paging/stale/409/refresh cases |
| Workspace | Members/candidates/add/remove/duplicate, đúng Manager | WorkspaceSecurityTest, WorkspaceServiceTest | Không thuộc Admin UI; P0 quyền | Chạy tests sẵn có, giữ exact-email/EXPERIENCER và scope, không thêm member UI Admin |
| References | Metadata/DECIMAL string/null, form, URL/HTML, bật-tắt/error/feedback | admin-consistency; AdminServiceTest | Đã có Phase 9; P0/P1 | Giữ 14 fields/15-key payload, 18+12/zero/scientific và dangerous scheme tests |
| Tables | Workspace/Reference expected row ID | ready helpers trong hai suites | P1: substring #42 cũng khớp #420 | So chính xác label ID, giữ row count/order/query assertions |
| All Admin APIs | 5 roles, 12 routes, 401/403 | AdminSecurityTest | P0: write matrix gửi {}, guest chỉ list GET | Dùng valid bodies, kiểm mọi route guest, denial không gọi service/quota |
| All Admin writes | AdminController.writer/limitWrites | AdminSecurityTest | P0: VehicSimAccess đang bị mock | Dùng Access thật, mock riêng Redis/OTP boundary; sáu writes 429 trước service |
| Reviewer | Regression riêng, pinned project, không scenario/candidate write hoặc Admin/membership privilege | VehicSimSecurityTest, ReviewerScopeTest, MemberWorkSecurityTest | Đã có; P0 quyền | Chạy lại; kiểm thêm service membership/archive/self-approval theo ADR-049 |
| Modal | useAdminDialog/native dialog, initial/Tab/Escape/dirty/busy/restore/scroll | admin-redesign, forms/workspaces/references | P1: aria-modal + Tab chưa đủ chứng minh inert | Assert :modal thật và thử focus background bị chặn trên ba editors |
| Loading | Pending list và không hiển thị stale rows | admin-redesign | P1: fixture dùng delay 1200ms | Giữ response tới sau assertion rồi release, cleanup finally |
| Execution | Bảy harness, browser setup/artifacts | Các script chạy riêng | P1: Playwright extraneous, hardcode Edge, chưa có npm runner | Pin runtime, helper nhỏ, runner fail-closed/repeat/summary |
| CI | Frontend job lint/type/build/audit | ci.yml | P1: chưa gọi browser suite | Ghi TD-57, không tự đổi/provision self-hosted CI |

Không lấy route guard frontend làm bằng chứng bảo mật backend.
Admin không quản lý membership; role hệ thống khác membership/project access.
Reviewer được chạy regression trong project được chọn, không có quyền Admin hoặc technical writes khác.

## Thay đổi và bằng chứng

- `AdminSecurityTest.java`: SecurityConfig và VehicSimAccess thật; 5 JUnit tests chứa
  ma trận 60 requests đủ 5 roles, 12 guest routes, 6 valid mutations/DTO/actor/target/quota,
  6 quota denials và invalid input/no DELETE. Mock service/repository boundary, không ghi DB.
  Denied/guest/429/invalid body kiểm không gọi AdminService; denied/guest không tiêu quota.
- `admin-redesign.mjs`: thêm native modality/background focus assertions; thay loading sleep
  bằng pending response/release và cleanup. Giữ wheel wait 200ms cho compositor/negative scroll check.
- `admin-workspaces.mjs`, `admin-consistency.mjs`: siết ID label, không nới expected rows.
  Prefix nhận diện chip là locator helper; assertions tên đủ giá trị từ Phase 3/8/9 vẫn giữ.
- `package.json/package-lock.json`: pin Playwright 1.64.1 đã dùng; thêm `test:admin`.
  Chỉ thêm playwright/playwright-core vào lock, giữ metadata/versions dependency khác.
- `admin-test-utils.mjs` và bảy harness: gom browser options/screenshot ghi nhận file thật.
  BROWSER_EXECUTABLE override; có Edge Windows thì dùng, còn lại dùng Playwright Chromium.
- `run-admin.mjs`: process riêng mỗi suite, lượt chẵn đảo thứ tự; xóa result cũ trước suite,
  yêu cầu exit 0 và result PASS đúng loại fixture, dừng nếu lỗi. Mặc định không chụp ảnh.
- `frontend/tests/README.md`: setup, server do người gọi quản lý, browser provisioning,
  repeat/artifact/failure semantics. `tech-debt-tracker.md` thêm TD-57; tài liệu này đóng plan.

Negative check thật: seed một artifact PASS cũ rồi dùng BROWSER_EXECUTABLE không tồn tại.
Runner xóa artifact, suite đầu exit 1, summary FAIL/0 trên 7, không chạy tiếp.
Đây là lỗi được tạo có chủ đích để kiểm fail-closed, không phải bảy suite đã PASS.
Không tạo fixture cấp quyền vượt backend và không sửa SecurityConfig/authorization.

## Validation thực thi

Production frontend riêng tại `http://127.0.0.1:3122`; Edge headless, login/API qua fixtures.
Bảy suite: admin-dashboard (entry), admin-users-table, admin-user-search, admin-user-forms,
admin-workspaces, admin-consistency (References), admin-redesign (layout/modal).

| Lệnh / nhóm | Kết quả thực chạy |
|---|---|
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | PASS, cài lại 365 packages; npm ls playwright không còn extraneous |
| `npm.cmd run lint` | PASS; sau siết ba harness, eslint ba file cũng PASS |
| `npx.cmd tsc --noEmit` | PASS exit 0 |
| `npm.cmd run build` | PASS exit 0, Next 16.4.1 |
| `npm.cmd run test:admin -- --repeat=2` | PASS exit 0, 14/14 suite runs, đảo thứ tự lượt hai, 0 ảnh trùng |
| Runner negative browser/stale artifact | Đạt kỳ vọng exit 1, summary FAIL, artifact PASS cũ không còn |
| Maven: AdminSecurityTest, AdminServiceTest, WorkspaceSecurityTest, WorkspaceServiceTest, VehicSimSecurityTest, ReviewerScopeTest, MemberWorkSecurityTest | PASS 66, 0 failure/error/skip; chi tiết 5/13/7/19/13/6/3 |
| Maven: AdminSecurityTest lặp, RepoDocsTest và 3 Reviewer service cases | PASS 13, 0 failure/error/skip (5 Admin + 5 docs + 3 Reviewer service) |
| `git diff --check` | PASS exit 0 sau hoàn thiện |

Backend baseline trước sửa PASS 64; phần tăng là assertions/quota/guest coverage thực chất,
không coi số test là tỷ lệ coverage. Một lượt Maven không khởi động được wrapper/JVM
(Thread failed to start), không có test chạy ở lượt đó. Retry với MAVEN_OPTS
`-Xmx512m -XX:ActiveProcessorCount=2` hoàn tất 66 tests; log lỗi vẫn được giữ.

Artifact local gitignore trong `data/admin-phase10-2026-11-14/`:
`browser/summary.json` và run-1/run-2, `negative/summary.json`/negative-runner.log,
backend-final.log (wrapper lỗi), backend-final-retry.log (66 PASS), source-hashes/verification-summary.
Result mỗi suite mô tả checks và fixture writes; không dùng artifact cũ thay cho exit/result hiện tại.

## Giới hạn và rủi ro

Browser kiểm production frontend với HTTP fixture, không phải backend/DB thật.
MockMvc dùng filter/controller/access thật nhưng principal/JWT/service/OTP boundary giả;
unit service/scope dùng repository/DB mocks, chưa chứng minh transaction/concurrency MySQL/Redis thật.
Các case trong một harness vẫn tuần tự; chỉ chứng minh isolation giữa harness/process và hai lượt trên máy này.
Không kết luận hết flaky trên mọi engine/CI từ hai lượt local.

Chưa kiểm Safari/Firefox/Linux browser, screen reader, touch/virtual keyboard, Figma,
live JWT/session revocation/deployment, network timeout thật hoặc endpoint treo vô hạn.
Không thêm deadline API mới. Không sửa UI nên không chụp lại hàng trăm ảnh/Figma comparison.
TD-57: cần provision browser/production server và gọi runner trong CI; chưa tuyên bố CI browser PASS.
Các nợ chức năng đã có trong audit/TD tracker không được đổi thành feature ở phase này.

Commit đề xuất: `test(admin): strengthen regression coverage and permission checks`.
Dừng tại Phase 10 để người dùng review, commit và push thủ công.
