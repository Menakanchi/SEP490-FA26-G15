# Admin & Analysis — Phase 09/20: Reference Document Management Refinement

Ngày thực hiện: 14/11/2026. Hoàn thành Phase 9, chờ review.
Nhánh ban đầu `chuvv`, HEAD `a24cdbf` (Phase 8 đã commit), working tree sạch.
Chỉ Phase 9; không stage/commit/push, không đổi main hoặc triển khai Phase 10.

## Nguồn và phạm vi thực tế

Đã đọc hướng dẫn AGENTS/DESIGN/CLAUDE/frontend, hướng dẫn đổi package, kiến trúc,
các báo cáo Phase [1](2026-11-13-admin-analysis-phase-01-admin-ui-audit.md),
[2](2026-11-13-admin-analysis-phase-02-layout.md),
[3](2026-11-13-admin-analysis-phase-03-user-table.md),
[4](2026-11-13-admin-analysis-phase-04-user-search.md),
[6](2026-11-14-admin-analysis-phase-06-user-form.md),
[7](2026-11-14-admin-analysis-phase-07-modal.md),
[8](2026-11-14-admin-analysis-phase-08-workspace.md).
Không thấy Phase 5 cùng chuỗi. Các báo cáo refinement 07/11 là lịch sử khác.
Đọc guide accessibility của Next đang cài; Table/Editor/query helpers/CSS/hooks/services/types/tests References,
AdminTable/Tokens/Shell và API client hiện hành đã đối chiếu trong chuỗi phase.

Backend chỉ đọc: `controller/system/AdminController.java`, `service/system/AdminService.java`,
`dto/auth/AdminRequests.java`, `repository/common/AdminRepository.java`,
`security/VehicSimAccess.java`, `entity/system/TechReference.java` dưới `src/main/java/com/vsos/backend/`;
đối chiếu schema/database-schema và [ADR-036](../../adr/ADR-036-schema-29-bang.md).
Ưu tiên code hiện hành khi tài liệu trạng thái nói chưa có API/màn.

| Luồng/metadata | Hành vi hiện tại và kết luận audit |
|---|---|
| Danh sách | GET /admin/tech-references, bảng 6 cột: Tài liệu/Loại/Giá trị–Đơn vị/Trạng thái/Cập nhật/Thao tác; named scroll region và sticky actions |
| Search/filter | q tối đa 100, tìm mã/tên qua SQL LOCATE; role parameter là loại tài liệu, không phải global role; status ACTIVE/INACTIVE, sort/newest/oldest/name, page sizes 10/20/50/100 |
| Detail | Tải detail trước khi edit, kiểm ID/type/DECIMAL string/boolean; sequence và query guard bỏ response cũ |
| Tạo/sửa | 14 fields và is_active trong payload; form → validation → review → ref lock/busy → POST/PUT → success/refetch hoặc lỗi giữ draft |
| Metadata | 6 loại tài liệu, mã/tên bắt buộc; null hiện —; thời gian Cập nhật dùng formatter vi-VN như các trang Admin, không tự thêm version hay tạo ngày |
| Hằng số | DECIMAL(30,12) được backend trả string; giữ nguyên chuỗi 18+12, zero/scientific; non-CONSTANT gửi null, không dùng JS Number cho ref_value |
| URL/nguồn | URL là metadata trong input/review, chưa có link nguồn tương tác; chỉ HTTP(S) hợp lệ có hostname, không tự đổi nội dung URL ngoài trim hiện có |
| Trạng thái | Create luôn bật; edit bật/tắt phải review hệ quả. Tắt không xóa bản ghi; không optimistic update |
| Quyền | Mọi Admin endpoint requireAdmin, ghi có limitWrites; không đổi authorization |
| Chức năng không có | Không upload PDF, file preview, versioning, DELETE hoặc link mở nguồn. Không thêm những chức năng này |
| Refresh/states | Có pending/error/empty/filtered-empty, retry, canonical URL/page clamp; kết quả cũ không được hiện như kết quả query mới |

Giữ internal ID hiện hữu để phân biệt bản ghi/detail; không thêm cột/metadata giả.
Không có bằng chứng cần đổi bố cục bảng hoặc kích thước đã kiểm thử.

## Lỗi đã chứng minh, nguyên nhân và sửa tối thiểu

| Ưu tiên / vị trí sau sửa | Trước sửa và bằng chứng RED | Sau sửa |
|---|---|---|
| P1 — [AdminReferencesTable.tsx](../../../frontend/src/components/admin/AdminReferencesTable.tsx):17–23,106 | key=query.q remount form khi Enter q mới; node input cũ disconnected, focus = BODY | Giữ DOM/input, dùng applied/draft để đồng bộ URL/history khi q thực sự đổi; refresh không ghi đè nháp/con trỏ |
| P2 — cùng file:83–85 | q=REF,status=ACTIVE,sort=name,page=3,page_size=10; gửi “  REF  ” làm page về 1 và GET từ 2 lên 3 | Cùng q chuẩn hóa là no-op; q mới mới reset page, giữ filter/sort/page_size |
| P2 — cùng file:112–113, phần References của ADM-02 | Cả 6 chip loại và 2 chip trạng thái có aria-label thiếu giá trị đang nhìn thấy | Accessible name có nhãn hiện tại, giữ text/style/URL behavior; gỡ bằng Enter vẫn giữ các filter khác |
| P2 — cùng file:38–51,99,118; Editor:66, phần còn lại của ADM-03 | Chỉ “Đã lưu thành công.”, không mã/tên hoặc filter context; Phase 7 trả focus an toàn về admin-content khi opener mất nhưng chưa có đích feedback | Sau response thành công, callback gửi mã/tên đã lưu; notice có role=status/tabIndex=-1, focus/scroll vào viewport sau lượt refetch đầu. Refresh sau đó không kéo focus về notice cũ |
| P2 — [adminReferences.ts](../../../frontend/src/components/admin/adminReferences.ts):54–67; Editor:67 | List/save render trực tiếp Error.message. Fixture network hiện Failed to fetch; HTTP500 hiện chuỗi SQL; 502 hiện nguyên HTML; JSON decode hiện parser error | Phân loại ApiError/network/decode trong helper chỉ dành References. 5xx và parser errors không render raw diagnostic; đọc có thông báo tải lại, lưu chưa xác nhận yêu cầu kiểm danh sách trước khi thử lại; 4xx nghiệp vụ giữ lý do |

Harness mở rộng chạy trên production baseline Phase 8: exit 1 với 27 observations
cho năm nhóm trên, không phải 27 lỗi độc lập. Sau sửa observations là [].
Chuỗi SQL/HTML dùng trong fixture có chủ đích, không phải bằng chứng backend thật đã lộ dữ liệu.

Khi POST/PUT đã được xác nhận nhưng refetch lỗi: notice nói rõ dữ liệu đã lưu,
danh sách chưa tải lại được; list hiện alert, không giữ rows cũ. Retry chỉ GET, không lặp mutation.
Không có success trước response; lỗi lưu giữ modal/draft, giải phóng lock và focus alert.

## File thay đổi

| File | Lý do |
|---|---|
| [AdminReferencesTable.tsx](../../../frontend/src/components/admin/AdminReferencesTable.tsx) | Search state/no-op, chip labels, targeted feedback và focus một lần, dùng helper lỗi References |
| [AdminReferenceEditor.tsx](../../../frontend/src/components/admin/AdminReferenceEditor.tsx) | Callback đưa mã/tên từ pending payload sau await success; lỗi lưu dùng helper. Không đổi bodyOf/prepare/validation/saveLock |
| [adminReferences.ts](../../../frontend/src/components/admin/adminReferences.ts) | Thêm helper load/save dùng ApiError sẵn có, không đổi services/api.ts hoặc client dùng chung |
| [AdminReferences.module.css](../../../frontend/src/components/admin/AdminReferences.module.css) | Hai rule feedback: text xuống dòng và focus ring theo token hiện có |
| [admin-consistency.mjs](../../../frontend/tests/admin-consistency.mjs) | Mở rộng harness References cũ; giữ field/decimal/dirty/busy/permission/query assertions |
| [admin-redesign.mjs](../../../frontend/tests/admin-redesign.mjs):282 | Kỳ vọng 503 của References đổi sang thông báo tiếng Việt mới; giữ nguyên kỳ vọng Users/Workspace và các assertions layout/modal |
| [tech-debt-tracker.md](../tech-debt-tracker.md) | TD-56: tài liệu schema vẫn ghi chưa có API/màn tech_references, cần đồng bộ mô tả trong đợt tài liệu riêng |
| Tài liệu này | Active plan chuyển completed, ghi evidence/validation/giới hạn |

Chỉ bốn file production thuộc References đổi trong 132 file frontend/src đã chụp hash trước sửa.
Giữ nguyên global layout/tokens, CSS bảng/modal chung, Users/Workspace, backend/schema/quyền,
CARLA/AEB/Analysis, API contracts/payload, 14 fields, DECIMAL transport và dirty/review/busy.
Không thêm dependency, shared abstraction hoặc cơ chế request khác.

## Regression theo 18 nhóm yêu cầu

| # | Case | Bằng chứng thực chạy |
|---|---|---|
| 1 | Danh sách | 61 fixture, server query/sort/page sizes, rows/total đúng; named table region |
| 2 | Metadata | 14 fields/15-key normalized payload; type/active/source/year/null; chuỗi 18+12, zero/scientific và non-CONSTANT null giữ nguyên |
| 3 | Tên dài | Tên fixture dài wrap trong bảng/modal, không document overflow |
| 4 | URL dài | URL khoảng 850 ký tự, source_title dài, review không overflow ngang; payload giữ đúng URL đã nhập sau trim |
| 5 | Loading | Shared suite pending trên ba trang; API hiện tại chưa xong không coi rows cũ là mới |
| 6 | Empty | Chưa có tài liệu kỹ thuật khác filtered-empty; có CTA Thêm mới vì POST thực sự tồn tại |
| 7 | Không tìm thấy | q không có kết quả, clamp page về 1, giữ các filter được hỗ trợ |
| 8 | Error | List 503/403/network/malformed/500 JSON/502 HTML/200 JSON decode; save 400/403/429/network/500/502/decode; không raw diagnostic mới kiểm, draft và retry giữ nguyên |
| 9 | Race | Late list error và late detail không ghi đè query/editor mới; guard hiện hữu không đổi |
| 10 | Paging/search | Same q/no extra GET/page=3, q mới reset page; draft/caret refresh; Back/Forward/canonical và cross-resource history |
| 11 | Validation | Required, CONSTANT numeric, year range, URL schemes; inline aria-invalid/errors; không mutation trước review |
| 12 | Success | Confirmed POST/PUT mới đóng/refetch; mã/tên/filter feedback đúng, tắt bản ghi làm row rời filter; save confirmed + refresh failed có thông báo riêng |
| 13 | Failure/draft | Mã/tên/source và ref_value giữ nguyên; alert có focus, save lock được giải phóng, chỉ success mới báo đã lưu |
| 14 | Double-submit | Hai click xác nhận lúc POST slow chỉ một write; aria-busy và Escape guard; retry refetch không lặp POST |
| 15 | Permission | 4 role ngoài Admin không đọc resource; 403, 401/guest đúng flow; không backend writes thật |
| 16 | URL/HTML | ftp/javascript/data bị chặn, không write; review không có link thực thi; source_title chứa markup vẫn là text, không img/onerror được tạo/chạy |
| 17 | Keyboard | Search Enter giữ DOM/focus, 8 chip names/gỡ bằng Enter; Tab/ShiftTab/dirty/Escape theo Phase 7; notice focus visible trong viewport; refresh sau đó không steal focus |
| 18 | Responsive | List 1920/1440/1366/1024/768/375/390; form 1440/1366/1024/768/375/390; shared low-height 320x256/667x375/1280x480 giữ field/actions tới được |

Không coi test metadata text là test một chức năng preview/link nguồn chưa có.
Phase 7 assertion focus fallback trong harness References được nâng thành target feedback
cụ thể cho flow lưu; hook fallback bản thân vẫn giữ nguyên.

## Browser QA và trước/sau

Production app `http://127.0.0.1:3121`, Edge headless/Playwright hiện có.
Đăng nhập qua form với HTTP fixture, không dùng tài khoản thật/DB thật.
Đã xem ảnh trước/sau lỗi lưu 500, feedback khi bản ghi rời filter, create + failed refresh,
modal 375, danh sách desktop 1440, review mobile với URL dài.
7 ảnh list và 6 ảnh form pristine giống hệt byte baseline (13 cặp), không redesign giao diện.
Ảnh lỗi đổi nội dung theo thông báo mới; feedback mới dùng style success và tokens hiện có.

Artifacts local gitignore, không commit, dưới `data/admin-phase9-2026-11-14/`:

- `before/phase9-observations.json`: RED 27 observations và ảnh baseline.
- `references/`: result.json PASS, observations=[], 34 ảnh.
- `layout/`: 102 ảnh; `workspaces/`: 28; `users-table/`: 21.
- `source-hashes.json`, `verification-summary.json`: nguồn/13 cặp ảnh/kết quả.
- Tổng bốn suite 185 ảnh; số ảnh không phải số test cases độc lập.

## Validation thực thi

Frontend chạy từ `frontend` bằng `npm.cmd`/`npx.cmd`.
Suites dùng `ADMIN_UI_URL=http://127.0.0.1:3121` và
`ADMIN_UI_OUTPUT=data/admin-phase9-2026-11-14/<suite>`.

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS exit 0; sau cập nhật shared harness, eslint hai tests/helper cũng PASS exit 0 |
| `npx.cmd tsc --noEmit` | PASS exit 0 |
| `npm.cmd run build` | PASS exit 0, Next 16.4.1 production |
| `node tests/admin-consistency.mjs` | PASS exit 0, 34 ảnh |
| `node tests/admin-redesign.mjs` | PASS exit 0, 102 ảnh |
| `node tests/admin-workspaces.mjs` | PASS exit 0, 28 ảnh |
| `node tests/admin-users-table.mjs` | PASS exit 0, 21 ảnh |
| Root: `.\mvnw.cmd -B -Dtest=RepoDocsTest test` | PASS exit 0, 5 tests, không failure/error/skip |
| `git diff --check` | PASS exit 0 |

Lượt shared harness đầu FAIL do còn chờ raw fixture text 503 ở References;
đã đổi expectation riêng resource đó sang câu tiếng Việt mới, không nới error/permission/layout assertions.
Diff check từng báo blank line EOF, đã sửa và thực chạy lại PASS.
Không chạy lại Java business/security suite vì backend/API/validation không đổi.
Các kết quả trên là browser với HTTP fixtures, không phải live backend/auth/DB.

## Giới hạn và nợ còn lại

Chưa đối chiếu Figma Admin vì không có thiết kế truy cập được trong phiên; chưa kiểm
live deployment/DB, Safari/Firefox, screen reader thật, touch/bàn phím ảo hoặc native zoom/text scaling.
Không tuyên bố WCAG đầy đủ hoặc mọi loại lỗi upstream đều được kiểm.

4xx tiếp tục theo contract lý do nghiệp vụ backend, không thay error pipeline toàn cục.
Sau lỗi decode/5xx, frontend không thể biết chắc server đã ghi hay chưa: thông báo yêu cầu kiểm
danh sách, không tự retry/autosave. Fixture không chứng minh trạng thái transaction backend thật.
Định dạng ngày giữ semantics của formatter hiện tại, không tự gán timezone cho timestamp không có offset.

TD-56 ghi nhận tài liệu database-schema.md:42,913,973 còn nói chưa có API/màn dù code đã triển khai;
không sửa schema hoặc mở thêm chức năng để khớp câu tài liệu cũ.
Các nợ audit khác về notification popup, archived Manager dependency, Figma contract ngoài phạm vi.

Commit đề xuất: `fix(admin): refine reference document management UI`.
Dừng tại Phase 9 để người dùng review, commit và push thủ công.
