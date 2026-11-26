# Video CARLA với Cloudflare R2

R2 Standard có hạn mức miễn phí; vượt mức có thể phát sinh phí. Cloudflare yêu cầu đăng ký R2 qua checkout, có thể yêu cầu thông tin thanh toán. Kiểm tra [giá hiện hành](https://developers.cloudflare.com/r2/pricing/) và mức sử dụng trước khi demo.

## 1. Tạo bucket và khóa

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com/), chọn **Storage & databases → R2**, hoàn tất đăng ký R2 nếu được yêu cầu.
2. Chọn **Create bucket**, đặt tên, chọn **Standard**. Giữ bucket riêng tư; không bật public access.
3. Ở trang R2, chọn **Manage API Tokens → Create Account API token**. Chọn **Object Read & Write**, giới hạn chỉ bucket vừa tạo, rồi tạo token.
4. Tự lưu **Access Key ID** và **Secret Access Key** an toàn. Secret chỉ hiện một lần: không gửi qua chat, không commit, không chụp màn hình có chứa khóa. Chú ý dùng khóa S3, không dùng giá trị token quản trị thay cho secret.
5. Lấy endpoint S3 do Cloudflare hiển thị, thường có dạng `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; bucket có jurisdiction riêng phải dùng endpoint riêng như [Cloudflare hướng dẫn](https://developers.cloudflare.com/r2/api/tokens/).

## 2. Cấu hình thông tin truy cập trên Windows

AWS SDK đọc credential từ file profile hoặc biến môi trường hệ điều hành; Spring `.env` không tự đưa các khóa của nó vào credential chain. Để không ghi đè profile khác, trong PowerShell tạo thư mục nếu chưa có và mở file bằng Notepad:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws" | Out-Null
notepad "$env:USERPROFILE\.aws\credentials"
```

Thêm mục bên dưới vào file, tự thay giá trị và lưu. Giữ lại các profile đã có; nếu đã có `[vehicsim-r2]`, sửa mục đó thay vì thêm mục trùng. File này chứa khóa bí mật, không chia sẻ hoặc commit.

```ini
[vehicsim-r2]
aws_access_key_id = DIEN_ACCESS_KEY_ID
aws_secret_access_key = DIEN_SECRET_ACCESS_KEY
```

## 3. Cấu hình backend

Trong file `.env` ở gốc repo, sửa các giá trị không bí mật:

```dotenv
VEHICSIM_VIDEO_BUCKET=ten-bucket-cua-ban
VEHICSIM_VIDEO_REGION=auto
VEHICSIM_VIDEO_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
VEHICSIM_VIDEO_PATH_STYLE=true
```

Dùng đúng endpoint Cloudflare cấp, không để dấu `< >`. Trong **cùng cửa sổ PowerShell** dùng để khởi động backend trực tiếp, đặt profile rồi chạy CARLA:

```powershell
$env:AWS_PROFILE = 'vehicsim-r2'
.\scripts\dev-carla.ps1 -RestartBackend
```

Biến môi trường chỉ có hiệu lực với cửa sổ đó và tiến trình con; sau khi mở cửa sổ mới cần đặt lại. Nếu backend chạy trong container/production, phải cấp profile hoặc secret cho chính tiến trình backend; profile trên máy Windows không tự xuất hiện trong container.

## 4. Kiểm tra

Đăng nhập vào app, tạo hoặc chọn họ kịch bản CARLA nhỏ có camera và chạy. Sau khi hoàn thành, vào **Dữ liệu CARLA → Lượt chạy → Xem cảm biến**, thử phát, tua và tải video. Đồng thời vào bucket R2 kiểm tra `runs/<run_id>/video.mp4`: xem được video chưa chứng minh upload thành công vì hệ thống giữ bản local khi upload lỗi. Kiểm tra quyền project bằng tài khoản khác nếu có.

Video cũ không tự chuyển hay tự xóa; CSV, result.json và artifact khác vẫn nằm trên ổ đĩa backend. Với run mới, video local được xóa sau khi upload thành công và transaction lưu kết quả đã commit; nếu upload/lưu lỗi thì giữ video local. Chưa có tự động tải lại khi upload thất bại hoặc tự dọn object sau khi xóa run. R2 và trình duyệt thật cần được kiểm thử với tài khoản của nhóm trước demo.
