# Lưu và xem video CARLA bằng Amazon S3

Tài liệu này hướng dẫn cấu hình một bucket S3 riêng tư cho **video mới**. Video cũ vẫn nằm trên đĩa; không có bước tự chuyển dữ liệu cũ. Bucket dùng cho demo và production nên tách riêng: object key hiện dùng `runs/<run_id>/video.mp4`, nên dùng chung bucket giữa hai database có thể ghi đè video cùng ID.

## 1. Tạo bucket

1. Đăng nhập AWS Console bằng tài khoản của nhóm, mở **S3 → Create bucket**.
2. Chọn **General purpose**, chọn Region gần nơi chạy backend (ví dụ `ap-southeast-1` nếu phù hợp), đặt tên bucket duy nhất trên AWS.
3. Giữ **Block all public access** và mã hóa mặc định; tạo bucket. Không bật public access để xem video: backend sẽ cấp URL ngắn hạn sau khi kiểm tra project.
4. Xem [hướng dẫn tạo bucket của AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html) và [giá S3](https://aws.amazon.com/s3/pricing/). Phí phụ thuộc dung lượng, lượt truy cập, truyền dữ liệu và Region; tài khoản có thể cần phương thức thanh toán.

## 2. Cấp quyền cho backend

Ưu tiên **IAM role** gắn với máy chủ/container chạy backend khi triển khai AWS. Nếu demo trên máy Windows chưa có role, tạo IAM user riêng cho ứng dụng, chỉ cấp quyền `s3:PutObject` và `s3:GetObject` trên `arn:aws:s3:::TEN-BUCKET/runs/*`; thay `TEN-BUCKET` bằng tên thật:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::TEN-BUCKET/runs/*"
  }]
}
```

Trong AWS Console: **IAM → Policies → Create policy → JSON**, dán policy đã thay tên bucket; tạo policy. Vào **IAM → Users → Create user**, gắn policy đó, tạo access key cho ứng dụng ngoài AWS và lưu cặp khóa vào nơi an toàn. Không dùng access key của tài khoản root; không gửi khóa qua chat và không commit khóa. Với bucket mã hóa bằng KMS tự quản, cần cấp thêm quyền KMS phù hợp; nếu chưa rõ, dùng mã hóa mặc định S3.

Trên Windows, có thể cài [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), rồi chạy `aws configure`: nhập access key, secret key và Region. SDK sẽ đọc profile của **tài khoản Windows chạy backend**, không cần ghi khóa trong repo. Kiểm tra `aws sts get-caller-identity`; đừng chia sẻ output chứa thông tin tài khoản. SDK cũng hỗ trợ role hoặc biến môi trường như mô tả trong [AWS credential chain](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/credentials-chain.html).

## 3. Cấu hình VehicSim

Trong `.env` cục bộ (không commit), thêm hoặc sửa:

```dotenv
VEHICSIM_VIDEO_BUCKET=ten-bucket-cua-ban
VEHICSIM_VIDEO_REGION=ap-southeast-1
VEHICSIM_VIDEO_ENDPOINT=
VEHICSIM_VIDEO_PATH_STYLE=false
```

Đặt Region đúng với bucket. Với AWS S3 để trống endpoint. Nếu dùng dịch vụ tương thích S3 khác, đặt endpoint HTTPS có thể truy cập từ **cả backend lẫn trình duyệt**; tùy nhà cung cấp bật `VEHICSIM_VIDEO_PATH_STYLE=true` và kiểm tra hỗ trợ chữ ký, upload/checksum và HTTP Range. Không đặt endpoint nội bộ container mà trình duyệt không đến được.

Sau khi lưu cấu hình, khởi động lại đúng backend để nhận biến mới. Ở máy Windows đã cài CARLA, dùng `scripts\dev-carla.ps1 -RestartBackend`. Docker Compose có `env_file: .env`; phải cấp credential cho container qua secret/role hoặc environment của container. Spring đọc `.env` cho cấu hình ứng dụng, nhưng AWS SDK **không tự đọc credential AWS từ Spring `.env`** khi backend chạy trực tiếp: dùng AWS profile, IAM role hoặc biến môi trường tiến trình.

## 4. Kiểm tra trước demo

1. Đảm bảo CARLA và backend đang hoạt động, đăng nhập tài khoản có quyền với project và chạy một kịch bản CARLA nhỏ có camera.
2. Khi hoàn thành, mở **Dữ liệu CARLA → Lượt chạy → Xem cảm biến**, phát và tua video, rồi thử tải video.
3. Trên S3 Console, kiểm tra object `runs/<run_id>/video.mp4` có trong bucket. Đăng nhập tài khoản không có quyền project và xác nhận không xem được video của project đó.
4. Thử trên trình duyệt/máy khác với URL triển khai thật. Kiểm tra URL hết hạn và thử mở lại cửa sổ video; không lưu hoặc chia sẻ URL đã ký.
5. Nếu lỗi upload, backend giữ file local và kết quả mô phỏng, ghi lỗi server; **không có hàng đợi tự tải lại**. Cần xử lý lỗi bucket/credentials và bảo vệ file local, chạy lại thử hoặc chuyển thủ công có kiểm soát. Nếu không có camera/ghép video thất bại thì không có MP4.

## Giới hạn triển khai hiện tại

- Bucket chỉ chứa video mới; `result.json`, CSV, ảnh và các artifact khác vẫn ở `VEHICSIM_DATA_ROOT`. Cần lưu trữ bền vững và ổ dùng chung cho các backend/worker cần chúng. Chỉ chuyển video sang S3 không khiến toàn bộ hệ thống sẵn sàng chạy nhiều máy.
- Hệ thống chạy CARLA và khóa hiện thuộc tiến trình backend; chưa có hàng đợi/khóa phân tán để nhiều backend điều phối một CARLA server. Không bật nhiều bộ điều phối vào cùng server khi chưa xử lý việc này.
- Video local của run mới chỉ được xóa sau khi upload thành công và transaction lưu metadata đã commit; nếu upload/lưu lỗi thì giữ file. Video cũ không bị quét xóa. Xóa metadata/run không tự dọn object S3; cần quy trình đối soát và chính sách lưu giữ do nhóm quyết định. Sao lưu DB **và** thư mục data, đồng thời thiết lập bảo vệ/backup object storage phù hợp.
- URL có hiệu lực 15 phút, có thể hết hạn sớm theo credential; ai có URL có thể dùng đến khi hết hạn. Tránh ghi query URL vào log, không dùng bucket public. Backend phải dùng HTTPS khi production; không coi hướng dẫn này là xác nhận toàn bộ hệ thống đã sẵn sàng production.
