"use client";

import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import type { AdminResource } from "@/services/admin";
import { AdminUserEditor } from "./AdminUserEditor";
import { AdminUsersTable } from "./AdminUsersTable";
import { AdminWorkspacesTable } from "./AdminWorkspacesTable";
import { AdminReferencesTable } from "./AdminReferencesTable";

export function AdminManagement({ resource }: { resource: AdminResource }) {
  return <AuthGate allowedRoles={["admin"]}><Suspense fallback={<p role="status">Đang tải dữ liệu quản trị…</p>}>
    {resource === "users" ? <AdminUsersTable renderEditor={props => <AdminUserEditor {...props} />} />
      : resource === "workspaces" ? <AdminWorkspacesTable />
        : <AdminReferencesTable />}
  </Suspense></AuthGate>;
}
