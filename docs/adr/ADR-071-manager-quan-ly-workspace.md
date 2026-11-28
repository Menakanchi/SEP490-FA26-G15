# ADR-071 — Manager tập trung quản lý workspace

**Trạng thái:** Accepted 27/11/2026 — theo yêu cầu trực tiếp của người dùng.
**Thay thế một phần:** quyền MANAGER đọc nghiệp vụ kỹ thuật trong [ADR-035](ADR-035-nam-role-he-thong-bo-cau-hinh-xe-va-meomeo.md) và [ADR-049](ADR-049-reviewer-chay-regression-de-kiem-tra.md). Quyền Reviewer trong ADR-049 không đổi.

## Quyết định

- MANAGER sử dụng khu Hệ thống & Quản trị để quản lý workspace được giao, thành viên, task, báo cáo và trao đổi theo kiểm tra phạm vi hiện hành. Tài khoản và thông báo cá nhân vẫn dùng được.
- MANAGER không truy cập các chức năng kỹ thuật như kịch bản, mô phỏng, phương tiện, phân tích, AEB/MOBO và regression, kể cả gọi trực tiếp API. Sidebar không hiển thị các chức năng đó.
- Quyền ADMIN quản trị hệ thống và quyền ENGINEER, EXPERIENCER, REVIEWER trong quy trình kỹ thuật giữ nguyên. MANAGER không được cấp quyền ADMIN. Không đổi cơ chế duyệt recommendation hay schema.

## Kiểm chứng

`VehicSimSecurityTest#managerCannotBypassTechnicalPagesUsingDirectApiRequests` kiểm tra chặn truy cập API theo role; `WorkspaceSecurityTest` giữ kiểm tra quyền và phạm vi workspace. Frontend kiểm tra menu, trang đích sau đăng nhập và điều hướng trực tiếp.
