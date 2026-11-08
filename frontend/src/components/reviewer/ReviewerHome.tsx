"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { NextActionCard } from "@/components/project/ProjectHome";
import { Card, CardTitle, EmptyState, ErrorNote, PillButton, RecommendationBadge, StatCard, Tag, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { DecisionHistory, MyWork, RecommendationItem, RegressionList, TaskStatus } from "@/types/vehicsim";

const QUEUE_ROWS = 5;
const RECENT_DECISIONS = 4;
const MY_TASKS = 3;
const TASK_STATUS: Record<TaskStatus, { label: string; tone: "neutral" | "info" | "warn" | "ok" }> = {
  TODO: { label: "Cần làm", tone: "neutral" },
  IN_PROGRESS: { label: "Đang làm", tone: "info" },
  REVIEW: { label: "Chờ kiểm tra", tone: "warn" },
  DONE: { label: "Hoàn thành", tone: "ok" },
};
const WINDOW_DAYS = 30;

/** Các luật mà backend thật sự kiểm khi Reviewer quyết định (`ReviewDecisionService`). */
const REVIEW_RULES = [
  "Test không đạt thì không thể chấp nhận",
  "Mọi quyết định cần lý do và xác nhận",
  "Không duyệt khuyến nghị do chính mình tạo",
  "Bản cơ sở đã đổi thì không chấp nhận test cũ",
];

/** Thời điểm backend trả về là UTC không kèm "Z" (giống `fmt.date`). */
function parseUtc(iso: string): number {
  return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime();
}

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.round((now - parseUtc(iso)) / 60000));
  if (minutes < 60) return minutes <= 1 ? "vừa xong" : `${minutes} phút`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/**
 * UC-62 / UC-63 — Trang chủ REVIEWER: hàng đợi khuyến nghị, số quyết định 30 ngày,
 * so sánh từng cặp run của khuyến nghị đầu hàng và các quyết định gần đây. Chỉ đọc API có sẵn; quyết định vẫn làm ở màn duyệt.
 */
export function ReviewerHome() {
  const { user } = useAuth();
  const { canDecide, canRunRegression } = useVehicSimContext();
  const [recs, setRecs] = useState<RecommendationItem[] | null>(null);
  const [regressions, setRegressions] = useState<RegressionList | null>(null);
  const [history, setHistory] = useState<DecisionHistory | null>(null);
  const [work, setWork] = useState<MyWork | null>(null);
  const [workError, setWorkError] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mốc thời gian chốt một lần khi mở trang để "chờ bao lâu" và cửa sổ 30 ngày không đổi giữa các lần render.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    vehicsimApi.recommendations()
      .then(setRecs)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được danh sách khuyến nghị"));
    // Người tạo và lịch sử chỉ để tham khảo: lỗi tải không chặn hàng đợi duyệt.
    vehicsimApi.regressions().then(setRegressions).catch(() => setRegressions(null));
    vehicsimApi.decisionHistory().then(setHistory).catch(() => setHistoryError(true));
    vehicsimApi.myWork().then(setWork).catch(() => setWorkError(true));
  }, []);

  const queue = useMemo(
    () =>
      (recs ?? [])
        .filter((r) => r.status === "PENDING" || r.status === "BLOCKED")
        // Chờ lâu nhất lên đầu; khuyến nghị bị chặn xếp sau vì không có gì để chấp nhận.
        .sort((a, b) => Number(a.status === "BLOCKED") - Number(b.status === "BLOCKED") || parseUtc(a.created_at) - parseUtc(b.created_at)),
    [recs],
  );
  const pending = queue.filter((r) => r.status === "PENDING");
  const next = pending[0] ?? null;
  const focus = next ?? queue[0] ?? null;
  const creators = new Map((regressions?.items ?? []).map((t) => [t.id, t.created_by]));

  const since = now - WINDOW_DAYS * 24 * 3600 * 1000;
  const recent = (history?.decisions ?? []).filter((d) => d.reviewed_at && parseUtc(d.reviewed_at) >= since);
  const accepted = recent.filter((d) => d.decision === "ACCEPT").length;
  const rejected = recent.filter((d) => d.decision === "REJECT").length;
  const blocked = (recs ?? []).filter((r) => r.status === "BLOCKED").length;
  const openTasks = (work?.tasks ?? []).filter((t) => t.task.status !== "DONE");
  const firstName = (user?.full_name || user?.name || "").trim().split(/\s+/).pop();

  return (
    <VehicSimPage
      crumbs={[{ label: "Tổng quan" }]}
      title={firstName ? `Chào ${firstName}` : "Tổng quan"}
      badges={<Tag tone="info">Người duyệt</Tag>}
      subtitle="Đọc kết quả, chạy kiểm thử hồi quy để kiểm tra và chấp nhận hoặc từ chối khuyến nghị. Mỗi quyết định cần lý do và xác nhận."
      actions={
        <>
          <PillButton href={canRunRegression ? "/validation/regression/new" : undefined} disabled={!canRunRegression}>Chạy kiểm thử hồi quy</PillButton>
          <PillButton href="/my-work?report=new">Nộp báo cáo</PillButton>
        </>
      }
    >
      <ErrorNote message={error ?? (historyError ? "Không tải được lịch sử quyết định; số liệu chấp nhận và từ chối chưa có." : null)} />

      {recs && (
        <NextActionCard
          eyebrow={canDecide ? "Gợi ý tiếp theo · kiểm chứng" : "Kiểm chứng · chỉ xem"}
          title={focus ? `Khuyến nghị ${focus.code}` : "Theo dõi kết quả kiểm chứng"}
          detail={focus ? `${focus.baseline} → ${focus.candidate} · ${focus.regression_code}` : "Hàng đợi đang trống. Mở danh sách để xem các khuyến nghị của project."}
          action={next && canDecide
            ? { label: "Duyệt khuyến nghị tiếp theo", href: `/validation/recommendations/${next.id}/review` }
            : focus
              ? { label: "Xem khuyến nghị", href: `/validation/recommendations/${focus.id}` }
              : { label: "Tất cả khuyến nghị", href: "/validation/recommendations" }}
        />
      )}

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chờ duyệt"
          value={recs ? pending.length : error ? "—" : "…"}
          valueClass={pending.length ? "text-vehicsim-warn" : undefined}
          tone={pending.length ? "warn" : "neutral"}
          note={error ? "không tải được" : "khuyến nghị"}
        />
        <StatCard
          label={`Đã chấp nhận (${WINDOW_DAYS} ngày)`}
          value={history ? accepted : historyError ? "—" : "…"}
          valueClass={accepted ? "text-vehicsim-ok" : undefined}
          tone={accepted ? "ok" : "neutral"}
          note={historyError ? "không tải được" : "khuyến nghị"}
        />
        <StatCard label={`Đã từ chối (${WINDOW_DAYS} ngày)`} value={history ? rejected : historyError ? "—" : "…"} note={historyError ? "không tải được" : "khuyến nghị"} />
        <StatCard
          label="Hồi quy không đạt"
          value={recs ? blocked : error ? "—" : "…"}
          valueClass={blocked ? "text-vehicsim-danger" : undefined}
          tone={blocked ? "danger" : "neutral"}
          note={error ? "không tải được" : "không thể chấp nhận"}
        />
      </div>

      <div className="flex w-full flex-col items-start gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <CardTitle
                aside={
                  <Link href="/validation/recommendations" className="text-[12px] font-semibold text-vehicsim-decision">
                    Tất cả khuyến nghị
                  </Link>
                }
              >
                Hàng đợi duyệt
              </CardTitle>
            </div>
            {recs && queue.length === 0 && (
              <EmptyState title="Không có khuyến nghị nào chờ duyệt">
                Khuyến nghị xuất hiện ở đây khi một{" "}
                <Link href="/validation/regression" className="font-semibold underline">
                  kiểm thử hồi quy
                </Link>{" "}
                chạy xong.
              </EmptyState>
            )}
            <ul className="divide-y divide-vehicsim-line">
              {queue.slice(0, QUEUE_ROWS).map((r) => {
                const isBlocked = r.status === "BLOCKED";
                const href = isBlocked || !canDecide ? `/validation/recommendations/${r.id}` : `/validation/recommendations/${r.id}/review`;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex min-w-0 flex-1 basis-[190px] flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold text-vehicsim-ink">{r.code}</span>
                        <Tag tone={isBlocked ? "danger" : "ok"}>{isBlocked ? "Hồi quy không đạt" : "Hồi quy đạt"}</Tag>
                      </span>
                      <span className="break-words text-[13px] font-semibold text-vehicsim-ink">{r.baseline} → {r.candidate}</span>
                      <span className="text-[12px] text-vehicsim-muted">
                        {r.regression_code} · {creators.get(r.id) ?? "Chưa rõ người tạo"} · {ago(r.created_at, now)}
                      </span>
                    </div>
                    <PillButton href={href} className="px-4 py-2 text-[12px]">
                      {isBlocked || !canDecide ? "Xem" : "Duyệt"}
                    </PillButton>
                  </li>
                );
              })}
            </ul>
            {queue.length > QUEUE_ROWS && (
              <p className="px-5 py-3 text-[12px] text-vehicsim-faint">và {queue.length - QUEUE_ROWS} khuyến nghị khác trong danh sách đầy đủ.</p>
            )}
          </Card>

          {focus && <PairComparison rec={focus} />}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[300px] 2xl:w-[360px]">
          <Card className="flex flex-col gap-3 p-5">
            <CardTitle
              aside={
                <Link href="/my-work" className="text-[12px] font-semibold text-vehicsim-decision">
                  Tất cả
                </Link>
              }
            >
              Nhiệm vụ của tôi
            </CardTitle>
            {workError ? (
              <p className="text-[13px] text-vehicsim-muted">Không tải được task của bạn.</p>
            ) : !work ? (
              <p className="text-[13px] text-vehicsim-muted">…</p>
            ) : openTasks.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Không có task nào đang mở.</p>
            ) : (
              openTasks.slice(0, MY_TASKS).map((t) => (
                <Link
                  key={t.task.id}
                  href="/my-work"
                  className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[13px] font-bold text-vehicsim-ink">{t.task.title}</span>
                    <span className={cx("text-[12px]", t.task.overdue ? "font-semibold text-vehicsim-danger" : "text-vehicsim-faint")}>
                      {t.task.due_date ? `hạn ${t.task.due_date.split("-").reverse().join("/")}` : "không có hạn"}
                      {t.task.overdue ? " · quá hạn" : ""}
                    </span>
                  </span>
                  <Tag tone={TASK_STATUS[t.task.status].tone}>{TASK_STATUS[t.task.status].label}</Tag>
                </Link>
              ))
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <CardTitle>Quy tắc duyệt</CardTitle>
            <ul className="flex flex-col gap-2">
              {REVIEW_RULES.map((rule) => (
                <li key={rule} className="flex items-start gap-2 text-[13px] text-vehicsim-ink">
                  <span className="mt-[6px] size-[7px] shrink-0 rounded-full bg-vehicsim-ok" />
                  {rule}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <CardTitle
              aside={
                <Link href="/validation/decisions" className="text-[12px] font-semibold text-vehicsim-decision">
                  Tất cả
                </Link>
              }
            >
              Quyết định gần đây
            </CardTitle>
            {!history ? (
              <p className="text-[13px] text-vehicsim-muted">{historyError ? "Không tải được lịch sử quyết định." : "…"}</p>
            ) : history.decisions.length === 0 ? (
              <p className="text-[13px] text-vehicsim-muted">Chưa có quyết định nào của Người duyệt.</p>
            ) : (
              history.decisions.slice(0, RECENT_DECISIONS).map((d) => (
                <Link
                  key={d.id}
                  href={`/validation/recommendations/${d.test_id}`}
                  className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-3 last:border-b-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="text-[13px] font-bold text-vehicsim-ink">{d.recommendation_code}</span>
                    <span className="truncate text-[12px] text-vehicsim-faint">
                      {d.baseline} → {d.candidate}
                      {d.reviewed_by ? ` · ${d.reviewed_by}` : ""}
                    </span>
                  </span>
                  <RecommendationBadge status={d.decision} />
                  <span className="shrink-0 whitespace-nowrap text-right text-[12px] text-vehicsim-faint">{d.reviewed_at ? `${ago(d.reviewed_at, now)} trước` : "—"}</span>
                </Link>
              ))
            )}
          </Card>
        </div>
      </div>

      <p className="text-[12px] leading-[1.6] text-vehicsim-faint">
        Người duyệt ra quyết định dựa trên kết quả mô phỏng.
      </p>
    </VehicSimPage>
  );
}

/** Đếm cặp run (cùng biến thể, cùng seed) theo cách `RegressionSummarizer` phân loại: tốt lên, xấu đi, không đổi, va chạm mới. */
function PairComparison({ rec }: { rec: RecommendationItem }) {
  const counts = "fixed" in rec.counts ? rec.counts : null;
  const cells = counts
    ? [
        { label: "Tốt lên", value: counts.fixed, cls: counts.fixed ? "text-vehicsim-ok" : "text-vehicsim-ink" },
        { label: "Xấu đi", value: counts.regressed, cls: counts.regressed ? "text-vehicsim-danger" : "text-vehicsim-ink" },
        { label: "Không đổi", value: counts.unchanged, cls: "text-vehicsim-ink" },
        { label: "Va chạm mới", value: counts.new_collisions, cls: counts.new_collisions ? "text-vehicsim-danger" : "text-vehicsim-ink" },
      ]
    : [];
  return (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle aside={<Tag>Chỉ xem hồi quy</Tag>}>So sánh từng cặp run — {rec.code}</CardTitle>
      {counts ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cells.map((c) => (
              <div key={c.label} className="flex flex-col gap-1 rounded-[14px] bg-vehicsim-soft px-4 py-3">
                <span className="text-[12px] font-medium text-vehicsim-muted">{c.label}</span>
                <span className={cx("text-[28px] font-extrabold tracking-[-0.5px]", c.cls)}>{c.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] leading-[1.6] text-vehicsim-faint">
            {counts.scenarios} cặp run cùng biến thể và cùng seed. Sửa được ca A mà làm hỏng ca B thì không tự chấp nhận: đọc từng cặp ở{" "}
            <Link href={`/validation/regression/${rec.id}`} className="font-semibold underline">
              {rec.regression_code}
            </Link>{" "}
            trước khi quyết định.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-vehicsim-muted">Kiểm thử hồi quy chưa có số đếm từng cặp.</p>
      )}
    </Card>
  );
}
