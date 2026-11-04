"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, CardTitle, EmptyState, ErrorNote, Pagination, PillButton, StatCard, Tag, cx, fmt } from "@/components/VehicSimUi";
import { MEMBER_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { MemberTaskStatus, MyTask, MyWork, ReportStatus, TaskPriority, TaskStatus } from "@/types/vehicsim";

const STATUS: Record<TaskStatus, { label: string; tone: "neutral" | "info" | "warn" | "ok" }> = {
  TODO: { label: "Cần làm", tone: "neutral" },
  IN_PROGRESS: { label: "Đang làm", tone: "info" },
  REVIEW: { label: "Chờ kiểm tra", tone: "warn" },
  DONE: { label: "Hoàn thành", tone: "ok" },
};
/** Người được giao tự chọn được; "Hoàn thành" do Manager xác nhận. */
const MEMBER_STATUSES: MemberTaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW"];
const PRIORITY: Record<TaskPriority, { label: string; tone: "neutral" | "info" | "warn" | "danger" }> = {
  LOW: { label: "Thấp", tone: "neutral" },
  MEDIUM: { label: "Trung bình", tone: "info" },
  HIGH: { label: "Cao", tone: "warn" },
  URGENT: { label: "Khẩn", tone: "danger" },
};
const REPORT_STATUS: Record<ReportStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  SUBMITTED: { label: "Chờ duyệt", tone: "warn" },
  APPROVED: { label: "Đã duyệt", tone: "ok" },
  REJECTED: { label: "Từ chối", tone: "danger" },
};

const inputCls =
  "w-full rounded-[12px] border border-solid border-vehicsim-line bg-white px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong disabled:bg-vehicsim-soft";

/** "2026-10-30" → "30/10/2026" (cột DATE, không đổi múi giờ). */
function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Chỉ hiện đường dẫn đính kèm dạng http(s); giá trị khác hiện như chữ thường, không bấm được. */
function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1", className)}>
      <span className="text-[12px] font-semibold text-vehicsim-muted">{label}</span>
      {children}
    </label>
  );
}

interface ReportDraft {
  projectId: number | "";
  taskId: number | "";
  title: string;
  content: string;
  attachment: string;
}
const EMPTY_DRAFT: ReportDraft = { projectId: "", taskId: "", title: "", content: "", attachment: "" };

/**
 * UC-21 / UC-64 / UC-66 / UC-68 phía thành viên: Engineer và Reviewer xem task được giao ở mọi workspace, tự cập nhật trạng thái và
 * tiến độ (trừ "Hoàn thành" — Manager xác nhận), nộp báo cáo công việc và theo dõi kết quả duyệt.
 */
export default function MyWorkPage() {
  return <Suspense fallback={<div role="status" className="p-8">Đang tải nhiệm vụ…</div>}><MyWorkContent /></Suspense>;
}

function MyWorkContent() {
  const router = useRouter();
  const requestReport = useSearchParams().get("report") === "new";
  const { user } = useAuth();
  const allowed = MEMBER_ROLES.includes(user?.roleCode ?? "");
  const [work, setWork] = useState<MyWork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { status: MemberTaskStatus; progress: number }>>({});
  const [savingTask, setSavingTask] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestReport) return;
    // Tiêu thụ yêu cầu mở form để lần quay lại từ trang chủ cũng mở được form đang giữ nháp.
    queueMicrotask(() => setFormOpen(true));
    router.replace("/my-work", { scroll: false });
  }, [requestReport, router]);

  const load = useCallback(() => {
    vehicsimApi.myWork()
      .then((w) => {
        setWork(w);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được nhiệm vụ của bạn"));
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const tasks = useMemo(() => work?.tasks ?? [], [work]);
  const open = tasks.filter((t) => t.task.status !== "DONE");
  const overdue = tasks.filter((t) => t.task.overdue).length;
  const inReview = tasks.filter((t) => t.task.status === "REVIEW").length;
  const pendingReports = (work?.reports ?? []).filter((r) => r.status === "SUBMITTED").length;
  const projectTasks = tasks.filter((t) => draft.projectId !== "" && t.task.project?.id === draft.projectId);

  const [taskPage, setTaskPage] = useState(1);
  const taskTotal = tasks.length;
  const taskPageSize = 8;
  const taskPages = Math.max(1, Math.ceil(taskTotal / taskPageSize));
  const currentTaskPage = Math.min(taskPage, taskPages);
  const taskOffset = (currentTaskPage - 1) * taskPageSize;
  const shownTasks = tasks.slice(taskOffset, taskOffset + taskPageSize);

  const draftOf = (t: MyTask) =>
    drafts[t.task.id] ?? { status: (t.task.status === "DONE" ? "REVIEW" : t.task.status) as MemberTaskStatus, progress: t.task.progress_pct };
  const setTaskDraft = (t: MyTask, patch: Partial<{ status: MemberTaskStatus; progress: number }>) =>
    setDrafts((d) => ({ ...d, [t.task.id]: { ...draftOf(t), ...patch } }));

  const saveTask = async (t: MyTask) => {
    const d = draftOf(t);
    setSavingTask(t.task.id);
    setError(null);
    try {
      const saved = await vehicsimApi.updateMyTaskProgress(t.task.id, d.status, d.progress);
      setWork((current) => current && ({ ...current, tasks: current.tasks.map((item) => item.task.id === saved.task.id ? saved : item) }));
      setDrafts((current) => {
        const latest = current[t.task.id];
        // Người dùng có thể đã sửa tiếp trong lúc request đang chạy: chỉ bỏ đúng nháp vừa lưu.
        if (latest && (latest.status !== d.status || latest.progress !== d.progress)) return current;
        const next = { ...current };
        delete next[t.task.id];
        return next;
      });
      setNotice(d.status === "REVIEW" ? `Đã báo Manager kiểm tra task “${t.task.title}”.` : `Đã cập nhật task “${t.task.title}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được task");
    } finally {
      setSavingTask(null);
    }
  };

  const openReportFor = (t: MyTask | null) => {
    if (t && !work?.projects.some((p) => p.id === t.task.project?.id)) return;
    setFormError(null);
    if (t?.task.project) setDraft({ ...EMPTY_DRAFT, projectId: t.task.project.id, taskId: t.task.id, title: `Báo cáo: ${t.task.title}` });
    setFormOpen(true);
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.projectId === "" || !work?.projects.some((p) => p.id === draft.projectId)) {
      setFormError("Chọn project đang hoạt động để nộp báo cáo");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await vehicsimApi.submitMyReport({
        project_id: draft.projectId,
        task_id: draft.taskId === "" ? null : draft.taskId,
        title: draft.title,
        content: draft.content,
        attachment_url: draft.attachment.trim() || null,
      });
      setNotice("Đã nộp báo cáo. Manager của workspace sẽ nhận thông báo để duyệt.");
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Không nộp được báo cáo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VehicSimPage
      crumbs={[{ label: "Nhiệm vụ & báo cáo" }]}
      title="Nhiệm vụ & báo cáo"
      subtitle={
        allowed
          ? "Task Quản lý workspace giao cho bạn và báo cáo công việc bạn đã nộp. Bạn cập nhật tiến độ; Quản lý xác nhận hoàn thành và duyệt báo cáo."
          : undefined
      }
      actions={
        allowed && work && work.projects.length > 0 ? (
          <PillButton variant="dark" onClick={() => (formOpen ? setFormOpen(false) : openReportFor(null))}>
            {formOpen ? "Đóng" : "Nộp báo cáo"}
          </PillButton>
        ) : null
      }
    >
      {!allowed ? (
        <EmptyState title="Chỉ Kỹ sư và Người duyệt có task và báo cáo công việc" />
      ) : (
        <>
          <ErrorNote message={error} />
          {notice && (
            <div className="flex items-center justify-between gap-3 rounded-[14px] bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
              <span>{notice}</span>
              <button type="button" className="font-semibold" onClick={() => setNotice(null)}>
                Ẩn
              </button>
            </div>
          )}

          <div className="flex w-full items-stretch gap-4">
            <StatCard label="Đang mở" value={work ? open.length : "…"} note="task chưa hoàn thành" />
            <StatCard
              label="Quá hạn"
              value={work ? overdue : "…"}
              valueClass={overdue ? "text-vehicsim-danger" : undefined}
              tone={overdue ? "danger" : "neutral"}
              note="cần xử lý"
            />
            <StatCard label="Chờ kiểm tra" value={work ? inReview : "…"} tone={inReview ? "warn" : "neutral"} note="Manager xác nhận" />
            <StatCard
              label="Báo cáo chờ duyệt"
              value={work ? pendingReports : "…"}
              valueClass={pendingReports ? "text-vehicsim-warn" : undefined}
              tone={pendingReports ? "warn" : "neutral"}
              note="đã nộp"
            />
          </div>

          {formOpen && work && (
            <Card className="flex flex-col gap-4 p-5">
              <CardTitle>Nộp báo cáo công việc</CardTitle>
              <form onSubmit={submitReport} className="grid grid-cols-2 gap-4">
                <Field label="Project *">
                  <select
                    className={inputCls}
                    value={draft.projectId}
                    onChange={(e) => setDraft({ ...draft, projectId: e.target.value ? Number(e.target.value) : "", taskId: "" })}
                  >
                    <option value="">Chọn project…</option>
                    {work.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.workspace.name} · {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Gắn với task (không bắt buộc)">
                  <select
                    className={inputCls}
                    value={draft.taskId}
                    disabled={draft.projectId === "" || projectTasks.length === 0}
                    onChange={(e) => setDraft({ ...draft, taskId: e.target.value ? Number(e.target.value) : "" })}
                  >
                    <option value="">{draft.projectId !== "" && projectTasks.length === 0 ? "Không có task của bạn ở project này" : "Không gắn task"}</option>
                    {projectTasks.map((t) => (
                      <option key={t.task.id} value={t.task.id}>
                        {t.task.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tiêu đề *" className="col-span-2">
                  <input
                    className={inputCls}
                    value={draft.title}
                    maxLength={255}
                    placeholder="Ví dụ: Kết quả kiểm tra regression RT-007"
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </Field>
                <Field label="Nội dung *" className="col-span-2">
                  <textarea
                    className={cx(inputCls, "min-h-[120px]")}
                    value={draft.content}
                    maxLength={10000}
                    placeholder="Đã làm gì, kết quả, vấn đề còn lại"
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  />
                </Field>
                <Field label="Đường dẫn đính kèm (http/https, không bắt buộc)" className="col-span-2">
                  <input
                    className={inputCls}
                    value={draft.attachment}
                    maxLength={1024}
                    placeholder="https://…"
                    onChange={(e) => setDraft({ ...draft, attachment: e.target.value })}
                  />
                </Field>
                <div className="col-span-2 flex items-center justify-end gap-3">
                  {formError && <span className="mr-auto text-[13px] text-vehicsim-danger">{formError}</span>}
                  <PillButton type="button" onClick={() => setFormOpen(false)}>
                    Huỷ
                  </PillButton>
                  <PillButton
                    variant="dark"
                    type="submit"
                    disabled={submitting || draft.projectId === "" || !draft.title.trim() || !draft.content.trim()}
                  >
                    {submitting ? "Đang nộp…" : "Nộp báo cáo"}
                  </PillButton>
                </div>
              </form>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <CardTitle>{work ? `${tasks.length} task được giao` : "Task được giao"}</CardTitle>
            </div>
            <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
              <span className="min-w-0 flex-1">Task</span>
              <span className="w-[100px]">Ưu tiên</span>
              <span className="w-[100px]">Hạn</span>
              <span className="w-[160px]">Trạng thái</span>
              <span className="w-[130px]">Tiến độ</span>
              <span className="w-[170px] text-right pr-2">Thao tác</span>
            </div>
            {work && tasks.length === 0 && (
              <EmptyState title={work.projects.length ? "Chưa có task nào được giao cho bạn" : "Bạn chưa là thành viên workspace nào"}>
                {work.projects.length
                  ? "Quản lý workspace giao task trên bảng Task của workspace; task mới sẽ hiện ở đây và trong thông báo."
                  : "Quản lý workspace thêm bạn vào workspace và cấp vai trò; sau đó task và project của workspace hiện ở đây."}
              </EmptyState>
            )}
            {shownTasks.map((t) => {
              const d = draftOf(t);
              const done = t.task.status === "DONE";
              const editable = !done && t.workspace.status === "ACTIVE" && (!t.task.project || work?.projects.some((p) => p.id === t.task.project?.id));
              const changed = editable && (d.status !== t.task.status || d.progress !== t.task.progress_pct);
              return (
                <div key={t.task.id} className="flex min-h-[64px] items-center border-b border-solid border-vehicsim-line px-5 py-2 last:border-b-0">
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3">
                    <span className={cx("truncate text-[13px] font-bold", done ? "text-vehicsim-faint line-through" : "text-vehicsim-ink")}>
                      {t.task.title}
                    </span>
                    <span className="truncate text-[12px] text-vehicsim-faint">
                      {t.workspace.name}
                      {t.task.project ? ` · ${t.task.project.name}` : " · chưa gắn project"}
                      {t.task.description ? ` · ${t.task.description}` : ""}
                    </span>
                  </span>
                  <span className="w-[100px]">
                    <Tag tone={PRIORITY[t.task.priority].tone}>{PRIORITY[t.task.priority].label}</Tag>
                  </span>
                  <span className={cx("w-[100px] text-[13px]", t.task.overdue ? "font-semibold text-vehicsim-danger" : "text-vehicsim-muted")}>
                    {dateLabel(t.task.due_date)}
                  </span>
                  <span className="w-[160px] pr-3">
                    {editable ? (
                      <select
                        aria-label={`Trạng thái của ${t.task.title}`}
                        className={inputCls}
                        value={d.status}
                        onChange={(e) => setTaskDraft(t, { status: e.target.value as MemberTaskStatus })}
                      >
                        {MEMBER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Tag tone={STATUS[t.task.status].tone}>{STATUS[t.task.status].label}</Tag>
                    )}
                  </span>
                  <span className="flex w-[130px] items-center gap-2 pr-3">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        aria-label={`Tiến độ của ${t.task.title}`}
                        className={cx(inputCls, "w-[72px]")}
                        value={d.progress}
                        onChange={(e) => setTaskDraft(t, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                    ) : (
                      <span className="text-[13px] font-semibold text-vehicsim-ink">{t.task.progress_pct}</span>
                    )}
                    <span className="text-[12px] text-vehicsim-faint">%</span>
                  </span>
                  <span className="flex w-[170px] justify-end gap-2">
                    {changed && (
                      <PillButton variant="dark" className="px-4 py-2 text-[12px]" disabled={savingTask !== null} onClick={() => saveTask(t)}>
                        {savingTask === t.task.id ? "Đang lưu…" : "Lưu"}
                      </PillButton>
                    )}
                    <PillButton
                      className="px-4 py-2 text-[12px]"
                      disabled={!work?.projects.some((p) => p.id === t.task.project?.id)}
                      title={!t.task.project ? "Task chưa gắn project; nộp báo cáo theo project ở nút Nộp báo cáo" : undefined}
                      onClick={() => openReportFor(t)}
                    >
                      Báo cáo
                    </PillButton>
                  </span>
                </div>
              );
            })}
            {taskTotal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-solid border-vehicsim-line">
                <span className="text-[12px] text-vehicsim-muted">
                  Hiển thị {taskOffset + 1}–{Math.min(taskOffset + taskPageSize, taskTotal)} trên {taskTotal} nhiệm vụ
                </span>
                {taskPages > 1 && <Pagination page={currentTaskPage} pages={taskPages} onPage={setTaskPage} />}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <CardTitle>{work ? `${work.reports.length} báo cáo đã nộp` : "Báo cáo đã nộp"}</CardTitle>
            </div>
            {work && work.reports.length === 0 && <EmptyState title="Bạn chưa nộp báo cáo nào" />}
            {(work?.reports ?? []).map((r) => {
              const link = safeUrl(r.attachment_url);
              return (
                <div key={r.id} className="flex flex-col gap-1 border-t border-solid border-vehicsim-line px-5 py-3">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-vehicsim-ink">{r.title}</span>
                    <Tag tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Tag>
                    <span className="w-[90px] text-right text-[12px] text-vehicsim-faint">{fmt.date(r.created_date)}</span>
                  </span>
                  <span className="text-[12px] text-vehicsim-faint">
                    Project {r.project.name}
                    {r.task ? ` · task ${r.task.title}` : ""}
                    {link && (
                      <>
                        {" · "}
                        <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-vehicsim-decision underline">
                          đính kèm
                        </a>
                      </>
                    )}
                  </span>
                  {r.status !== "SUBMITTED" && (
                    <span className="text-[12px] text-vehicsim-muted">
                      {r.reviewed_by ? `${r.reviewed_by.full_name}` : "Manager"}
                      {r.reviewed_at ? ` · ${fmt.date(r.reviewed_at)}` : ""}
                      {r.review_note ? ` · “${r.review_note}”` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </VehicSimPage>
  );
}
