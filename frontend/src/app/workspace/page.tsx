"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, StatCard, Tag, fmt } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES, WORKSPACE_MANAGER_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { WorkspaceSummary } from "@/types/vehicsim";

/** M1 — Workspace (ADMIN/MANAGER quản lý; ENGINEER/REVIEWER xem workspace tham gia). */
export default function WorkspacesPage() {
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");
  const isManagerOrAdmin = WORKSPACE_MANAGER_ROLES.includes(user?.roleCode ?? "");
  const [items, setItems] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    const fetcher = isManagerOrAdmin ? vehicsimApi.workspaces : vehicsimApi.myWorkspaces;
    fetcher()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách workspace"));
  }, [allowed, isManagerOrAdmin]);

  const members = (items ?? []).reduce((n, w) => n + w.member_count, 0);
  const projects = (items ?? []).reduce((n, w) => n + w.project_count, 0);
  const pendingReports = (items ?? []).reduce((n, w) => n + w.pending_report_count, 0);

  return (
    <VehicSimPage
      crumbs={[{ label: "Workspace" }]}
      title="Workspace"
      subtitle={
        !allowed
          ? undefined
          : user?.roleCode === "ADMIN"
          ? "Mọi workspace trong hệ thống. Chọn một workspace để xem project và quản lý thành viên."
          : user?.roleCode === "MANAGER"
          ? "Các workspace Quản trị viên đã giao cho bạn quản lý. Chọn một workspace để xem project và quản lý thành viên."
          : "Các workspace bạn đang tham gia. Chọn một workspace để xem task, dự án, báo cáo và trao đổi kỹ thuật."
      }
    >
      {!allowed ? (
        <EmptyState title="Bạn chưa có quyền truy cập khu vực workspace. Quản trị viên sử dụng mục Quản trị → Workspace." />
      ) : (
        <>
          <ErrorNote message={error} />
          <div className="grid w-full grid-cols-2 items-stretch gap-3 xl:grid-cols-4">
            <StatCard label="Workspace" value={items ? items.length : "…"} />
            <StatCard label="Thành viên" value={items ? members : "…"} note="Kỹ sư và Người duyệt" />
            <StatCard label="Project" value={items ? projects : "…"} note="trong các workspace" />
            {isManagerOrAdmin && (
              <StatCard label="Báo cáo chờ duyệt" value={items ? pendingReports : "…"} tone={pendingReports ? "warn" : undefined} />
            )}
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-vehicsim-line px-5 py-4">
              <CardTitle>Danh sách workspace</CardTitle>
            </div>
            {items && items.length === 0 && (
              <EmptyState title={isManagerOrAdmin ? "Bạn chưa được giao workspace nào" : "Bạn chưa tham gia workspace nào"}>
                {isManagerOrAdmin
                  ? "Quản trị viên tạo workspace và gán Quản lý. Khi được gán, workspace sẽ hiện ở đây."
                  : "Quản lý workspace sẽ thêm bạn vào workspace để phân công task và dự án."}
              </EmptyState>
            )}
            {!items && !error && <p role="status" className="px-5 py-4 text-sm text-vehicsim-muted">Đang tải workspace…</p>}
            {items && items.length > 0 && (
              <ul className="divide-y divide-vehicsim-line">
                {items.map((w) => (
                  <li key={w.id}>
                    <Link href={`/workspace/${w.id}`}
                      className="grid min-w-0 gap-4 px-5 py-4 hover:bg-vehicsim-row focus-visible:-outline-offset-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] xl:items-start">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold text-vehicsim-primary">{w.name}</p>
                        {w.description && <p className="mt-1 break-words text-xs leading-relaxed text-vehicsim-muted">{w.description}</p>}
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3 2xl:grid-cols-5">
                        {[
                          ["Quản lý", w.manager.full_name],
                          ["Thành viên", w.member_count],
                          ["Project", w.project_count],
                          ["Báo cáo chờ duyệt", w.pending_report_count],
                          ["Ngày tạo", fmt.date(w.created_date)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-vehicsim-muted">{label}</dt>
                            <dd className="mt-1 break-words font-semibold tabular-nums">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <Tag tone={w.status === "ACTIVE" ? "ok" : "neutral"}>{w.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</Tag>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </VehicSimPage>
  );
}
