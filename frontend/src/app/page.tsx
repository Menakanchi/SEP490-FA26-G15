"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { MVP_STEPS, type FlowStep } from "@/components/vehicsimFlow";
import { ErrorNote, PillButton, StatCard, Tag, cx } from "@/components/VehicSimUi";
import { ProjectAssistant } from "@/components/ProjectAssistant";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem, RecommendationItem, RegressionList } from "@/types/vehicsim";

type State = "done" | "current" | "todo";
interface StepView {
  step: FlowStep;
  done: boolean;
  status: string;
  actions: { label: string; href: string; primary?: boolean }[];
}

/**
 * Dashboard = vòng MVP 6 bước. Trạng thái mỗi bước lấy từ dữ liệu thật; bước
 * chưa xong đầu tiên là "bước tiếp theo" và được tô nổi.
 */
export default function MvpLoopPage() {
  const { user } = useAuth();
  const { ctx } = useVehicSimContext();
  const [families, setFamilies] = useState<FamilyItem[] | null>(null);
  const [regressions, setRegressions] = useState<RegressionList | null>(null);
  const [recs, setRecs] = useState<RecommendationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([vehicsimApi.families(), vehicsimApi.regressions(), vehicsimApi.recommendations()])
      .then(([f, r, rc]) => {
        setFamilies(f);
        setRegressions(r);
        setRecs(rc);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được trạng thái vòng MVP"));
  }, []);

  const loaded = families && regressions && recs && ctx;
  const views = loaded ? buildSteps(families, regressions, recs, ctx.versions.filter((v) => v.parent_version_id !== null).length, ctx.system.baseline?.label) : null;
  const currentIdx = views ? views.findIndex((v) => !v.done) : -1;
  const next = views && currentIdx >= 0 ? views[currentIdx] : null;
  const firstName = (user?.full_name || user?.name || "").trim().split(/\s+/).pop();

  const variants = (families ?? []).reduce((n, f) => n + f.variants, 0);
  const failing = (families ?? []).reduce((n, f) => n + f.failures, 0);
  const pendingReviews = (recs ?? []).filter((r) => r.status === "PENDING").length;

  return (
    <VehicSimPage
      crumbs={[{ label: "Tổng quan" }]}
      title={firstName ? `Chào ${firstName}` : "Tổng quan"}
      subtitle={
        views
          ? next
            ? `Vòng MVP trên motif người đi bộ băng ngang. Bước tiếp theo: ${next.step.n} · ${next.step.title}.`
            : "Vòng MVP đã khép kín. Tạo một cấu hình AEB khác để bắt đầu vòng mới."
          : "Đang tải trạng thái vòng MVP…"
      }
      actions={
        next ? (
          <PillButton variant="dark" href={next.actions[0].href}>
            Tiếp tục: bước {next.step.n} →
          </PillButton>
        ) : views ? (
          <PillButton variant="dark" href="/aeb">
            Bắt đầu vòng mới →
          </PillButton>
        ) : null
      }
    >
      <ErrorNote message={error} />

      <div className="flex w-full items-stretch gap-4">
        <StatCard label="Biến thể kịch bản" value={families ? variants : "…"} note={`${families?.length ?? 0} họ kịch bản`} />
        <StatCard
          label="Lỗi trên bản cơ sở"
          value={families ? failing : "…"}
          valueClass={failing ? "text-vehicsim-danger" : undefined}
          tone={failing ? "danger" : "neutral"}
          note={ctx?.system.baseline ? `AEB ${ctx.system.baseline.label}` : "chưa có baseline"}
        />
        <StatCard
          label="Kiểm thử hồi quy"
          value={regressions ? regressions.kpis.total : "…"}
          note={regressions ? `${regressions.kpis.passed} đạt · ${regressions.kpis.failed} không đạt` : undefined}
        />
        <StatCard
          label="Chờ kỹ sư duyệt"
          value={recs ? pendingReviews : "…"}
          valueClass={pendingReviews ? "text-vehicsim-warn" : undefined}
          tone={pendingReviews ? "warn" : "neutral"}
          note="khuyến nghị"
        />
      </div>

      <div className="grid w-full grid-cols-3 gap-4">
        {(views ?? MVP_STEPS.map((step) => ({ step, done: false, status: "…", actions: [] }))).map((v, i) => {
          const state: State = v.done ? "done" : i === currentIdx ? "current" : "todo";
          return <StepCard key={v.step.n} view={v} state={state} />;
        })}
      </div>

      <p className="text-[12px] leading-[1.6] text-vehicsim-faint">
        Bộ mô phỏng động học (CARLA chạy được qua file JSON của từng lượt) · mỗi biến thể chạy với seed cố định nên bản cơ sở và ứng viên so được
        từng cặp. Khuyến nghị chỉ dựa trên mô phỏng, luôn cần kỹ sư quyết định.
      </p>

      {/* Chừa chỗ để nội dung cuối trang cuộn lên khỏi nút trợ lý nổi. */}
      <div aria-hidden className="h-16 shrink-0" />
      <ProjectAssistant />
    </VehicSimPage>
  );
}

function buildSteps(
  families: FamilyItem[],
  regressions: RegressionList,
  recs: RecommendationItem[],
  candidateCount: number,
  baselineLabel: string | undefined,
): StepView[] {
  const variants = families.reduce((n, f) => n + f.variants, 0);
  const failing = families.reduce((n, f) => n + f.failures, 0);
  const queued = families.reduce((n, f) => n + (f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0), 0);
  const baselineDone = families.some((f) => f.variants > 0 && (f.runs.COMPLETED ?? 0) >= f.variants);
  const tests = regressions.items.length;
  const decided = regressions.items.filter((t) => t.review_decision !== "PENDING").length;
  const pending = recs.filter((r) => r.status === "PENDING");
  const [s1, s2, s3, s4, s5, s6] = MVP_STEPS;

  return [
    {
      step: s1,
      done: families.length > 0,
      status: families.length ? `${families.length} họ kịch bản đã khai báo` : "Chưa có họ kịch bản nào",
      actions: [
        { label: "Sinh từ mô tả", href: s1.href, primary: true },
        { label: "Nhập tay", href: "/scenarios?new=1" },
      ],
    },
    {
      step: s2,
      done: variants > 0,
      status: variants ? `${variants} biến thể từ lưới tham số` : "Chưa sinh biến thể",
      actions: [{ label: "Xem biến thể", href: s2.href, primary: true }],
    },
    {
      step: s3,
      done: baselineDone,
      status: queued
        ? `Đang chạy ${queued} run…`
        : baselineDone
          ? `Bản cơ sở AEB ${baselineLabel ?? ""} đã chạy xong`
          : "Chưa chạy cơ sở",
      actions: [{ label: "Chạy cơ sở", href: s3.href, primary: true }],
    },
    {
      step: s4,
      // "Đã xem lỗi" không lưu được; coi là xong khi người dùng đã sang bước 5.
      done: baselineDone && (candidateCount > 0 || tests > 0),
      status: baselineDone ? `${failing} biến thể lỗi cần phân tích` : "Cần chạy baseline trước",
      actions: [{ label: "Xem ca lỗi", href: s4.href, primary: true }],
    },
    {
      step: s5,
      done: tests > 0,
      status: tests
        ? `${candidateCount} ứng viên · ${tests} lần chạy lại cùng seed`
        : candidateCount
          ? `${candidateCount} ứng viên, chưa chạy kiểm thử hồi quy`
          : "Chưa có cấu hình ứng viên",
      actions: [
        { label: candidateCount ? "Chạy kiểm thử hồi quy" : "Tạo ứng viên", href: candidateCount ? "/validation/regression/new" : s5.href, primary: true },
        { label: "Cấu hình AEB", href: s5.href },
      ],
    },
    {
      step: s6,
      done: tests > 0 && pending.length === 0 && decided > 0,
      status: tests
        ? `${pending.length} chờ duyệt · ${decided} đã quyết định`
        : "Chưa có kết quả so sánh",
      actions: pending.length
        ? [
            { label: `Duyệt ${pending[0].code}`, href: `/validation/recommendations/${pending[0].id}/review`, primary: true },
            { label: "Tất cả khuyến nghị", href: s6.href },
          ]
        : [
            { label: "Xem khuyến nghị", href: s6.href, primary: true },
            { label: "Kiểm thử hồi quy", href: "/validation/regression" },
          ],
    },
  ];
}

function StepCard({ view, state }: { view: StepView; state: State }) {
  const { step, status, actions } = view;
  return (
    <section
      className={cx(
        "flex flex-col gap-3 rounded-[20px] bg-white p-5",
        state === "current" ? "border-2 border-solid border-vehicsim-ink shadow-vehicsim-card" : "border border-solid border-vehicsim-line shadow-vehicsim-card",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cx(
            "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
            state === "done" ? "bg-vehicsim-ok text-white" : state === "current" ? "bg-vehicsim-ink text-white" : "bg-vehicsim-soft text-vehicsim-muted",
          )}
        >
          {state === "done" ? "✓" : step.n}
        </span>
        {state === "current" ? <Tag tone="dark">Bước tiếp theo</Tag> : <Tag>{step.feature}</Tag>}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">
          {step.n}. {step.title}
        </h2>
        <p className="text-[13px] leading-[1.5] text-vehicsim-muted">{step.detail}</p>
      </div>
      <p className={cx("text-[13px] font-semibold", state === "done" ? "text-vehicsim-ok" : state === "current" ? "text-vehicsim-ink" : "text-vehicsim-faint")}>
        {status}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {actions.map((a) => (
          <PillButton key={a.label} variant={a.primary && state === "current" ? "dark" : "light"} href={a.href} className="px-4 py-2 text-[12px]">
            {a.label}
          </PillButton>
        ))}
      </div>
    </section>
  );
}
