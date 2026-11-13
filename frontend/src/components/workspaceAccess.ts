/** Role quản lý workspace (thêm / bớt thành viên, giao task, duyệt báo cáo). Admin quản trị workspace ở /admin/workspaces. */
export const WORKSPACE_MANAGER_ROLES = ["MANAGER"];

/** Role thành viên workspace (Quản lý, Kỹ sư, Người duyệt): xem workspace, task, nộp báo cáo, trao đổi. */
export const WORKSPACE_ROLES = ["MANAGER", "ENGINEER", "REVIEWER"];

/** Role có task và báo cáo công việc ở `/my-work` (backend `VehicSimAccess.requireWorkspaceMember`). */
export const MEMBER_ROLES = ["ENGINEER", "REVIEWER"];
