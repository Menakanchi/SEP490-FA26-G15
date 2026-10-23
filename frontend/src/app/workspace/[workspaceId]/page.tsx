"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, PillButton, StatCard, Tag, fmt } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { WorkspaceDetail, WorkspaceMember, WorkspaceMemberCandidate, WorkspaceMemberRole } from "@/types/vehicsim";

const MEMBER_ROLE: Record<WorkspaceMemberRole, { label: string; tone: "info" | "warn" }> = {
  ENGINEER: { label: "Kỹ sư", tone: "info" },
  REVIEWER: { label: "Người duyệt", tone: "warn" },
};

function RoleTag({ role }: { role: WorkspaceMemberRole }) {
  const r = MEMBER_ROLE[role] ?? { label: role, tone: "info" as const };
  return <Tag tone={r.tone}>{r.label}</Tag>;
}

/** M2 — chi tiết workspace và project; M3 — thành viên; M4 — thêm; M5 — bớt. */
export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const id = Number(workspaceId);
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<WorkspaceMemberCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([vehicsimApi.workspace(id), vehicsimApi.workspaceMembers(id)]);
      setDetail(d);
      setMembers(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được workspace");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu workspace khi mở trang
    if (allowed) void load();
  }, [allowed, load]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearching(true);
    setError(null);
    try {
      setCandidates(await vehicsimApi.workspaceMemberCandidates(id, query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tìm được người dùng");
    } finally {
      setSearching(false);
    }
  };

  const add = async (c: WorkspaceMemberCandidate) => {
    setBusy(c.user_id);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.addWorkspaceMember(id, c.user_id);
      setNotice(`Đã thêm ${c.full_name} (${MEMBER_ROLE[c.role]?.label ?? c.role}) vào workspace.`);
      setCandidates((list) => (list ?? []).filter((x) => x.user_id !== c.user_id));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thêm được thành viên");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: WorkspaceMember) => {
    const ok = window.confirm(
      `Bớt ${m.full_name} khỏi workspace?` +
        (m.project_count ? `\nNgười này sẽ tự rời ${m.project_count} project của workspace.` : "") +
        (m.open_task_count ? `\n${m.open_task_count} task chưa xong của họ sẽ chuyển về “chưa giao”.` : ""),
    );
    if (!ok) return;
    setBusy(m.user_id);
    setError(null);
    setNotice(null);
    try {
      const r = await vehicsimApi.removeWorkspaceMember(id, m.user_id);
      const parts = [
        r.removed_project_memberships ? `rời ${r.removed_project_memberships} project` : "",
        r.unassigned_tasks ? `${r.unassigned_tasks} task chưa xong chuyển về “chưa giao”` : "",
      ].filter(Boolean);
      setNotice(`Đã bớt ${m.full_name} khỏi workspace${parts.length ? `; ${parts.join(", ")}` : ""}.`);
      setCandidates(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không bớt được thành viên");
    } finally {
      setBusy(null);
    }
  };

  const ws = detail?.workspace;
  const active = ws?.status === "ACTIVE";
  const count = (role: WorkspaceMemberRole) => (members ?? []).filter((m) => m.role === role).length;

  return (
    <VehicSimPage
      crumbs={[{ label: "Workspace", href: "/workspace" }, { label: ws?.name ?? "…" }]}
      title={ws?.name ?? "Workspace"}
      badges={ws && <Tag tone={active ? "ok" : "neutral"}>{active ? "Hoạt động" : "Đã lưu trữ"}</Tag>}
      subtitle={ws ? `${(ws.description || "Chưa có mô tả").replace(/[.\s]+$/, "")}. Quản lý: ${ws.manager.full_name}.` : undefined}
      actions={
        allowed && ws ? (
          <>
            <PillButton href={`/workspace/${id}/reports`}>
              Báo cáo{ws.pending_report_count ? ` (${ws.pending_report_count} chờ duyệt)` : ""} →
            </PillButton>
            <PillButton href={`/workspace/${id}/tasks`}>Task của workspace →</PillButton>
          </>
        ) : undefined
      }
    >
      {!allowed ? (
        <EmptyState title="Chỉ Quản lý workspace hoặc Quản trị viên được vào màn này" />
      ) : (
        <>
          <ErrorNote message={error} />
          {notice && (
            <div role="status" className="rounded-[16px] border border-solid border-vehicsim-ok/30 bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
              {notice}
            </div>
          )}
          <div className="rounded-[16px] border border-solid border-vehicsim-line bg-vehicsim-soft px-4 py-3 text-[12px] text-vehicsim-muted">
            Ứng dụng hiện vẫn chạy trên một project chung (TD-30): thêm hoặc bớt thành viên được lưu lại nhưng chưa thay đổi dữ liệu
            mà người đó nhìn thấy.
          </div>

          <div className="flex w-full items-stretch gap-4">
            <StatCard label="Thành viên" value={members ? members.length : "…"} />
            <StatCard label="Kỹ sư" value={members ? count("ENGINEER") : "…"} tone="info" note="tạo project, chạy mô phỏng" />
            <StatCard label="Người duyệt" value={members ? count("REVIEWER") : "…"} tone="warn" note="Accept / Reject khuyến nghị" />
            <StatCard label="Project" value={detail ? detail.projects.length : "…"} />
          </div>

          <Card className="flex flex-col gap-4 p-5">
            <CardTitle aside={<span className="text-[12px] text-vehicsim-faint">{members ? `${members.length} người` : "…"}</span>}>
              Thành viên
            </CardTitle>
            <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
              <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-4 text-[11px] font-semibold uppercase text-vehicsim-faint">
                <span className="min-w-0 flex-1">Người dùng</span>
                <span className="w-[130px]">Vai trò</span>
                <span className="w-[90px]">Project</span>
                <span className="w-[90px]">Task mở</span>
                <span className="w-[180px]">Thêm bởi</span>
                <span className="w-[100px]">Ngày vào</span>
                <span className="w-[90px]" />
              </div>
              {members && members.length === 0 && (
                <EmptyState title="Workspace chưa có thành viên">Tìm Kỹ sư hoặc Người duyệt ở khung bên dưới để thêm.</EmptyState>
              )}
              {(members ?? []).map((m) => {
                const owner = m.owned_project_count > 0;
                return (
                  <div key={m.user_id} className="flex h-[58px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                      <span className="flex items-center gap-2 truncate text-[13px] font-bold text-vehicsim-ink">
                        {m.full_name}
                        {!m.is_active && <Tag tone="danger">Đã khoá</Tag>}
                      </span>
                      <span className="truncate text-[12px] text-vehicsim-faint">{m.email}</span>
                    </span>
                    <span className="w-[130px]">
                      <RoleTag role={m.role} />
                    </span>
                    <span className="w-[90px] text-[13px] text-vehicsim-ink">
                      {m.project_count}
                      {owner && <span className="text-vehicsim-faint"> · chủ {m.owned_project_count}</span>}
                    </span>
                    <span className="w-[90px] text-[13px] text-vehicsim-ink">{m.open_task_count}</span>
                    <span className="w-[180px] truncate pr-3 text-[13px] text-vehicsim-muted">{m.added_by?.full_name ?? "—"}</span>
                    <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(m.joined_at)}</span>
                    <span className="flex w-[90px] justify-end">
                      <button
                        type="button"
                        disabled={!active || owner || busy !== null}
                        title={owner ? "Đang là chủ project trong workspace, chưa bớt được" : !active ? "Workspace đã lưu trữ" : undefined}
                        onClick={() => remove(m)}
                        className="rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-danger hover:bg-vehicsim-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy === m.user_id ? "…" : "Bớt"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {active && (
            <Card className="flex flex-col gap-4 p-5">
              <CardTitle>Thêm thành viên</CardTitle>
              <p className="text-[13px] text-vehicsim-muted">
                Chỉ thêm được tài khoản Kỹ sư hoặc Người duyệt đang hoạt động. Role do Quản trị viên cấp, không đổi theo workspace.
              </p>
              <form onSubmit={search} className="flex items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={100}
                  placeholder="Tìm theo email hoặc tên (để trống: tất cả)"
                  aria-label="Tìm người dùng theo email hoặc tên"
                  className="w-[360px] rounded-full border border-solid border-vehicsim-line bg-white px-[14px] py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                />
                <PillButton type="submit" disabled={searching}>
                  {searching ? "Đang tìm…" : "Tìm"}
                </PillButton>
              </form>
              {candidates && candidates.length === 0 && (
                <p className="text-[13px] text-vehicsim-faint">Không còn Kỹ sư / Người duyệt nào khớp và chưa ở workspace.</p>
              )}
              {candidates && candidates.length > 0 && (
                <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
                  {candidates.map((c) => (
                    <div key={c.user_id} className="flex h-[52px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                        <span className="truncate text-[13px] font-bold text-vehicsim-ink">{c.full_name}</span>
                        <span className="truncate text-[12px] text-vehicsim-faint">{c.email}</span>
                      </span>
                      <span className="w-[130px]">
                        <RoleTag role={c.role} />
                      </span>
                      <PillButton variant="dark" className="px-4 py-2" disabled={busy !== null} onClick={() => add(c)}>
                        {busy === c.user_id ? "Đang thêm…" : "Thêm"}
                      </PillButton>
                    </div>
                  ))}
                  {candidates.length >= 20 && (
                    <p className="px-4 py-2 text-[12px] text-vehicsim-faint">Hiện 20 người đầu; gõ thêm để lọc.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-4 p-5">
            <CardTitle>Project trong workspace</CardTitle>
            <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
              <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-4 text-[11px] font-semibold uppercase text-vehicsim-faint">
                <span className="min-w-0 flex-1">Project</span>
                <span className="w-[200px]">Chủ project</span>
                <span className="w-[110px]">Thành viên</span>
                <span className="w-[110px]">Trạng thái</span>
                <span className="w-[100px]">Ngày tạo</span>
              </div>
              {detail && detail.projects.length === 0 && (
                <EmptyState title="Chưa có project">Kỹ sư trong workspace tự tạo project; Quản lý không tạo project.</EmptyState>
              )}
              {(detail?.projects ?? []).map((p) => (
                <div key={p.id} className="flex h-[52px] items-center border-b border-solid border-vehicsim-line px-4 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate pr-3 text-[13px] font-bold text-vehicsim-ink">{p.name}</span>
                  <span className="w-[200px] truncate pr-3 text-[13px] text-vehicsim-muted">{p.owner.full_name}</span>
                  <span className="w-[110px] text-[13px] text-vehicsim-ink">{p.member_count}</span>
                  <span className="w-[110px]">
                    <Tag tone={p.status === "ACTIVE" ? "ok" : "neutral"}>{p.status === "ACTIVE" ? "Hoạt động" : "Đã lưu trữ"}</Tag>
                  </span>
                  <span className="w-[100px] text-[13px] text-vehicsim-faint">{fmt.date(p.created_date)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </VehicSimPage>
  );
}
