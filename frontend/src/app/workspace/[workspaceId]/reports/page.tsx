"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Modal } from "@/components/project/ProjectUi";
import { EmptyState, ErrorNote, FilterSelect, PillButton, StatCard, Tag, cx, fmt } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES, WORKSPACE_MANAGER_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { ReportStatus, WorkspaceDetail, WorkspaceReport, WorkspaceTask } from "@/types/vehicsim";

const STATUS: Record<ReportStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  SUBMITTED: { label: "Chờ duyệt", tone: "warn" },
  APPROVED: { label: "Đã duyệt", tone: "ok" },
  REJECTED: { label: "Từ chối", tone: "danger" },
};
const STATUSES = Object.keys(STATUS) as ReportStatus[];

/** Chỉ hiện đường dẫn đính kèm dạng http(s); giá trị khác (vd. javascript:) hiện như chữ thường, không bấm được. */
function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** M8 — xem báo cáo công việc theo project; M9 — duyệt / từ chối có nhận xét. */
export default function WorkspaceReportsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const id = Number(workspaceId);
  const { user } = useAuth();
  const allowed = WORKSPACE_ROLES.includes(user?.roleCode ?? "");
  const isManagerOrAdmin = WORKSPACE_MANAGER_ROLES.includes(user?.roleCode ?? "");

  const [onlyMine, setOnlyMine] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [repTitle, setRepTitle] = useState("");
  const [repContent, setRepContent] = useState("");
  const [repTaskId, setRepTaskId] = useState<number | null>(null);
  const [repProjectId, setRepProjectId] = useState<number | null>(null);
  const [repAttachment, setRepAttachment] = useState("");
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [submittingLoading, setSubmittingLoading] = useState(false);

  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [reports, setReports] = useState<WorkspaceReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [status, setStatus] = useState<ReportStatus | "">("SUBMITTED");
  const [project, setProject] = useState<string>("");
  const [open, setOpen] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const [rList, tList] = await Promise.all([
        vehicsimApi.workspaceReports(id),
        vehicsimApi.workspaceTasks(id).catch(() => [] as WorkspaceTask[]),
      ]);
      setReports(rList);
      setTasks(tList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được báo cáo");
    }
  }, [id]);

  useEffect(() => {
    if (!allowed) return;
    vehicsimApi.workspace(id)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được workspace"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải báo cáo khi mở trang
    void load();
  }, [allowed, id, load]);

  const ws = detail?.workspace;
  const active = ws?.status === "ACTIVE";
  const visible = useMemo(
    () => (reports ?? []).filter((r) => (!status || r.status === status) && (!project || String(r.project.id) === project)),
    [reports, status, project],
  );
  const count = (s: ReportStatus) => (reports ?? []).filter((r) => r.status === s).length;

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repTitle.trim() || !repContent.trim() || !repProjectId || submittingLoading) return;
    setSubmittingLoading(true);
    setError(null);
    try {
      await vehicsimApi.submitMyReport({
        project_id: repProjectId,
        task_id: repTaskId,
        title: repTitle.trim(),
        content: repContent.trim(),
        attachment_url: repAttachment.trim() || null,
      });
      setNotice(`Đã nộp báo cáo “${repTitle.trim()}” thành công.`);
      setSubmitting(false);
      setRepTitle("");
      setRepContent("");
      setRepTaskId(null);
      setRepProjectId(null);
      setRepAttachment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không nộp được báo cáo");
    } finally {
      setSubmittingLoading(false);
    }
  };

  const decide = async (r: WorkspaceReport, decision: "APPROVED" | "REJECTED") => {
    const note = (notes[r.id] ?? "").trim();
    if (decision === "REJECTED" && !note) {
      setError("Từ chối báo cáo phải ghi nhận xét để người nộp biết cần sửa gì.");
      setOpen(r.id);
      return;
    }
    const verb = decision === "APPROVED" ? "Duyệt" : "Từ chối";
    if (!window.confirm(`${verb} báo cáo “${r.title}” của ${r.submitted_by.full_name}? Quyết định không sửa lại được.`)) return;
    setBusy(r.id);
    setError(null);
    setNotice(null);
    try {
      await vehicsimApi.decideWorkspaceReport(id, r.id, decision, note || null);
      setNotice(`Đã ${decision === "APPROVED" ? "duyệt" : "từ chối"} báo cáo “${r.title}”.`);
      setNotes((n) => ({ ...n, [r.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được quyết định");
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <VehicSimPage
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        { label: ws?.name ?? "…", href: `/workspace/${id}` },
        { label: "Báo cáo" },
      ]}
      title="Báo cáo công việc"
      badges={ws && !active && <Tag tone="neutral">Workspace đã lưu trữ — chỉ xem</Tag>}
      subtitle={
        allowed
          ? isManagerOrAdmin
            ? "Báo cáo thành viên gửi theo từng project. Duyệt hoặc từ chối kèm nhận xét; quyết định là cuối."
            : "Danh sách báo cáo công việc và kết quả duyệt của Quản lý. Bấm “+ Nộp báo cáo” để gửi báo cáo mới."
          : undefined
      }
      actions={
        allowed && active ? (
          <PillButton variant="dark" onClick={() => setSubmitting(true)}>
            + Nộp báo cáo
          </PillButton>
        ) : undefined
      }
    >
      {!allowed ? (
        <EmptyState title="Chỉ Quản lý workspace được vào màn này. Quản trị viên sử dụng mục Quản trị → Workspace." />
      ) : (
        <>
          <ErrorNote message={error} />
          {notice && (
            <div role="status" className="rounded-[16px] border border-solid border-vehicsim-ok/30 bg-vehicsim-ok-bg px-4 py-3 text-[13px] text-vehicsim-ok">
              {notice}
            </div>
          )}
          <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-3">
            <StatCard
              label="Chờ duyệt"
              value={reports ? count("SUBMITTED") : "…"}
              tone="warn"
              valueClass={count("SUBMITTED") ? "text-vehicsim-warn" : undefined}
              note="cần quyết định"
            />
            <StatCard label="Đã duyệt" value={reports ? count("APPROVED") : "…"} tone="ok" />
            <StatCard label="Từ chối" value={reports ? count("REJECTED") : "…"} tone="danger" />
          </div>

          <section className="overflow-hidden rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface">
            <div className="flex items-center gap-2 border-b border-solid border-vehicsim-line px-5 py-4">
              <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{reports ? `${visible.length} báo cáo` : "…"}</span>
              <FilterSelect<ReportStatus>
                label="Trạng thái"
                value={status}
                options={STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))}
                onChange={setStatus}
              />
              <FilterSelect<string>
                label="Project"
                value={project}
                options={(detail?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
                onChange={setProject}
              />
              <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                className={cx(
                  "rounded-full px-3 py-[5px] text-[12px] font-semibold border border-solid transition-colors",
                  onlyMine
                    ? "bg-vehicsim-primary text-white border-vehicsim-primary"
                    : "bg-vehicsim-surface text-vehicsim-ink border-vehicsim-line hover:bg-vehicsim-soft"
                )}
              >
                {onlyMine ? "✓ Báo cáo của tôi" : "Báo cáo của tôi"}
              </button>
            </div>
            {reports && visible.length === 0 && (
              <EmptyState title={reports.length ? "Không có báo cáo nào khớp bộ lọc" : "Chưa có báo cáo"}>
                {!reports.length ? "Báo cáo xuất hiện khi thành viên gửi báo cáo cho project trong workspace." : undefined}
              </EmptyState>
            )}
            {visible.map((r) => {
              const expanded = open === r.id;
              const link = safeUrl(r.attachment_url);
              const pending = r.status === "SUBMITTED";
              return (
                <article key={r.id} className={cx("border-b border-solid border-vehicsim-line px-5 py-4 last:border-b-0", expanded && "bg-vehicsim-row")}>
                  <button type="button" onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-start gap-4 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <span className="flex items-center gap-2 text-[14px] font-bold text-vehicsim-ink">
                        {r.title}
                        <Tag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Tag>
                      </span>
                      <span className="truncate text-[12px] text-vehicsim-faint">
                        {r.submitted_by.full_name} · {r.project.name}
                        {r.task ? ` · task: ${r.task.title}` : ""} · gửi {fmt.date(r.created_date)}
                      </span>
                    </span>
                    <span className="pt-1 text-[12px] font-semibold text-vehicsim-decision">{expanded ? "Thu gọn ▴" : "Xem ▾"}</span>
                  </button>

                  {expanded && (
                    <div className="mt-3 flex flex-col gap-3">
                      <p className="whitespace-pre-wrap rounded-[14px] border border-solid border-vehicsim-line bg-vehicsim-surface p-4 text-[13px] leading-[1.6] text-vehicsim-ink">
                        {r.content}
                      </p>
                      {r.attachment_url && (
                        <p className="text-[12px] text-vehicsim-muted">
                          Đính kèm:{" "}
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-vehicsim-decision underline">
                              {link}
                            </a>
                          ) : (
                            <span className="break-all">{r.attachment_url} (không phải http/https, không mở)</span>
                          )}
                        </p>
                      )}
                      {!pending && (
                        <p className="text-[12px] text-vehicsim-muted">
                          {STATUS[r.status].label} bởi {r.reviewed_by?.full_name ?? "—"} ngày {fmt.date(r.reviewed_at)}
                          {r.review_note ? ` — “${r.review_note}”` : ""}
                        </p>
                      )}
                      {pending && active && (
                        isManagerOrAdmin ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={notes[r.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                              maxLength={4000}
                              rows={2}
                              aria-label={`Nhận xét cho báo cáo ${r.title}`}
                              placeholder="Nhận xét (bắt buộc khi từ chối)"
                              className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                            />
                            <div className="flex items-center gap-2">
                              <PillButton variant="dark" disabled={busy !== null} onClick={() => decide(r, "APPROVED")}>
                                {busy === r.id ? "Đang lưu…" : "Duyệt"}
                              </PillButton>
                              <PillButton disabled={busy !== null} onClick={() => decide(r, "REJECTED")} className="text-vehicsim-danger">
                                Từ chối
                              </PillButton>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-vehicsim-faint">Đang chờ Quản lý workspace xem xét và duyệt.</p>
                        )
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <p className="text-[12px] text-vehicsim-faint">Kỹ sư và Người duyệt có thể gửi báo cáo công việc gắn với task / project tại màn này.</p>

          {submitting && (
            <Modal title="Nộp báo cáo công việc" onClose={() => setSubmitting(false)} busy={submittingLoading}>
                <form onSubmit={handleSubmitReport} className="flex flex-col gap-4">
                  
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-vehicsim-muted">Tiêu đề báo cáo *</span>
                    <input
                      value={repTitle}
                      onChange={(e) => setRepTitle(e.target.value)}
                      maxLength={255}
                      required
                      placeholder="VD: Kết quả chạy baseline và phân tích va chạm họ PX2"
                      className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-vehicsim-muted">Task liên quan (tuỳ chọn)</span>
                      <select
                        value={repTaskId ?? ""}
                        onChange={(e) => {
                          const tid = e.target.value ? Number(e.target.value) : null;
                          setRepTaskId(tid);
                          if (tid) {
                            const matched = tasks.find((t) => t.id === tid);
                            if (matched?.project?.id) setRepProjectId(matched.project.id);
                          }
                        }}
                        className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                      >
                        <option value="">— Không gắn task —</option>
                        {tasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            #{t.id}: {t.title}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[12px] font-semibold text-vehicsim-muted">Project *</span>
                      <select
                        value={repProjectId ?? ""}
                        onChange={(e) => setRepProjectId(e.target.value ? Number(e.target.value) : null)}
                        required
                        className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                      >
                        <option value="" disabled>— Chọn project —</option>
                        {(detail?.projects ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-vehicsim-muted">Nội dung báo cáo *</span>
                    <textarea
                      value={repContent}
                      onChange={(e) => setRepContent(e.target.value)}
                      maxLength={50000}
                      required
                      rows={5}
                      placeholder="Mô tả công việc đã hoàn thành, bằng chứng số liệu, nguyên nhân thất bại..."
                      className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-semibold text-vehicsim-muted">Đường dẫn đính kèm / Artifact URL (tuỳ chọn)</span>
                    <input
                      value={repAttachment}
                      onChange={(e) => setRepAttachment(e.target.value)}
                      maxLength={1024}
                      placeholder="https://..."
                      className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-vehicsim-surface px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
                    />
                  </label>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-solid border-vehicsim-line">
                    <PillButton type="button" variant="light" onClick={() => setSubmitting(false)} disabled={submittingLoading}>
                      Huỷ
                    </PillButton>
                    <PillButton type="submit" variant="dark" disabled={submittingLoading || !repTitle.trim() || !repContent.trim() || !repProjectId}>
                      {submittingLoading ? "Đang gửi…" : "Nộp báo cáo"}
                    </PillButton>
                  </div>
                </form>
            </Modal>
          )}
        </>
      )}
    </VehicSimPage>
  );
}
