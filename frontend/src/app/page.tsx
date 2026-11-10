"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { MVP_STEPS, type FlowStep } from "@/components/vehicsimFlow";
import { ExperiencerHome } from "@/components/project/ProjectShell";
import { JourneyList } from "@/components/project/ProjectHome";
import { JOURNEY_STEPS } from "@/components/project/journey";
import { Card, CardTitle, ErrorNote, PillButton, StatCard, Tag, cx } from "@/components/VehicSimUi";
import { ReviewerHome } from "@/components/reviewer/ReviewerHome";
import { vehicsimApi } from "@/services/vehicsim";
import type { FamilyItem, RecommendationItem, RegressionList } from "@/types/vehicsim";

type State = "done" | "current" | "todo";
interface StepView {
  step: FlowStep;
  done: boolean;
  running?: boolean;
  status: string;
  actions: { label: string; href: string; primary?: boolean }[];
}

/** Trang chủ theo role: REVIEWER có hàng đợi duyệt riêng, EXPERIENCER có project cá nhân, các role khác thấy vòng MVP. */
export default function HomePage() {
  const { user } = useAuth();
  const { isExperiencer } = useVehicSimContext();
  if (user?.roleCode === "REVIEWER") return <ReviewerHome />;
  return isExperiencer ? <ExperiencerHome /> : <MvpLoopPage />;
}

/**
 * Dashboard = vòng MVP 6 bước. Trạng thái mỗi bước lấy từ dữ liệu thật; bước
 * chưa xong đầu tiên là "bước tiếp theo" và được tô nổi.
 */
function MvpLoopPage() {
  const { user } = useAuth();
  const { ctx, error: contextError } = useVehicSimContext();
  const [families, setFamilies] = useState<FamilyItem[] | null>(null);
  const [regressions, setRegressions] = useState<RegressionList | null>(null);
  const [recs, setRecs] = useState<RecommendationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engineer = user?.roleCode === "ENGINEER";

  useEffect(() => {
    Promise.all([vehicsimApi.families(), vehicsimApi.regressions(), vehicsimApi.recommendations()])
      .then(([f, r, rc]) => {
        setFamilies(f);
        setRegressions(r);
        setRecs(rc);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được trạng thái vòng MVP"));
  }, []);

  const candidates = ctx?.versions.filter((v) => v.parent_version_id !== null).length ?? 0;
  const loaded = families && regressions && recs && ctx;
  const views = loaded ? buildSteps(families, regressions, recs, candidates, ctx.system.baseline?.label) : null;
  const currentIdx = views ? views.findIndex((v) => !v.done) : -1;
  const next = views && currentIdx >= 0 ? views[currentIdx] : null;
  const firstName = (user?.full_name || user?.name || "").trim().split(/\s+/).pop();

  const variants = (families ?? []).reduce((n, f) => n + f.variants, 0);
  const failing = (families ?? []).reduce((n, f) => n + f.failures, 0);
  const pendingReviews = (recs ?? []).filter((r) => r.status === "PENDING").length;
  const engineerSteps = engineer && views && regressions ? buildEngineerSteps(views, candidates, regressions.kpis) : null;
  const nextEngineerStep = engineerSteps?.findIndex((v) => !v.done) ?? -1;
  const baseline = ctx?.system.baseline;
  const metrics = (
    <div className={cx("grid w-full gap-3", engineer ? "grid-cols-2 sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4")}>
      <StatCard label="Biến thể kịch bản" value={families ? variants : error ? "—" : "…"} note={families ? `${families.length} họ kịch bản` : undefined} />
      {!engineer && <StatCard
        label="Lỗi trên bản cơ sở"
        value={families && baseline ? failing : "—"}
        valueClass={failing ? "text-vehicsim-danger" : undefined}
        tone={failing ? "danger" : "neutral"}
        note={baseline ? `AEB ${baseline.label}` : "Chưa có bản cơ sở"}
      />}
      <StatCard
        label="Kiểm thử hồi quy"
        value={regressions ? regressions.kpis.total : error ? "—" : "…"}
        note={regressions ? `${regressions.kpis.passed} đạt · ${regressions.kpis.failed} không đạt` : undefined}
      />
      <StatCard label="Khuyến nghị chờ duyệt" value={recs ? pendingReviews : error ? "—" : "…"} />
    </div>
  );

  return (
    <VehicSimPage
      crumbs={[{ label: "Tổng quan" }]}
      title={engineer ? ctx?.project.name ?? "Tổng quan dự án" : firstName ? `Chào ${firstName}` : "Tổng quan"}
      subtitle={
        engineer
          ? "Kết quả mô phỏng và tiến độ kiểm thử AEB/FCW."
          : views
            ? next
              ? `Vòng MVP trên motif người đi bộ băng ngang. Bước tiếp theo: ${next.step.n} · ${next.step.title}.`
              : "Vòng MVP đã khép kín. Tạo một cấu hình AEB khác để bắt đầu vòng mới."
            : "Đang tải trạng thái vòng MVP…"
      }
      actions={
        engineer ? null : next ? (
          <PillButton variant="dark" href={next.actions[0].href}>
            Tiếp tục: bước {next.step.n}
          </PillButton>
        ) : views ? (
          <PillButton variant="dark" href="/aeb">
            Bắt đầu vòng mới
          </PillButton>
        ) : null
      }
    >
      <ErrorNote message={error} />

      {engineer ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="flex flex-col gap-4 p-5">
              <CardTitle aside={<Link href="/analysis/failures" className="text-right text-[13px] font-semibold text-vehicsim-primary hover:underline">Mở phân tích</Link>}>
                Kết quả bản cơ sở
              </CardTitle>
              {error || contextError ? <p className="text-sm text-vehicsim-muted">Không tải được kết quả bản cơ sở.</p>
                : !families || !ctx ? <p role="status" className="text-sm text-vehicsim-muted">Đang tải kết quả bản cơ sở…</p>
                : !baseline ? <p className="text-sm text-vehicsim-muted">Dự án chưa có cấu hình AEB làm bản cơ sở.</p>
                : families.length === 0 ? <p className="text-sm text-vehicsim-muted">Chưa có họ kịch bản để chạy thử.</p>
                : failing === 0 ? <p className="text-sm text-vehicsim-muted">Chưa ghi nhận biến thể có lỗi trên bản cơ sở hiện hành.</p>
                : <>
                    <p className="text-sm text-vehicsim-muted">
                      <strong className="mr-2 text-2xl font-bold tabular-nums text-vehicsim-danger">{failing}</strong>
                      biến thể có lỗi trên bản cơ sở hiện hành
                    </p>
                    <ul className="divide-y divide-vehicsim-line border-t border-vehicsim-line">
                      {families.filter((family) => family.failures > 0).slice(0, 3).map((family) => (
                        <li key={family.id}>
                          <Link href={`/analysis/failures?view=failures&f_scenario=${family.id}&f_aeb=${baseline.id}`}
                            className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm font-semibold hover:text-vehicsim-primary hover:underline">
                            <span className="min-w-0 break-words">{family.name}</span>
                            <span className="text-xs font-medium text-vehicsim-danger">{family.failures} lỗi</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>}
            </Card>
            {metrics}
          </div>
          {engineerSteps ? (
            <JourneyList
              title="Quy trình kiểm thử"
              rows={engineerSteps.map((v, i) => ({
                key: JOURNEY_STEPS[i].key,
                status: v.running ? "RUNNING" : v.done ? "DONE" : "TODO",
                current: i === nextEngineerStep,
                summary: v.status,
                action: v.actions.map((a) => (
                  a.primary && i === nextEngineerStep
                    ? <PillButton key={a.label} variant="dark" href={a.href}>{a.label}</PillButton>
                    : <Link key={a.label} href={a.href} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-vehicsim-primary hover:underline">{a.label}</Link>
                )),
              }))}
            />
          ) : !error && !contextError && <p role="status" className="text-sm text-vehicsim-muted">Đang tải quy trình kiểm thử…</p>}
        </div>
      ) : (
        <>
          {metrics}
          <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(views ?? MVP_STEPS.map((step) => ({ step, done: false, status: "…", actions: [] }))).map((v, i) => {
              const state: State = v.done ? "done" : i === currentIdx ? "current" : "todo";
              return <StepCard key={v.step.n} view={v} state={state} />;
            })}
          </div>
        </>
      )}

      <p className="text-[12px] leading-[1.6] text-vehicsim-faint">
        Bộ mô phỏng động học hoặc CARLA qua OpenSCENARIO (.xosc) · mỗi biến thể chạy với seed cố định nên bản cơ sở và ứng viên so được
        từng cặp. Người duyệt ra quyết định dựa trên kết quả mô phỏng.
      </p>
    </VehicSimPage>
  );
}

function buildEngineerSteps(
  [scenario, variants, baseline, results, improve, verify]: StepView[],
  candidates: number,
  { total, running }: RegressionList["kpis"],
) {
  const regressionAction = running
    ? { label: "Xem tiến độ hồi quy", href: "/validation/regression" }
    : total
      ? { label: "Xem khuyến nghị", href: "/validation/recommendations" }
      : { label: "Chạy kiểm thử hồi quy", href: "/validation/regression/new" };
  return [
    {
      ...scenario,
      done: scenario.done && variants.done,
      status: `${scenario.status} · ${variants.status}`,
      actions: scenario.done && !variants.done ? variants.actions : scenario.actions,
    },
    baseline,
    results,
    {
      ...improve,
      done: candidates > 0,
      status: candidates ? `${candidates} cấu hình ứng viên` : "Chưa có cấu hình ứng viên",
      actions: [{ label: candidates ? "Xem cấu hình AEB" : "Tạo ứng viên", href: "/aeb", primary: true }],
    },
    {
      ...verify,
      done: total > 0 && !running,
      running: running > 0,
      status: running ? `${running} kiểm thử đang chạy` : total ? `${total} kiểm thử · ${verify.status}` : "Chưa chạy kiểm thử hồi quy",
      actions: [
        { ...regressionAction, primary: true },
        ...(!running ? [{ label: "Kiểm thử hồi quy", href: "/validation/regression" }] : []),
      ],
    },
  ];
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
  const queued = families.reduce((n, f) => n + (f.runs.PENDING ?? f.runs.QUEUED ?? 0) + (f.runs.RUNNING ?? 0), 0);
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
      running: queued > 0,
      status: queued
        ? `Đang chạy ${queued} run…`
        : baselineDone
          ? `Bản cơ sở AEB ${baselineLabel ?? ""} đã chạy xong`
          : "Chưa chạy cơ sở",
      actions: [{ label: queued ? "Xem tiến độ baseline" : "Chạy baseline", href: s3.href, primary: true }],
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
        "flex flex-col gap-3 rounded-xl bg-vehicsim-surface p-5",
        state === "current" ? "border-2 border-solid border-vehicsim-primary" : "border border-solid border-vehicsim-line",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cx(
            "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
            state === "done" ? "bg-vehicsim-ok text-white" : state === "current" ? "bg-vehicsim-primary text-white" : "bg-vehicsim-soft text-vehicsim-muted",
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
