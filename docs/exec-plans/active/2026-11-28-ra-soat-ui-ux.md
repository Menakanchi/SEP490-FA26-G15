# Rà soát UI/UX VehicSim

## Mục tiêu và phạm vi

Kiểm tra giao diện theo vai trò trên desktop và mobile, sửa các vấn đề sử dụng hoặc responsive có bằng chứng; giữ chức năng, phân quyền và thay đổi local. Tài khoản demo chỉ dùng để kiểm tra và được dọn sau đó.

## Các bước và tiêu chí

1. Đọc hướng dẫn dự án và thiết kế, kiểm tra trạng thái local.
2. Duyệt các màn và trạng thái có thể truy cập bằng tài khoản demo; ghi rõ giới hạn dữ liệu.
3. Sửa các vấn đề xác nhận được tại thành phần chịu trách nhiệm, kiểm lại trên trình duyệt.
4. Chạy lint, kiểm kiểu và build frontend; dọn tài khoản demo và ghi bằng chứng.

## Nhật ký

- 28/11: Điều hướng nhóm có hai nút lồng nhau; màn phân tích ép phần giới thiệu hẹp trên mobile; ô mô tả kịch bản thiếu tên trợ năng. Giữ nguyên quyền và API.
- 28/11: Màn chào mừng giữ bốn cột và wizard giữ cột xem trước cố định trên mobile; chuyển sang bố cục xếp dọc khi hẹp.
- 28/11: Ba lựa chọn ở bước thiết kế đầu tiên cũng bị ép trên mobile; xếp dọc tới khi đủ rộng.

## Kiểm chứng và phần còn lại

- Trình duyệt: xem trang chào, đăng nhập, quản trị tài khoản/workspace/tài liệu, tổng quan kỹ sư, mô tả kịch bản, baseline, phân tích, AEB, hồi quy, hồ sơ, chào mừng và tạo project, chọn cách thiết kế và trang chủ project. Đã xem desktop và/hoặc viewport 390 × 844; kiểm lại wizard, lựa chọn kịch bản, phân tích và điều hướng sau sửa. Chưa có bằng chứng cho mọi màn ở cả hai kích thước.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `git diff --check`: đạt. `npm run test:analysis`: 81/81. `npm run test:admin`: 7/7 qua server production cổng 3100, HTTP fixture; không thay thế backend/Figma thật.
- Đã xoá project thử nghiệm qua API, xoá 5 tài khoản demo và xác nhận không còn các bản ghi đó.
- Còn kiểm từng trang chi tiết, các trạng thái có dữ liệu, role Manager/Reviewer và đối chiếu Figma. Màn chào mừng sau sửa chưa được chụp lại. Không tuyên bố toàn bộ màn đã kiểm xong.
- Đã đọc `AGENTS.md`, `CLAUDE.md`, `frontend/AGENTS.md`, `DESIGN.md`, hướng dẫn đổi package, quy tắc đặt tên, ADR index, tracker và hai kế hoạch project/hành trình. `CLAUDE.md` phần CARLA còn mô tả v15 trong khi `AGENTS.md` nêu v16; không liên quan tới thay đổi UI này.

## Tiếp tục 28/11 — Manager và Reviewer

- Dùng workspace demo riêng có thành viên, project, task và báo cáo chờ duyệt; Reviewer xem thêm kết quả hồi quy và khuyến nghị sẵn có ở workspace được phép đọc. Không gửi quyết định duyệt. Đã xoá 4 tài khoản, workspace, project, task, báo cáo và liên kết demo; đối chiếu từng ID còn 0 bản ghi.
- Xem Manager: danh sách và chi tiết workspace, task, báo cáo, danh mục và chi tiết phương tiện; Reviewer: tổng quan, task/báo cáo của tôi, chi tiết hồi quy, khuyến nghị, màn duyệt và phát lại. Đã quan sát desktop và/hoặc viewport 390 × 844, với trạng thái có dữ liệu và trạng thái trống.
- Sửa thanh lọc task/báo cáo xuống dòng trên mobile, giữ cùng hàng trên desktop; công bố trạng thái bật lọc và mở báo cáo. Màn duyệt xếp lựa chọn dọc trên mobile và nêu tên các ô kiểm. Đầu trang dùng chung, thông báo kết quả và thẻ tham số hồi quy không còn bị ép hẹp trên mobile.
- Kiểm tra lại màn duyệt, phát lại, hồi quy, task/báo cáo trên trình duyệt; lựa chọn duyệt đã đổi trạng thái mà không gửi. `npm run lint`, `npx tsc --noEmit`, `npm run build`, `git diff --check`, test analysis unit 81/81, `reviewer-project.test.mjs` và `chat-stream.test.mjs` 6/6: đạt. Browser fixture: Admin 7/7, Analysis 6 suite và MOBO workflow đạt trên frontend production; không chứng minh backend/CARLA thật.
- Chạy song song ban đầu làm test Admin kiểm focus thất bại; chạy lại riêng đạt 7/7. Test Analysis cũ tìm tên nút điều hướng đã thay ở lượt trước; đã cập nhật kiểm thử theo tên nhóm và xác nhận `aria-expanded`, sau đó cả bộ browser Analysis đạt. Bảy suite Analysis legacy không chạy vì điều khiển cũ đã bị gỡ, theo thông báo của runner.
- Đọc thêm ADR-040/044/049/055/064/072 và kế hoạch 20/10; tài liệu lịch sử ADR-040 còn nhắc lõi Python cũ, code hiện hành dùng lõi Java theo ADR-042. Không thay đổi hợp đồng hoặc phân quyền.
- Còn thiếu đối chiếu Figma, native touch/screen reader và kiểm trực tiếp toàn bộ nhánh/trạng thái của mọi màn; dữ liệu CARLA thật không được tạo hoặc chạy trong lượt này.

## Tiếp tục 28/11 — nhánh và trạng thái dữ liệu

- Sửa bộ lọc báo cáo của tôi theo người nộp; bổ sung trạng thái tải, lỗi, quyền và các nhãn trợ năng ở workspace/công việc. Giới hạn nội dung báo cáo theo hợp đồng `ReportSubmitRequest` hiện hành (10.000 ký tự).
- AEB: phân biệt đang tải, lỗi, chỉ xem và thiếu bản gốc; xếp biểu mẫu trên mobile, hiển thị giới hạn MOBO và bỏ nhãn định lượng chưa có bằng chứng. Regression: xử lý preview về sai thứ tự, lỗi/thử lại, điều chỉnh bộ lọc và trạng thái thiếu dữ liệu; bỏ thanh phần trăm độ tin cậy tự gán.
- Project: bỏ liên kết lưu trữ dẫn về chính trang chào khi chưa có project; tránh dữ liệu danh sách cũ đè bộ lọc mới, bổ sung thử lại và xếp tìm kiếm trên mobile. Bảng họ kịch bản có chỉ dẫn vuốt ngang trên màn nhỏ.
- Dùng project trải nghiệm demo có một họ và hai biến thể, không chạy baseline/CARLA; quan sát danh sách kịch bản, AEB thủ công, MOBO, tạo regression và lịch sử quyết định ở 390 × 844, AEB và tạo regression trên desktop. Tài khoản, project và họ demo đã xoá; xác nhận tài khoản và project còn 0 bản ghi.
- Fixture Playwright chạy trên API giả: lọc báo cáo desktop/mobile; regression preview đến sai thứ tự, lỗi/thử lại và mobile; danh sách project đổi tab, lỗi/thử lại, tìm kiếm và mobile. Các fixture không thay thế backend thật. `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:analysis` (81/81) và `git diff --check` đạt.
- Đã đọc thêm hợp đồng chỉ số phân tích, ADR-055 và kế hoạch chạy baseline; tài liệu cũ có mô tả khác tên package/phiên bản simulator hiện hành, ưu tiên code và phần cập nhật mới. Không sửa API, schema, phân quyền hoặc kết quả mô phỏng.
- Chưa đối chiếu Figma, chạm thật/screen reader, chạy CARLA hoặc kiểm mọi nhánh với dữ liệu thực. Chỉ dẫn vuốt ngang mới thêm chưa được chụp lại sau khi xoá tài khoản demo; các màn Manager/Reviewer đã xem ở lượt trước, chưa lặp lại toàn bộ sau các chỉnh sửa mới.

## Tiếp tục 28/11 — kiểm lại Manager, Reviewer và phục hồi lỗi

- Workspace Manager: dữ liệu demo gồm project, task đang làm và báo cáo chờ duyệt. Đã xem danh sách, chi tiết báo cáo dài, bật/tắt lọc báo cáo của tôi trên desktop và mobile; xem tìm thành viên không có kết quả và task trên mobile. Chỉnh tìm thành viên để bỏ kết quả cũ, hiển thị lỗi nộp trong hộp thoại, thêm thử lại tải báo cáo và cho chuỗi dài xuống dòng.
- Reviewer: đã xem màn duyệt một regression có sẵn với ca được sửa và ca xấu đi trên desktop/mobile, bật thử một ô kiểm nhưng không gửi quyết định; xem task/báo cáo demo và màn baseline chỉ xem. Checklist nay phản ánh ca có thể phát lại và trạng thái bằng chứng thực tế; khi chưa có số thì không tự hiển thị 0.
- Màn baseline có thử lại khi tải họ kịch bản thất bại và cảnh báo khi số liệu cũ; hướng dẫn khác nhau theo quyền xem/chạy. Đã xem chỉ dẫn cuộn bảng kịch bản trên mobile sau lần sửa trước. Câu chỉ xem ở baseline được sửa sau khi quan sát và đã kiểm bằng fixture, chưa xem lại trực tiếp sau sửa.
- Fixture API giả cho tìm thành viên trả lời sai thứ tự, báo cáo dài/lọc/lỗi nộp/tải lại, các nhánh bằng chứng Reviewer và baseline tải lỗi/phục hồi đều đạt ở desktop/mobile; không thay thế kiểm thử backend thật. `reviewer-project.test.mjs` đạt 3/3; `npm run lint`, `npx tsc --noEmit`, `npm run build` và `git diff --check` đạt.
- Không sửa quyền, schema hoặc API. Bốn tài khoản demo và workspace, project, task, báo cáo thử nghiệm đã được xoá; liên kết Reviewer tạm vào workspace có dữ liệu sẵn cũng đã xoá. Kiểm tra từng tài khoản và bản ghi demo đều còn 0.
- Trên viewport 320 px của dữ liệu thật, quan sát document rộng hơn vùng nội dung 4 px; fixture chưa tái hiện được nên chưa xác định nguồn. Chưa đối chiếu Figma, kiểm chạm/screen reader thật, chạy CARLA, hoặc xác nhận mọi nhánh của mọi màn. Dữ liệu regression sẵn có chỉ đọc, không gửi quyết định.

## Tiếp tục 28/11 — 320 px và quản lý lượt CARLA

- Đo trực tiếp trên trình duyệt: thanh đầu trang vượt vùng nội dung 4 px khi thanh cuộn dọc chiếm chiều rộng; giảm khoảng cách giữa các nút trên mobile. Sau sửa, `scrollWidth = clientWidth = 305` với viewport 320 px, cả màn baseline và lịch sử CARLA.
- Reviewer xem trực tiếp hướng dẫn baseline: chưa có lượt cho cấu hình hiện tại, hiển thị lý do chỉ xem và nút khởi chạy bị khóa. Lịch sử CARLA có dữ liệu được xem ở 320 px; không chạy, hủy hay xóa dữ liệu thật.
- Đối chiếu `RunViewScope`, `SimulationController`, `RunService` và `SimulationViewService`: danh sách Admin có thể lọc project khác nhưng hủy/xóa vẫn theo project hiện hành; giao diện nêu rõ phạm vi và khóa thao tác từng lượt thuộc project khác. Họ không thuộc context hiện tại không còn được chọn ngầm. Copy giải thích hủy CARLA độc lập, xóa baseline CARLA lỗi/đã hủy, giữ lượt hoàn thành/hồi quy/tối ưu; nút xuất nêu rõ phạm vi lượt độc lập gồm cả động học. Khi hủy thành công mà tải lại thất bại, thông báo không báo nhầm là hủy thất bại.
- Đã đọc `carla-local.md`, ADR-043/055, hợp đồng chỉ số và kế hoạch chạy baseline 22/10; định danh cũ trong tài liệu lịch sử và chú thích cũ `-xosc15` không phản ánh profile hiện hành `-xosc16`, chú thích được sửa để không gắn cứng phiên bản.
- Reviewer demo và liên kết workspace đã xóa và xác nhận 0 bản ghi. Fixture CARLA giả kiểm hủy/xóa đúng họ và `simulator_type=CARLA`, lọc project, nút bị khóa, hồi phục lỗi tải và viewport; fixture baseline kiểm quyền chỉ xem. `CarlaWebTest` và `RunResultDeleteTest` đạt 61/61. Không thay đổi API, schema hay quyền; chưa chạy CARLA thật hoặc thực hiện thao tác hủy/xóa thật, chưa đối chiếu Figma.

## Tiếp tục 28/11 — vòng đời CARLA thật

- Chạy server riêng CARLA 0.9.16, ScenarioRunner tag v0.9.16; backend được khởi động lại bằng `dev-carla.ps1 -RestartBackend -NoHud` vì cấu hình đang chạy không tìm thấy Python. Trước khi khởi động lại đã kiểm không có run PENDING/RUNNING; status backend xác nhận kết nối tương thích và profile `carla-0.9.16-xosc16`.
- Project demo #20 có họ #41 một biến thể và họ #42 hai biến thể. Run #2638 qua UI hoàn thành. Run #2639 đang chạy, #2640 đang chờ; hủy họ qua UI trả `stopped=1`, `stopping=1`, sau đó cả hai thành STOPPED. `lifecycle.json` của #2639 ghi `stopped=true`, `destroyed_after=5`; CARLA sau dừng báo `synchronous_mode=false` và không còn vehicle/walker/sensor/controller.
- API từ chối xóa riêng #2638 hoàn thành bằng 409; xóa theo họ #41 trả `deleted=0`, `skipped_completed=1`. Xóa riêng #2640 và xóa theo họ #42 xóa #2639 thành công; hai thư mục artifact đã biến mất. UI tải lại chỉ còn #2638.
- Lỗi phát hiện khi dọn demo: `DELETE /projects/20` ban đầu thất bại vì `fa_json_sources.fk_fa_source_project`; `ProjectRepository.delete` chưa xóa nguồn FA JSON thuộc project. Nguồn FA JSON duy nhất của project demo không có execution/report/handoff; đã xóa đúng nguồn đó theo ID và project, sau đó API xóa project trả 204. Cần sửa đường xóa project và kiểm thử dữ liệu FA JSON riêng; lượt này không thay đổi logic xóa project thật.
- Đã xác nhận project, tài khoản, hai họ, ba run, nguồn FA JSON và ba thư mục artifact demo đều không còn. Server CARLA do phiên thử nghiệm khởi động đã dừng sau khi kiểm không có run hoạt động. Backend vẫn chạy với cấu hình CARLA; không đổi `.env` hoặc volume.
- Đã đọc `carla-local.md`, ADR-043/055, hợp đồng chỉ số và exec plan chạy baseline. `CLAUDE.md` mục 6 còn ghi profile v15, trong khi code/status hiện hành báo v16; dùng định danh v16 thực tế. Không tuyên bố kết quả mô phỏng là chứng nhận an toàn.

## Tiếp tục 28/11 — sửa xóa project có FA JSON

- `ProjectRepository.delete` xóa handoff, report, execution, source theo thứ tự khóa ngoại và theo đúng project trong transaction hiện có; không đổi schema/API.
- `ProjectRepositoryDeleteTest` và `ProjectServiceTest` đạt 30/30. Kiểm thật trên MySQL và API với hai project demo, mỗi project có đủ bốn loại bản ghi FA JSON: xóa project A trả 204, bốn bản ghi của B vẫn còn; sau đó xóa B trả 204. Kiểm tra tài khoản, project và cả bốn loại bản ghi demo còn 0.
- Đã đọc ADR-067 và tài liệu schema; không thay đổi cấu trúc dữ liệu. Backend được khởi động lại để chạy mã mới sau khi xác nhận không có lượt mô phỏng hoạt động.

## Tiếp tục 28/11 — xóa project có regression, tối ưu và phân tích

- Hai project demo có regression hoàn thành, optimization run/trial, analysis và recommendation có liên kết. Một báo cáo demo tạo ràng buộc chặn lệnh xóa cuối: API trả 409; kiểm MySQL xác nhận project và năm loại bản ghi của cả hai project vẫn còn, chứng minh rollback cho trường hợp này.
- Bỏ đúng báo cáo chặn của demo, xóa project A qua API trả 204; kiểm project B còn đủ năm loại bản ghi. Sau đó xóa B qua API trả 204, xóa tài khoản demo; xác nhận project, họ và các bản ghi demo còn 0.
- Fixture này không có simulation run, cặp regression test item hoặc artifact; chưa chứng minh các quan hệ đó và mọi kiểu lỗi có thể xảy ra. Không sửa code trong lượt kiểm tra này. Đã đọc ADR-040/044/055, hợp đồng chỉ số, kế hoạch 20/10 và tài liệu schema; tài liệu lịch sử còn mô tả định danh/lõi cũ, ưu tiên code hiện hành.

## Tiếp tục 28/11 — run, cặp regression và artifact

- Hai project demo mỗi project có hai simulation run COMPLETED cùng biến thể, seed, xe và simulator; candidate gắn baseline và regression, một regression test item tham chiếu cặp run, hai bản ghi artifact và hai thư mục file demo. Dữ liệu là fixture tạo trong DB, không phải kết quả mô phỏng thật.
- Thêm báo cáo chặn project A: API trả 409; kiểm MySQL thấy cả hai project còn đủ hai run, một regression, một item và hai artifact, bốn file demo vẫn còn. Bỏ đúng báo cáo chặn, xóa A qua API trả 204; cả record và thư mục của A biến mất, B còn nguyên.
- API giới hạn đăng nhập khi dọn B; đã xóa dữ liệu B theo đúng ID demo bằng transaction, theo thứ tự ràng buộc, sau đó xóa hai file/thư mục demo có đường dẫn xác định. Xác nhận tài khoản, project, họ, run, regression, item, artifact, báo cáo và bốn thư mục demo đều không còn.
- Không sửa logic; kiểm `git diff --check`. Đã đọc ADR-040/044/055, hợp đồng chỉ số, kế hoạch 20/10 và schema. Đây là bằng chứng rollback khi lỗi khóa ngoại ở cuối transaction, không chứng minh mọi kiểu lỗi hay lưu trữ artifact bên ngoài.

## Tiếp tục 28/11 — lỗi khác và lưu trữ ngoài

- Bổ sung kiểm thử service: lỗi đọc danh sách run không gọi xóa project; repository báo lỗi thì không xóa file của project hoặc project khác. Đây là lỗi giả lập ở tầng service, không chứng minh rollback MySQL đối với các lỗi này.
- Dùng HTTP server giả S3 tại localhost và hai object trong namespace thử; mô phỏng repository lỗi rồi xóa thành công với repository mock, kiểm không có yêu cầu DELETE object và cả hai object còn trong bộ nhớ giả lập. Server và file tạm được test dọn; không tạo tài khoản hoặc object trên bucket thật.
- `ProjectServiceTest`, `ProjectRepositoryDeleteTest`, `CarlaVideoStorageTest`, `CarlaVideoCleanupTest` đạt 38/38. Theo `carla-video-object-storage.md`, xóa project xóa metadata nhưng không dọn object S3; cần quy trình đối soát/lưu giữ. File local không xóa được chỉ ghi cảnh báo sau khi DB đã commit, không có rollback hay retry tự động.
- Chưa kiểm tra sự cố S3/provider thật, lỗi commit MySQL, ngắt tiến trình, mất mạng, quyền/xóa file local hoặc mọi lỗi có thể xảy ra; không thể kết luận tính nguyên tử giữa DB và object storage. Không thay đổi chính sách lưu giữ hay logic xóa.

## Tiếp tục 28/11 — lỗi commit và lưu trữ cách ly

- Chạy MySQL 8.4 trong container demo riêng và các bảng fixture tối giản. Chặn JDBC commit trước khi gửi lên server: với `DataSourceTransactionManager` mặc định trong test, dữ liệu project A bị xóa dù phía gọi nhận lỗi; bật `rollbackOnCommitFailure` trong test giữ được hai project. Đóng kết nối trước commit giữ cả hai project. Đây là fault injection qua JDBC và transaction manager dựng riêng, chưa chứng minh transaction manager production có cùng hành vi; lỗi sau khi server nhận commit vẫn có kết quả không chắc chắn.
- Giả lập `IOException` khi xóa thư mục local: DB mock đã xóa, service chỉ log và trả thành công, file demo còn; project khác không bị chạm. Chưa thử lỗi quyền filesystem thật. Fake S3 localhost kiểm upload và giữ object khi xóa; không kiểm S3 provider hoặc bucket thật vì không tải được image giả lập từ registry.
- `ProjectDeleteCommitMysqlTest`, `ProjectServiceTest`, `CarlaVideoStorageTest`, `CarlaVideoCleanupTest`: 39/39; container và volume demo đã xóa, test dùng thư mục tạm tự dọn. Không đổi cấu hình transaction production, logic xóa hoặc chính sách giữ object; cần xác định transaction manager thật và thiết kế đối soát/retry trước khi kết luận an toàn.

## Tiếp tục 28/11 — transaction thực tế và lỗi file local

- Context Spring Boot thật dùng `JpaTransactionManager`, `rollbackOnCommitFailure=false`. Với MySQL 8.4 demo riêng, tiêm lỗi JDBC trước commit khi kết nối còn mở hoặc đã đóng: cả hai project và các bảng fixture vẫn còn. Giả lập server đã commit rồi mất phản hồi: project được yêu cầu xóa đã mất, project còn lại vẫn nguyên; không thể suy ra rollback từ lỗi phía gọi. Không đổi transaction manager toàn cục chỉ dựa trên thử nghiệm `DataSourceTransactionManager` dựng riêng của lượt trước.
- Repository báo lỗi thì service giữ file; client cảnh báo kết quả xóa chưa xác định khi lỗi mạng hoặc HTTP 5xx để kiểm tra trước khi thử lại. Sau commit, lỗi dọn thư mục được ghi log theo ID run và trả HTTP 200 cùng danh sách run chưa dọn; dọn đủ vẫn trả 204. UI báo rõ project đã xóa và yêu cầu quản trị viên xử lý thư mục còn lại. Không đổi schema hay chính sách giữ object S3.
- `ProjectServiceTest` và `ProjectSecurityTest` đạt 45 test, gồm file demo bị khóa thật trên Windows, dọn sau khi đóng handle, giữ file project khác và hợp đồng 200/204; frontend lint và typecheck đạt. Fixture Playwright 320 px kiểm bốn nhánh mất mạng, HTTP 503, 409 và 200 còn file, toàn bộ API được chặn bằng fixture. `ProjectTransactionContextMysqlTest` chạy trên MySQL demo cách ly; các test giao dịch và service là hai kiểm thử riêng, không phải một kiểm thử end-to-end với sự cố mạng thật.
- Cảnh báo không phải hàng đợi dọn bền vững: nếu tiến trình dừng hoặc phản hồi bị mất sau commit có thể còn file không được liệt kê cho người dùng; chưa có retry/đối soát tự động. Việc kiểm tra project rảnh và lấy danh sách run vẫn ở trước transaction xóa, chưa chứng minh an toàn trước ghi đồng thời. Không thể mở @Browser trong phiên này để chụp màn hình hoặc đối chiếu Figma.

## Tiếp tục 28/11 — hàng đợi bền vững và ghi đồng thời

- Xóa project ghi công việc dọn local cùng transaction; worker thử khi khởi động và định kỳ, giữ công việc khi dọn hoặc xác nhận DB thất bại. Marker của data root phải khớp binding DB trước và sau thao tác file; thiếu/lệch chặn xóa project có run. Migration 026 và thiết lập marker một lần được mô tả trong `database-schema.md`; chưa áp vào DB đang dùng. S3 giữ nguyên chính sách cũ.
- Khóa project, kiểm lại quyền/tên, khóa và kiểm trạng thái run/optimization/regression trong transaction trước khi xóa. Test hai kết nối MySQL kiểm ghi trước/sau khóa, cập nhật trạng thái và đổi tên/chủ; project còn lại giữ nguyên. Lock khoảng ID khi dọn có thể làm insert run khác chờ trong lúc xóa file.
- MySQL 8.4 và filesystem demo: bộ test kết hợp 12/12 và test cleanup mở rộng 7/7 đạt, gồm commit thành công mất phản hồi rồi retry, rollback, file khóa, marker thiếu/lệch/mất giữa chừng, run ID tái xuất hiện, hai worker và lỗi commit sau dọn file. Migration 026 được chạy hai lần trên DB demo; container, volume và thư mục demo đã dọn. Maven toàn bộ đạt 1596 test, 52 bỏ qua; fixture UI bốn nhánh đạt ở 320 px, typecheck và ESLint đạt. Đây là fault injection, không phải ngắt mạng hoặc tháo mount thật.
- Khi triển khai phải xác minh đúng mount và root riêng cho mỗi database trước khi gắn UUID; data root cũ phải đúng nơi đã ghi các run. Marker mất/lệch giữ công việc, nhưng chưa loại trừ hoàn toàn việc mount mất rồi phục hồi giữa hai lần kiểm. Đã đọc `CLAUDE.md`, hướng dẫn đổi gói, quy tắc đặt tên, schema, ADR index, exec plan, tech-debt và hướng dẫn lưu video; `CLAUDE.md` vẫn có mô tả profile CARLA v15 cũ, code hiện hành v16 và không đổi trong việc này.
