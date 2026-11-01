/** Role được vào khu quản lý workspace (backend `VehicSimAccess.requireWorkspaceManager` cũng trả 403 cho role khác). */
export const WORKSPACE_ROLES = ["MANAGER", "ADMIN"];

/** Role có task và báo cáo công việc trong workspace (backend `VehicSimAccess.requireWorkspaceMember`). */
export const MEMBER_ROLES = ["ENGINEER", "REVIEWER"];
