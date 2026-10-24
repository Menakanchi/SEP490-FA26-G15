"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, FilterSelect, PillButton, StatCard, Tag, cx } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type {
  TaskPriority,
  TaskStatus,
  WorkspaceDetail,
  WorkspaceMember,
  WorkspaceTask,
  WorkspaceTaskRequest,
} from "@/types/vehicsim";

const STATUS: Record<TaskStatus, { label: string; tone: "neutral" | "info" | "warn" | "ok" }> = {
  TODO: { label: "Cần làm", tone: "neutral" },
  IN_PROGRESS: { label: "Đang làm", tone: "info" },
  REVIEW: { label: "Chờ kiểm tra", tone: "warn" },
  DONE: { label: "Hoàn thành", tone: "ok" },
};
const PRIORITY: Record<TaskPriority, { label: string; tone: "neutral" | "info" | "warn" | "danger" }> = {
  LOW: { label: "Thấp", tone: "neutral" },
  MEDIUM: { label: "Trung bình", tone: "info" },
  HIGH: { label: "Cao", tone: "warn" },
  URGENT: { label: "Khẩn", tone: "danger" },
};
const STATUSES = Object.keys(STATUS) as TaskStatus[];
const PRIORITIES = Object.keys(PRIORITY) as TaskPriority[];

/** Ngày hôm nay theo giờ máy, dạng yyyy-MM-dd cho ô chọn ngày. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-30" → "30/10/2026" (cột DATE, không đổi múi giờ). */
function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const EMPTY: WorkspaceTaskRequest = {
  title: "",
  description: null,
  priority: "MEDIUM",
  status: "TODO",
  progress_pct: 0,
  assignee_id: null,
  project_id: null,
  due_date: null,
};

function toRequest(t: WorkspaceTask): WorkspaceTaskRequest {
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    progress_pct: t.progress_pct,
    assignee_id: t.assignee?.id ?? null,
    project_id: t.project?.id ?? null,
    due_date: t.due_date,
  };
}

const inputCls =
  "w-full rounded-[12px] border border-solid border-vehicsim-line bg-white px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong disabled:bg-vehicsim-soft";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-[12px] font-semibold text-vehicsim-muted">{label}</span>
      {children}
    </label>
  );
}

/** M6 — giao task; M7 — theo dõi và sửa task trong workspace. */
export default function WorkspaceTasksPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const id = Number(workspaceId);
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState<TaskStatus | "">("");
  const [assignee, setAssignee] = useState<string>("");

  // null = đóng form; "new" = giao task mới; số = id task đang sửa.
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [form, setForm] = useState<WorkspaceTaskRequest>(EMPTY);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await vehicsimApi.workspaceTasks(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách task");
    }
  }, [id]);

  useEffect(() => {
    if (!allowed) return;
    Promise.all([vehicsimApi.workspace(id), vehicsimApi.workspaceMembers(id)])
      .then(([d, m]) => {
        setDetail(d);
        setMembers(m);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được workspace"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải danh sách task khi mở trang
    void loadTasks();
  }, [allowed, id, loadTasks]);

  const ws = detail?.workspace;
  const active = ws?.status === "ACTIVE";
  const visible = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          (!status || t.status === status) &&
          (!assignee || (assignee === "0" ? t.assignee === null : String(t.assignee?.id) === assignee)),
      ),
    [tasks, status, assignee],
  );
  const open = (tasks ?? []).filter((t) => t.status !== "DONE");
  const editingTask = typeof editing === "number" ? (tasks ?? []).find((t) => t.id === editing) : undefined;

  const startNew = () => {
    setForm(EMPTY);
    setEditing("new");
    setNotice(null);
    setError(null);
  };
  const startEdit = (t: WorkspaceTask) => {
    setForm(toRequest(t));
    setEditing(t.id);
    setNotice(null);
    setError(null);
  };
  const set = <K extends keyof WorkspaceTaskRequest>(key: K, value: WorkspaceTaskRequest[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, title: form.title.trim(), description: form.description?.trim() || null };
      if (editing === "new") {
        const t = await vehicsimApi.createWorkspaceTask(id, body);
        setNotice(`Đã giao task “${t.title}”${t.assignee ? ` cho ${t.assignee.full_name}` : " (chưa giao ai)"}.`);
      } else if (typeof editing === "number") {
        const t = await vehicsimApi.updateWorkspaceTask(id, editing, body);
        setNotice(`Đã cập nhật task “${t.title}”.`);
      }
      setEditing(null);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được task");
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (t: WorkspaceTask, next: TaskStatus) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.updateWorkspaceTask(id, t.id, { ...toRequest(t), status: next });
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đổi được trạng thái");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: WorkspaceTask) => {
    if (!window.confirm(`Xoá task “${t.title}”?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.deleteWorkspaceTask(id, t.id);
      setNotice(`Đã xoá task “${t.title}”.`);
      if (editing === t.id) setEditing(null);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xoá được task");
    } finally {
      setBusy(false);
    }
  };

  // Người nhận đang chọn có thể đã rời workspace (task cũ đã DONE): vẫn giữ trong danh sách chọn để không mất giá trị.
  const assigneeOptions = members.filter((m) => m.is_active || m.user_id === form.assignee_id);
  const keepAssignee = editingTask?.assignee && !members.some((m) => m.user_id === editingTask.assignee?.id) ? editingTask.assignee : null;
  const projectOptions = (detail?.projects ?? []).filter((p) => p.status === "ACTIVE" || p.id === form.project_id);

  return (
    <VehicSimPage
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: ws?.name ?? "…", href: `/workspace/${id}` },
        { label: "Task" },
      ]}
      title="Task"
      badges={ws && !active && <Tag tone="neutral">Workspace đã lưu trữ — chỉ xem</Tag>}
      subtitle={allowed ? "Giao việc cho Kỹ sư và Người duyệt trong workspace, theo dõi trạng thái, tiến độ và hạn." : undefined}
      actions={
        allowed && active && editing === null ? (
          <PillButton variant="dark" onClick={startNew}>
            + Giao task
          </PillButton>
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

          <div className="flex w-full items-stretch gap-4">
            <StatCard label="Đang mở" value={tasks ? open.length : "…"} note="chưa hoàn thành" />
            <StatCard
              label="Quá hạn"
              value={tasks ? open.filter((t) => t.overdue).length : "…"}
              tone="danger"
              valueClass={open.some((t) => t.overdue) ? "text-vehicsim-danger" : undefined}
              note="cần xử lý"
            />
            <StatCard label="Chờ kiểm tra" value={tasks ? open.filter((t) => t.status === "REVIEW").length : "…"} tone="warn" />
            <StatCard label="Chưa giao ai" value={tasks ? open.filter((t) => !t.assignee).length : "…"} tone="info" />
            <StatCard label="Hoàn thành" value={tasks ? tasks.length - open.length : "…"} tone="ok" />
          </div>

          {editing !== null && (
            <Card className="p-5">
              <form onSubmit={save} className="flex flex-col gap-4">
                <CardTitle>{editing === "new" ? "Giao task mới" : `Sửa task #${editing}`}</CardTitle>
                <Field label="Tên task *">
                  <input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    maxLength={255}
                    required
                    placeholder="VD: Chạy lại baseline họ PX2 trên CARLA"
                    className={inputCls}
                  />
                </Field>
                <Field label="Mô tả">
                  <textarea
                    value={form.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    maxLength={5000}
                    rows={3}
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Người nhận">
                    <select
                      value={form.assignee_id ?? ""}
                      onChange={(e) => set("assignee_id", e.target.value ? Number(e.target.value) : null)}
                      className={inputCls}
                    >
                      <option value="">— Chưa giao —</option>
                      {assigneeOptions.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.full_name} ({m.role === "ENGINEER" ? "Kỹ sư" : "Người duyệt"})
                        </option>
                      ))}
                      {keepAssignee && <option value={keepAssignee.id}>{keepAssignee.full_name} (đã rời workspace)</option>}
                    </select>
                  </Field>
                  <Field label="Project">
                    <select
                      value={form.project_id ?? ""}
                      onChange={(e) => set("project_id", e.target.value ? Number(e.target.value) : null)}
                      disabled={!!editingTask && editingTask.report_count > 0}
                      className={inputCls}
                    >
                      <option value="">— Không gắn project —</option>
                      {projectOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.status !== "ACTIVE" ? " (đã lưu trữ)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Hạn hoàn thành">
                    <input
                      type="date"
                      value={form.due_date ?? ""}
                      min={editing === "new" ? today() : undefined}
                      onChange={(e) => set("due_date", e.target.value || null)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Độ ưu tiên">
                    <select value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)} className={inputCls}>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY[p].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Trạng thái">
                    <select value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)} className={inputCls}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS[s].label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Tiến độ: ${form.status === "DONE" ? 100 : form.progress_pct}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={form.status === "DONE" ? 100 : form.progress_pct}
                      disabled={form.status === "DONE"}
                      onChange={(e) => set("progress_pct", Number(e.target.value))}
                      className="mt-2 accent-vehicsim-ink"
                      aria-label="Tiến độ"
                    />
                  </Field>
                </div>
                {editingTask && editingTask.report_count > 0 && (
                  <p className="text-[12px] text-vehicsim-faint">Task đã có báo cáo nên không đổi project được.</p>
                )}
                <div className="flex items-center gap-2">
                  <PillButton type="submit" variant="dark" disabled={busy || !form.title.trim()}>
                    {busy ? "Đang lưu…" : editing === "new" ? "Giao task" : "Lưu thay đổi"}
                  </PillButton>
                  <PillButton onClick={() => setEditing(null)} disabled={busy}>
                    Huỷ
                  </PillButton>
                </div>
              </form>
            </Card>
          )}

          <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
            <div className="flex items-center gap-2 px-5 py-4">
              <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{tasks ? `${visible.length} task` : "…"}</span>
              <FilterSelect<TaskStatus>
                label="Trạng thái"
                value={status}
                options={STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))}
                onChange={setStatus}
              />
              <FilterSelect<string>
                label="Người nhận"
                value={assignee}
                options={[{ value: "0", label: "Chưa giao" }, ...members.map((m) => ({ value: String(m.user_id), label: m.full_name }))]}
                onChange={setAssignee}
              />
            </div>
            <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
              <span className="min-w-0 flex-1">Task</span>
              <span className="w-[170px]">Người nhận</span>
              <span className="w-[100px]">Ưu tiên</span>
              <span className="w-[150px]">Trạng thái</span>
              <span className="w-[130px]">Tiến độ</span>
              <span className="w-[100px]">Hạn</span>
              <span className="w-[110px]" />
            </div>
            {tasks && visible.length === 0 && (
              <EmptyState title={tasks.length ? "Không có task nào khớp bộ lọc" : "Chưa có task"}>
                {active && !tasks.length ? "Bấm “Giao task” để giao việc đầu tiên cho thành viên." : undefined}
              </EmptyState>
            )}
            {visible.map((t) => (
              <div
                key={t.id}
                className={cx(
                  "flex min-h-[64px] items-center border-b border-solid border-vehicsim-line px-5 py-2 last:border-b-0",
                  editing === t.id && "bg-vehicsim-row",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                  <span className={cx("truncate text-[13px] font-bold", t.status === "DONE" ? "text-vehicsim-faint line-through" : "text-vehicsim-ink")}>
                    {t.title}
                  </span>
                  <span className="truncate text-[12px] text-vehicsim-faint">
                    {t.project ? `${t.project.name} · ` : ""}
                    {t.description || "Không có mô tả"}
                    {t.report_count ? ` · ${t.report_count} báo cáo` : ""}
                  </span>
                </span>
                <span className="w-[170px] truncate pr-3 text-[13px] text-vehicsim-muted">
                  {t.assignee?.full_name ?? <span className="italic text-vehicsim-faint">Chưa giao</span>}
                </span>
                <span className="w-[100px]">
                  <Tag tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Tag>
                </span>
                <span className="w-[150px] pr-3">
                  {active ? (
                    <select
                      aria-label={`Trạng thái của ${t.title}`}
                      value={t.status}
                      disabled={busy}
                      onChange={(e) => quickStatus(t, e.target.value as TaskStatus)}
                      className="w-full cursor-pointer rounded-full border border-solid border-vehicsim-line bg-white px-3 py-[5px] text-[12px] font-semibold text-vehicsim-ink disabled:opacity-50"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS[s].label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Tag tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Tag>
                  )}
                </span>
                <span className="flex w-[130px] items-center gap-2 pr-3">
                  <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-vehicsim-line">
                    <span
                      className={cx("block h-full rounded-full", t.status === "DONE" ? "bg-vehicsim-ok" : "bg-vehicsim-ink")}
                      style={{ width: `${t.progress_pct}%` }}
                    />
                  </span>
                  <span className="w-[34px] text-right text-[12px] font-semibold text-vehicsim-ink">{t.progress_pct}%</span>
                </span>
                <span className={cx("w-[100px] text-[13px]", t.overdue ? "font-semibold text-vehicsim-danger" : "text-vehicsim-faint")}>
                  {dateLabel(t.due_date)}
                  {t.overdue && <span className="block text-[11px]">quá hạn</span>}
                </span>
                <span className="flex w-[110px] justify-end gap-1">
                  {active && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEdit(t)}
                        className="rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-decision hover:bg-vehicsim-soft disabled:opacity-40"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={busy || t.report_count > 0}
                        title={t.report_count > 0 ? "Task đã có báo cáo, không xoá được" : undefined}
                        onClick={() => remove(t)}
                        className="rounded-full px-3 py-[6px] text-[12px] font-semibold text-vehicsim-danger hover:bg-vehicsim-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Xoá
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </section>
          <p className="text-[12px] text-vehicsim-faint">
            Người được giao chưa tự cập nhật tiến độ trên màn của họ; Quản lý cập nhật tại đây.
          </p>
        </>
      )}
    </VehicSimPage>
  );
}
