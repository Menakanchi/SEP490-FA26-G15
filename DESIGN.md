---
name: VehicSim
colors:
  primary: "#315744"
  ink: "#25332B"
  background: "#F5F3ED"
  surface: "#FFFDFA"
  border: "#DDDCD3"
  soft: "#EFEEE7"
typography:
  page-title: { fontFamily: Plus Jakarta Sans, fontSize: 34px, fontWeight: 700, lineHeight: 1.2 }
  section-title: { fontFamily: Plus Jakarta Sans, fontSize: 17px, fontWeight: 700, lineHeight: 1.35 }
  body: { fontFamily: Plus Jakarta Sans, fontSize: 14px, fontWeight: 400, lineHeight: 1.5 }
spacing:
  card: 20px
rounded:
  card: 12px
  control: 8px
components:
  card: { backgroundColor: "{colors.surface}", rounded: "{rounded.card}", padding: "{spacing.card}" }
  primary-action: { backgroundColor: "{colors.primary}", rounded: "{rounded.control}" }
---

# VehicSim

## Overview

Hồ sơ thử nghiệm là giao diện làm việc của kỹ sư và người duyệt. Kết quả, trạng thái và hành động được đọc theo thứ tự ưu tiên của từng vai trò.

## Colors

Dùng token `--color-vehicsim-*` trong `frontend/src/app/globals.css`. Nền ấm phân biệt vùng nội dung với thanh điều hướng. Xanh đậm dành cho hành động chính và mục đang chọn. Các trạng thái có nhãn chữ.

## Layout

Header chứa thông tin workspace và công cụ dùng chung. Sidebar chứa project và các mục theo quyền của tài khoản. Footer ghi tên sản phẩm và mục đích kiểm thử. Trên màn hẹp, sidebar mở từ nút Menu trong header.

Tổng quan đặt kết quả hoặc hàng đợi ở cột chính, quy trình hoặc việc cần làm ở cột bên. Trên màn hẹp, hai cột xếp dọc.

## Components

- Dùng viền mảnh để phân nhóm và đường kẻ để phân hàng. Dành bóng đổ cho hộp thoại và menu nổi.
- Số liệu hiển thị theo phạm vi API trả về. Chỗ thiếu dữ liệu dùng trạng thái tải, lỗi hoặc trống.
- Các mục điều hướng và thao tác hiển thị theo vai trò và project đang mở.
