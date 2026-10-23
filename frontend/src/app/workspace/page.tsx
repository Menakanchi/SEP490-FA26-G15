"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, StatCard, Tag, fmt } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { WorkspaceSummary } from "@/types/vehicsim";

/** M1 — Workspace tôi quản lý (ADMIN thấy mọi workspace). */
export default function WorkspacesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");
  const [items, setItems] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    vehicsimApi.workspaces()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách workspace"));
  }, [allowed]);

  const members = (items ?? []).reduce((n, w) => n + w.member_count, 0);
  const projects = (items ?? []).reduce((n, w) => n + w.project_count, 0);

  return (
    <VehicSimPage
      crumbs={[{ label: "Workspace" }]}
      title="Workspace"
      subtitle={
        !allowed
          ? undefined
          : user?.roleCode === "ADMIN"
          ? "Mọi workspace trong hệ thống. Chọn một workspace để xem project và quản lý thành viên."
          : "Các workspace Quản trị viên đã giao cho bạn quản lý. Chọn một workspace để xem project và quản lý thành viên."
      }
    >
      {!allowed ? (
        <EmptyState title="Chỉ Quản lý workspace hoặc Quản trị viên được vào màn này" />
      ) : (
        <>
          <ErrorNote message={error} />
          <div className="flex w-full items-stretch gap-4">
            <StatCard label="Workspace" value={items ? items.length : "…"} />
            <StatCard label="Thành viên" value={items ? members : "…"} note="Kỹ sư và Người duyệt" />
            <StatCard label="Project" value={items ? projects : "…"} note="trong các workspace" />
          </div>

          <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
            <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
              <span className="min-w-0 flex-1">Workspace</span>
              <span className="w-[200px]">Quản lý</span>
              <span className="w-[110px]">Thành viên</span>
              <span className="w-[90px]">Project</span>
              <span className="w-[110px]">Trạng thái</span>
              <span className="w-[100px]">Ngày tạo</span>
              <span className="w-[60px]" />
            </div>
            {items && items.length === 0 && (
              <EmptyState title="Bạn chưa được giao workspace nào">
                Quản trị viên tạo workspace và gán Quản lý. Khi được gán, workspace sẽ hiện ở đây.
              </EmptyState>
            )}
            {(items ?? []).map((w) => (
              <div
                key={w.id}
                onClick={() => router.push(`/workspace/${w.id}`)}
                className="flex h-[58px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 last:border-b-0 hover:bg-vehicsim-row"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                  <span className="truncate text-[13px] font-bold text-vehicsim-ink">{w.name}</span>
                  <span className="truncate text-[12px] text-vehicsim-faint">{w.description || "—"}</span>
                </span>
                <span className="w-[200px] truncate pr-3 text-[13px] text-vehicsim-muted">{w.manager.full_name}</span>
                <span className="w-[110px] text-[13px] font-semibold text-vehicsim-ink">{w.member_count}</span>
                <span className="w-[90px] text-[13px] font-semibold text-vehicsim-ink">{w.project_count}</span>
                <span className="w-[110px]">
                  <Tag tone={w.status === "ACTIVE" ? "ok" : "neutral"}>{w.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</Tag>
                </span>
                <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(w.created_date)}</span>
                <span className="flex w-[60px] justify-end text-[12px] font-semibold text-vehicsim-decision">Xem</span>
              </div>
            ))}
          </section>
        </>
      )}
    </VehicSimPage>
  );
}
