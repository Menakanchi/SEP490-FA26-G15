# Xác thực và triển khai MFA

MFA TOTP là tùy chọn theo tài khoản. Người dùng mở Hồ sơ, nhập mật khẩu hiện tại, thêm khóa vào ứng dụng xác thực, rồi nhập mã 6 số. Lưu 10 mã khôi phục ngay khi bật; mỗi mã chỉ dùng một lần. Có thể tạo lại mã bằng mật khẩu và mã TOTP hoặc mã khôi phục còn hiệu lực; việc này vô hiệu các mã cũ. Nếu không còn ứng dụng xác thực và không còn mã khôi phục, hệ thống chưa có quy trình khôi phục tự động: cần quy trình xác minh danh tính do quản trị vận hành, không được tự ý xóa dữ liệu MFA qua quên mật khẩu.

Khóa TOTP mã hóa AES-256-GCM với `MFA_ENCRYPTION_KEY`: một khóa Base64 từ 32 byte ngẫu nhiên, lưu trong hệ quản lý bí mật và sao lưu riêng, giống nhau trên các instance. Không ghi khóa thật vào repo, log hoặc `.env.example`. Để trống hay sai độ dài thì không thể bắt đầu MFA; tài khoản đã bật vẫn bắt buộc MFA. Mất/đổi khóa làm TOTP không giải mã được; mã khôi phục còn dùng được. Chưa có cơ chế tự xoay khóa, không đổi khóa khi chưa có kế hoạch chuyển đổi.

TOTP dùng bước 30 giây, cho phép lệch một bước và từ chối bước đã dùng. Mật khẩu đúng và MFA hợp lệ mới cấp JWT; mã khôi phục lưu SHA-256 vì được sinh ngẫu nhiên 128 bit. Bật/tắt MFA tăng `auth_version`, thu hồi các phiên trước và cấp phiên mới. Bộ đếm Redis đặt chỗ nguyên tử cho các yêu cầu đăng nhập đang chạy; yêu cầu thành công xóa các lần sai đã ghi nhưng không xóa lượt đang xử lý. Đây là giới hạn thử đăng nhập, **không phải** giới hạn số phiên thiết bị đang hoạt động.

Đăng xuất lưu SHA-256 của token trong MySQL; phiên khác không bị ảnh hưởng. Token cũ không có `jti` vẫn bị thu hồi bằng hash nguyên token. Token mới có ID ngẫu nhiên. Bảng thu hồi được kiểm mỗi request; DB lỗi thì từ chối xác thực (503), giao diện giữ phiên để thử lại. Các hash hết hạn được dọn khi đăng xuất, giữ thêm 24 giờ dự phòng; đồng bộ đồng hồ các backend. Request đã qua xác thực trước lúc đăng xuất có thể hoàn thành.

## Nâng cấp an toàn

1. Sao lưu và xác định migration đã áp dụng. Nếu thiếu thì áp dụng 026 trước, sau đó 027 và 028 theo thứ tự; không xóa volume hoặc dữ liệu. 027–028 là bổ sung và có thể chạy lại. Bản schema mới đã có các bảng này.
2. Cấu hình và sao lưu `MFA_ENCRYPTION_KEY`, `JWT_SECRET` riêng, đồng nhất trên các instance; đồng bộ thời gian. Chưa cấu hình khóa thì không bật MFA.
3. Chặn truy cập trong thời gian chuyển đổi, cập nhật **tất cả** backend và frontend, sau đó kiểm đăng nhập, đăng xuất và trạng thái MFA trước khi mở lại. Backend cũ không đọc bảng thu hồi hoặc MFA, nên chạy song song phiên bản cũ có thể bỏ qua cả hai bảo vệ.
4. Không rollback về backend cũ trong khi còn tài khoản bật MFA hoặc JWT đã thu hồi còn hạn: code cũ không thực thi các quy tắc này. Để rollback phải chặn đăng nhập, lên kế hoạch xử lý phiên và MFA với người vận hành, giữ nguyên bảng/khóa và dữ liệu, rồi xác nhận bảo vệ tương đương trước khi mở lại.

Backend đang chạy trên máy người dùng không được tự động đổi cấu hình, nâng DB hay khởi động lại bởi thay đổi mã nguồn. Cần sao lưu và thực hiện quy trình triển khai riêng.

Tài liệu tham chiếu: [RFC 6238](https://www.rfc-editor.org/info/rfc6238/), [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html), [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
