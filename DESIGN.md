---
name: VehicSim
colors:
  primary: "#111111"
  background: "#F4F5F7"
  surface: "#FFFFFF"
  border: "#ECEEF2"
  soft: "#F7F8FA"
  accent: "#2563EB"
typography:
  page-title: { fontFamily: Plus Jakarta Sans, fontSize: 40px, fontWeight: 800, lineHeight: 1.1 }
  action-title: { fontFamily: Plus Jakarta Sans, fontSize: 26px, fontWeight: 800, lineHeight: 1.2 }
  body: { fontFamily: Plus Jakarta Sans, fontSize: 15px, fontWeight: 400, lineHeight: 1.5 }
spacing:
  card: 20px
  action: 28px
rounded:
  project: 14px
  card: 20px
  action: 24px
components:
  card: { backgroundColor: "{colors.surface}", rounded: "{rounded.card}", padding: "{spacing.card}" }
  next-action: { backgroundColor: "{colors.primary}", textColor: "{colors.surface}", rounded: "{rounded.action}", padding: "{spacing.action}" }
---

# VehicSim

## Overview

Giao diện project của Experiencer là mẫu cho tổng quan và điều hướng của Engineer và Reviewer.

## Colors

Dùng token `--color-vehicsim-*` trong `frontend/src/app/globals.css`. Màu trạng thái đi kèm chữ hoặc biểu tượng.

## Layout

Đặt project hiện tại trên thanh bên và việc ưu tiên ở đầu tổng quan. Trên màn hẹp, thanh bên thu vào menu và các thẻ xếp lại theo chiều rộng.

## Components

- Thẻ việc tiếp theo dùng nền đen và một hành động chính dạng pill.
- Các bước có cùng thứ tự và tên. Dữ liệu, thao tác và trạng thái khả dụng dựa trên vai trò và project.
