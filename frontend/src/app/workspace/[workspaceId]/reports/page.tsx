"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { EmptyState, ErrorNote, FilterSelect, PillButton, StatCard, Tag, cx, fmt } from "@/components/VehicSimUi";
import { WORKSPACE_ROLES } from "@/components/workspaceAccess";
import { useAuth } from "@/context/AuthContext";
import { vehicsimApi } from "@/services/vehicsim";
import type { ReportStatus, WorkspaceDetail, WorkspaceReport } from "@/types/vehicsim";

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
      setReports(await vehicsimApi.workspaceReports(id));
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
          ? "Báo cáo thành viên gửi theo từng project. Duyệt hoặc từ chối kèm nhận xét; quyết định là cuối."
          : undefined
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

          <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
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
                      <p className="whitespace-pre-wrap rounded-[14px] border border-solid border-vehicsim-line bg-white p-4 text-[13px] leading-[1.6] text-vehicsim-ink">
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
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            maxLength={4000}
                            rows={2}
                            aria-label={`Nhận xét cho báo cáo ${r.title}`}
                            placeholder="Nhận xét (bắt buộc khi từ chối)"
                            className="w-full rounded-[12px] border border-solid border-vehicsim-line bg-white px-3 py-2 text-[13px] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
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
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
          <p className="text-[12px] text-vehicsim-faint">Thành viên chưa có màn tự gửi báo cáo; phần nộp báo cáo thuộc màn của Kỹ sư / Người duyệt.</p>
        </>
      )}
    </VehicSimPage>
  );
}
