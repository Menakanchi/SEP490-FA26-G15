# ADR-070 — Bước xin mã đăng ký báo thẳng email đã có tài khoản

**Trạng thái:** Accepted 27/11/2026 — người dùng chốt sau khi người dùng production đăng ký bằng email đã có tài khoản và chờ mã mãi không thấy.
**Liên quan:** bất biến 7 trong [AGENTS.md](../../AGENTS.md) và [architecture.md](../vehicsim/architecture.md#xác-thực) (thu hẹp, không bỏ), TD-33/TD-35.

## Bối cảnh

`POST /auth/register/request` trước đây trả cùng câu "mã đã được gửi" (202) cho mọi email, kể cả email đã có tài khoản; với email đó
backend không sinh mã, không gửi mail. Mục đích là không cho người ngoài dò email nào đã đăng ký. Hệ quả trên production (27/11):
người dùng đăng ký lại bằng email mình đang dùng để đăng nhập, giao diện báo đã gửi mã nhưng không có mail, không có gợi ý nào.

## Các lựa chọn

1. Giữ nguyên, chỉ sửa câu báo ("nếu đã có tài khoản thì đăng nhập / quên mật khẩu"): không lộ email nhưng người dùng vẫn phải tự đoán.
2. **Báo 409 ngay ở bước xin mã (chọn):** người dùng biết ngay phải đăng nhập hoặc đặt lại mật khẩu.

## Quyết định

- Email đã có tài khoản: `POST /auth/register/request` trả **409** `"Email này đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu."`,
  không sinh mã, không gửi mail; ghi audit `auth.register_request rejected email_taken` (không ghi email).
- Hạn mức `otp_ip` (mặc định 5 yêu cầu / 15 phút / IP) vẫn chạy **trước** bước tra email, nên mỗi IP chỉ dò được vài email mỗi cửa sổ.
- Phạm vi chỉ có bước xin mã đăng ký. Đăng nhập sai (cùng một câu cho email lạ và sai mật khẩu), quên mật khẩu (luôn cùng một câu) và
  `POST /auth/register` một bước (`CANNOT_REGISTER` chung cho email/số điện thoại trùng) giữ nguyên không lộ email.

## Hệ quả

- Người ngoài biết được một email có tài khoản VehicSim hay không qua form đăng ký, giới hạn theo hạn mức IP. Chấp nhận được với
  quy mô đồ án; nếu mở rộng thì cân nhắc CAPTCHA hoặc quay lại lựa chọn 1.
- Bất biến 7 đổi thành "không lộ email tồn tại, trừ bước xin mã đăng ký (ADR-070)". Máy kiểm:
  `AuthPrivacyTest#registrationCodeIsNotSentToAnEmailThatAlreadyHasAnAccount` (409, không sinh mã, không gửi mail).
