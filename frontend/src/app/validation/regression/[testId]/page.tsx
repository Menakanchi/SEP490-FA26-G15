"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, OutcomeBadge, PillButton, StatusBadge, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import { vi, viSummary } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { OutcomeKey, Pair, ParamDiff, RegressionDetail } from "@/types/vehicsim";

const POLL_MS = 2500;
const OUTCOMES: OutcomeKey[] = ["SAFE", "NEAR_MISS", "COLLISION"];
const OUTCOME_LABEL: Record<OutcomeKey, string> = { SAFE: "An toàn", NEAR_MISS: "Suýt va chạm", COLLISION: "Va chạm" };
const RANK: Record<OutcomeKey, number> = { SAFE: 0, NEAR_MISS: 1, COLLISION: 2 };
const SHORT_PARAM: Record<string, string> = {
  TTC_THRESHOLD: "TTC",
  BRAKE_ACTIVATION_DELAY: "Trễ phanh",
  DETECTION_CONFIDENCE_THRESHOLD: "Ngưỡng tin cậy",
  MAX_DECELERATION: "Giảm tốc tối đa",
  PREDICTION_HORIZON: "Tầm dự đoán",
  SAFETY_DISTANCE_MARGIN: "Biên an toàn",
  RELATIVE_VELOCITY_THRESHOLD: "Vận tốc tương đối",
  BRAKE_BUILDUP_RATE: "Tăng lực phanh",
  JERK_LIMIT: "Giới hạn jerk",
  ACTUATOR_RESPONSE_TIME: "Actuator",
};
type DiffTab = "regressed" | "fixed" | "changes" | "all";

export default function RegressionResultsPage() {
  const { testId } = useParams<{ testId: string }>();
  const { refresh } = useVehicSimContext();
  const [d, setD] = useState<RegressionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DiffTab>("changes");
  const [shown, setShown] = useState(20);

  const load = useCallback(() => {
    vehicsimApi.regression(Number(testId))
      .then((data) => {
        setD((prev) => {
          // Test vừa chạy xong → làm mới ngữ cảnh (KPI, danh sách version) ở sidebar/chip.
          if (prev && prev.status === "RUNNING" && data.status !== "RUNNING") void refresh();
          return data;
        });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được kiểm thử hồi quy"));
  }, [testId, refresh]);

  useEffect(load, [load]);
  const running = d?.status === "RUNNING" || d?.status === "PENDING";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

  const s = d?.summary;
  const counts = s?.counts;
  const pairs = useMemo(() => s?.pairs ?? [], [s]);
  const changed = pairs.filter((p) => p.change !== "unchanged");
  const visible = useMemo(() => {
    const list =
      tab === "regressed"
        ? pairs.filter((p) => p.change === "regressed")
        : tab === "fixed"
          ? pairs.filter((p) => p.change === "fixed")
          : tab === "changes"
            ? pairs.filter((p) => p.change !== "unchanged")
            : pairs;
    // Regression lên đầu, rồi các ca sửa được, rồi theo mức cải thiện TTC.
    const order = { regressed: 0, fixed: 1, unchanged: 2 } as const;
    return [...list].sort((a, b) => order[a.change] - order[b.change] || (b.min_ttc_delta_s ?? 0) - (a.min_ttc_delta_s ?? 0));
  }, [pairs, tab]);
  const firstInteresting = pairs.find((p) => p.change === "regressed") ?? changed[0];
  const failedCriteria = (s?.criteria ?? []).filter((c) => c.enabled && !c.passed);
  // Tham số đổi lên trước (để kỹ sư thấy hết thay đổi), rồi bù tham số chính cho đủ 4 ô.
  const cardParams = useMemo(() => {
    if (!d) return [];
    const changedParams = d.parameter_diff.filter((p) => p.changed);
    const fill = d.key_parameters.filter((p) => !changedParams.some((c) => c.code === p.code));
    return [...changedParams, ...fill].slice(0, Math.max(4, changedParams.length));
  }, [d]);

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm định" }, { label: "Kiểm thử hồi quy", href: "/validation/regression" }, { label: d?.code ?? "…" }]}
      title={d?.code ?? "Kiểm thử hồi quy"}
      badges={
        d && (
          <StatusBadge
            status={d.status}
            suffix={
              d.status === "FAILED" && counts?.regressed
                ? ` · ${counts.regressed} ca xấu đi`
                : running
                  ? ` · ${d.progress.done} / ${d.progress.total}`
                  : undefined
            }
          />
        )
      }
      subtitle={
        d &&
        `AEB ${d.baseline.label} (cơ sở) → ${d.candidate.label} (ứng viên) · ${d.family} · ${d.pass_criteria.scenario_set.variant_count} kịch bản · cùng seed · chạy ${fmt.date(d.created_at)}${d.created_by ? ` bởi ${d.created_by}` : ""}`
      }
      actions={
        d && (
          <>
            <PillButton
              href={firstInteresting ? `/analysis/failures/${firstInteresting.candidate_run_id}/playback` : undefined}
              disabled={!firstInteresting}
            >
              ▶ Phát lại để so sánh
            </PillButton>
            <PillButton
              variant="dark"
              href={!running ? `/validation/recommendations/${d.id}` : undefined}
              disabled={running}
            >
              Mở khuyến nghị
            </PillButton>
          </>
        )
      }
    >
      <ErrorNote message={error} />
      {d && (
        <>
          <Banner d={d} failedCriteria={failedCriteria.map((c) => vi(c.label))} />

          <div className="flex w-full items-center gap-4">
            <VersionCard title={`AEB ${d.baseline.label}`} tag="Cơ sở" params={cardParams} side="baseline" />
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-solid border-vehicsim-line bg-white text-[15px] font-bold text-vehicsim-ink">
              →
            </span>
            <VersionCard title={`AEB ${d.candidate.label}`} tag="Ứng viên" params={cardParams} side="candidate" dark />
          </div>

          {running && (
            <section className="flex flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
              <div className="flex items-center justify-between text-[14px] font-semibold text-vehicsim-ink">
                <span>Đang chạy các cặp mô phỏng…</span>
                <span>
                  {d.progress.done} / {d.progress.total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-vehicsim-line">
                <div
                  className="h-2 rounded-full bg-vehicsim-decision transition-all"
                  style={{ width: `${d.progress.total ? (d.progress.done / d.progress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[12px] text-vehicsim-muted">Kết quả tự cập nhật khi mọi cặp lượt chạy cơ sở/ứng viên chạy xong.</p>
            </section>
          )}

          {counts && s?.rates && (
            <>
              <div className="flex w-full items-stretch gap-4">
                <Kpi label="Kịch bản" value={counts.scenarios} note={`${d.family} · cùng seed`} />
                <Kpi label="Được sửa" value={counts.fixed} tone="text-vehicsim-ok" note="va chạm/suýt va chạm → an toàn hơn" />
                <Kpi label="Xấu đi" value={counts.regressed} tone={counts.regressed ? "text-vehicsim-danger" : "text-vehicsim-ink"} note="kết quả hoặc verdict tệ hơn" />
                <Kpi label="Không đổi" value={counts.unchanged} note="kết quả như cũ" />
                <Kpi
                  label="Tỉ lệ va chạm"
                  value={`${s.rates.collision_baseline_pct.toFixed(1)}% → ${s.rates.collision_candidate_pct.toFixed(1)}%`}
                  small
                  tone={s.rates.collision_candidate_pct <= s.rates.collision_baseline_pct ? "text-vehicsim-ok" : "text-vehicsim-danger"}
                  note={`${fmt.signed(s.rates.collision_candidate_pct - s.rates.collision_baseline_pct, 1)} điểm % · phanh nhầm ${fmt.signed(
                    s.rates.false_activation_candidate_pct - s.rates.false_activation_baseline_pct,
                    1,
                  )} điểm %`}
                />
              </div>

              <div className="flex w-full items-stretch gap-4">
                {s.transitions && <Transitions transitions={s.transitions} baseline={d.baseline.label} candidate={d.candidate.label} />}
                <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[17px] font-bold text-vehicsim-ink">Theo họ kịch bản</h2>
                    <span className="text-[11px] font-medium text-vehicsim-faint">◂ xấu đi · được sửa ▸</span>
                  </div>
                  {(s.families ?? []).map((f) => {
                    const max = Math.max(1, f.scenarios);
                    return (
                      <div key={f.scenario_id} className="flex items-center gap-3 border-b border-solid border-vehicsim-line pb-3">
                        <span className="flex w-[150px] flex-col">
                          <span className="text-[13px] font-semibold text-vehicsim-ink">{f.name}</span>
                          <span className="text-[11px] text-vehicsim-faint">{f.scenarios} kịch bản</span>
                        </span>
                        <span className="relative flex h-3 flex-1 items-center">
                          <span className="absolute left-1/2 top-[-4px] h-5 w-px bg-vehicsim-line-strong" />
                          <span
                            className="absolute right-1/2 h-3 rounded-l-[3px] bg-vehicsim-danger"
                            style={{ width: `${(f.regressed / max) * 50}%` }}
                          />
                          <span className="absolute left-1/2 h-3 rounded-r-[3px] bg-vehicsim-ok" style={{ width: `${(f.fixed / max) * 50}%` }} />
                        </span>
                        <span className={cx("w-14 text-right text-[13px] font-bold", f.regressed ? "text-vehicsim-danger" : "text-vehicsim-ink")}>
                          +{f.fixed} / {f.regressed ? `−${f.regressed}` : 0}
                        </span>
                        <Tag tone={(f.median_ttc_delta ?? 0) >= 0 ? "ok" : "danger"}>TTC {fmt.signed(f.median_ttc_delta, 1, " s")}</Tag>
                      </div>
                    );
                  })}
                  <div className="mt-auto flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-vehicsim-ink">Tiêu chí đạt</span>
                    {(s.criteria ?? []).map((c) => (
                      <div key={c.key} className="flex items-center gap-2 text-[12px]">
                        <span
                          className={cx(
                            "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                            !c.enabled ? "bg-vehicsim-line-strong" : c.passed ? "bg-vehicsim-ok" : "bg-vehicsim-danger",
                          )}
                        >
                          {!c.enabled ? "–" : c.passed ? "✓" : "!"}
                        </span>
                        <span className={cx("flex-1", c.enabled ? "text-vehicsim-ink" : "text-vehicsim-faint")}>
                          {vi(c.label)}
                          {c.threshold !== null ? ` ${c.threshold}` : ""}
                        </span>
                        {c.required && <span className="text-[10px] font-semibold uppercase text-vehicsim-danger">Bắt buộc</span>}
                        <span className="w-16 text-right font-semibold text-vehicsim-muted">{vi(criterionActual(c.actual))}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
                <div className="flex items-center justify-between px-5 py-4">
                  <h2 className="text-[17px] font-bold text-vehicsim-ink">Khác biệt theo kịch bản</h2>
                  <div className="flex gap-1 rounded-full bg-vehicsim-soft p-1">
                    {(
                      [
                        ["regressed", `Xấu đi (${counts.regressed})`],
                        ["fixed", `Được sửa (${counts.fixed})`],
                        ["changes", `Mọi thay đổi (${changed.length})`],
                        ["all", `Tất cả ${counts.scenarios}`],
                      ] as [DiffTab, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setTab(key);
                          setShown(20);
                        }}
                        className={cx("rounded-full px-[14px] py-[7px] text-[12px] font-semibold", tab === key ? "bg-vehicsim-ink text-white" : "text-vehicsim-muted")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex h-10 items-center border-y border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
                  <span className="min-w-0 flex-1">Kịch bản</span>
                  <span className="w-[150px]">Họ kịch bản</span>
                  <span className="w-[120px]">{d.baseline.label}</span>
                  <span className="w-6" />
                  <span className="w-[120px]">{d.candidate.label}</span>
                  <span className="w-[96px]">Δ TTC min</span>
                  <span className="w-[90px]">Va chạm ở</span>
                  <span className="w-[100px]" />
                </div>
                {visible.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-vehicsim-muted">Không có kịch bản nào trong nhóm này.</p>}
                {visible.slice(0, shown).map((p) => (
                  <DiffRow key={p.variant_id} p={p} />
                ))}
                <div className="flex items-center justify-between px-5 py-4 text-[12px] text-vehicsim-faint">
                  <span>
                    Hiển thị {Math.min(shown, visible.length)} / {visible.length} kịch bản
                  </span>
                  {shown < visible.length && (
                    <button type="button" onClick={() => setShown((n) => n + 40)} className="font-semibold text-vehicsim-ink hover:underline">
                      Xem thêm
                    </button>
                  )}
                </div>
              </section>
            </>
          )}

          {s?.error && <ErrorNote message={`Kiểm thử lỗi: ${s.error}`} />}
        </>
      )}
    </VehicSimPage>
  );
}

function Banner({ d, failedCriteria }: { d: RegressionDetail; failedCriteria: string[] }) {
  const counts = d.summary.counts;
  if (d.status === "FAILED") {
    return (
      <div className="flex items-center gap-4 rounded-[20px] border border-solid border-vehicsim-danger/30 bg-vehicsim-fail-card px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-vehicsim-danger text-[18px] font-bold text-white">!</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[17px] font-bold text-vehicsim-ink">Không đủ điều kiện để chấp nhận</p>
          <p className="text-[13px] leading-[1.5] text-vehicsim-muted">
            {d.candidate.label} sửa được {counts?.fixed ?? 0} kịch bản nhưng làm {counts?.regressed ?? 0} kịch bản từng đạt bị xấu đi.
            Tiêu chí trượt: {failedCriteria.join("; ") || "—"}. Ứng viên làm xấu đi kịch bản cũ không bao giờ được tự động
            chấp nhận.
          </p>
        </div>
        <Tag tone="danger" className="border border-solid border-vehicsim-danger/40 bg-white px-3 py-[6px] text-[12px]">
          Khuyến nghị bị chặn
        </Tag>
      </div>
    );
  }
  if (d.status === "PASSED") {
    const decided = d.review_decision !== "PENDING";
    return (
      <div className="flex items-center gap-4 rounded-[20px] border border-solid border-vehicsim-ok/30 bg-vehicsim-ok-bg px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-vehicsim-ok text-[16px] font-bold text-white">✓</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[17px] font-bold text-vehicsim-ink">Đủ điều kiện để khuyến nghị</p>
          <p className="text-[13px] leading-[1.5] text-vehicsim-muted">
            Mọi tiêu chí bắt buộc đều đạt trên {counts?.scenarios ?? 0} cặp kịch bản. Ứng viên vẫn cần kỹ sư quyết định — không bao giờ
            được tự động chấp nhận.
          </p>
        </div>
        <PillButton variant={decided ? "light" : "dark"} href={`/validation/recommendations/${d.id}${decided ? "" : "/review"}`}>
          {decided ? "Xem quyết định" : "Duyệt ngay"}
        </PillButton>
      </div>
    );
  }
  if (d.status === "ERROR") {
    return <ErrorNote message="Kiểm thử hồi quy gặp lỗi khi chạy — xem log worker và chạy lại." />;
  }
  return null;
}

function VersionCard({ title, tag, params, side, dark }: { title: string; tag: string; params: ParamDiff[]; side: "baseline" | "candidate"; dark?: boolean }) {
  return (
    <section
      className={cx(
        "flex min-w-0 flex-1 flex-col gap-3 rounded-[20px] bg-white p-5",
        dark ? "border-2 border-solid border-vehicsim-ink" : "border border-solid border-vehicsim-line shadow-vehicsim-card",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
        <Tag tone={dark ? "dark" : "neutral"}>{tag}</Tag>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {params.map((p) => {
          const highlight = side === "candidate" && p.changed;
          return (
            <div key={p.code} className={cx("flex min-w-0 flex-1 flex-col gap-1 rounded-[10px] px-3 py-2", highlight ? "bg-vehicsim-decision-bg" : "bg-vehicsim-soft")}>
              <span className={cx("truncate text-[11px] font-medium", highlight ? "text-vehicsim-decision" : "text-vehicsim-faint")}>{SHORT_PARAM[p.code] ?? p.name}</span>
              <span className={cx("text-[14px] font-bold", highlight ? "text-vehicsim-decision" : "text-vehicsim-ink")}>{paramValue(p[side], p.unit)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Kpi({ label, value, note, tone = "text-vehicsim-ink", small }: { label: string; value: React.ReactNode; note: string; tone?: string; small?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("whitespace-nowrap font-extrabold tracking-[-0.6px]", small ? "text-[22px] leading-[40px]" : "text-[34px]", tone)}>{value}</span>
      <span className="text-[12px] text-vehicsim-faint">{note}</span>
    </div>
  );
}

function Transitions({
  transitions,
  baseline,
  candidate,
}: {
  transitions: Record<OutcomeKey, Record<OutcomeKey, number>>;
  baseline: string;
  candidate: string;
}) {
  return (
    <section className="flex w-[430px] shrink-0 flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
      <h2 className="text-[17px] font-bold text-vehicsim-ink">Chuyển đổi kết quả</h2>
      <p className="text-[12px] text-vehicsim-faint">
        Hàng: cơ sở {baseline} · Cột: ứng viên {candidate}
      </p>
      <div className="grid grid-cols-[90px_repeat(3,1fr)] gap-2">
        <span />
        {OUTCOMES.map((o) => (
          <span key={o} className="text-center text-[12px] font-medium text-vehicsim-muted">
            {OUTCOME_LABEL[o]}
          </span>
        ))}
        {OUTCOMES.map((row) => (
          <React.Fragment key={row}>
            <span className="flex items-center text-[12px] font-medium text-vehicsim-muted">{OUTCOME_LABEL[row]}</span>
            {OUTCOMES.map((col) => {
              const n = transitions[row][col];
              const kind = RANK[col] < RANK[row] ? "better" : RANK[col] > RANK[row] ? "worse" : "same";
              return (
                <span
                  key={col}
                  className={cx(
                    "flex h-[60px] items-center justify-center rounded-[12px] text-[22px] font-extrabold",
                    kind === "same" && (n ? "bg-vehicsim-line text-vehicsim-ink" : "bg-vehicsim-soft text-vehicsim-faint"),
                    kind === "better" && (n ? "bg-vehicsim-ok-bg text-vehicsim-ok" : "bg-vehicsim-soft text-vehicsim-faint"),
                    kind === "worse" && (n ? "border-2 border-solid border-vehicsim-danger bg-vehicsim-danger-bg text-vehicsim-danger" : "bg-vehicsim-soft text-vehicsim-faint"),
                  )}
                >
                  {n}
                </span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex gap-4 text-[11px] font-medium text-vehicsim-muted">
        <Legend cls="bg-vehicsim-ok" label="Tốt lên" />
        <Legend cls="bg-vehicsim-faint" label="Không đổi" />
        <Legend cls="bg-vehicsim-danger" label="Xấu đi" />
      </div>
    </section>
  );
}

function DiffRow({ p }: { p: Pair }) {
  const regressed = p.change === "regressed";
  return (
    <div className={cx("flex h-[56px] items-center border-b border-solid border-vehicsim-line px-5", regressed && "bg-vehicsim-fail-card")}>
      <Link href={`/analysis/failures/${p.candidate_run_id}`} className="flex min-w-0 flex-1 flex-col gap-[2px] pr-3 hover:underline">
        <span className="text-[13px] font-bold text-vehicsim-ink">{p.label}</span>
        <span className="truncate text-[12px] text-vehicsim-faint">{viSummary(p.summary)}</span>
      </Link>
      <span className="w-[150px] truncate text-[13px] text-vehicsim-ink">{p.family}</span>
      <span className="w-[120px]">
        <PairOutcome outcome={p.baseline_outcome} falseActivation={p.baseline_false_activation} />
      </span>
      <span className="w-6 text-[12px] text-vehicsim-faint">→</span>
      <span className="w-[120px]">
        <PairOutcome outcome={p.candidate_outcome} falseActivation={p.candidate_false_activation} />
      </span>
      <span
        className={cx(
          "w-[96px] text-[13px] font-semibold",
          p.min_ttc_delta_s === null ? "text-vehicsim-faint" : p.min_ttc_delta_s >= 0 ? "text-vehicsim-ok" : "text-vehicsim-danger",
        )}
      >
        {fmt.signed(p.min_ttc_delta_s, 1, " s")}
      </span>
      <span className={cx("w-[90px] text-[13px]", p.candidate_impact_kmh ? "font-semibold text-vehicsim-danger" : "text-vehicsim-faint")}>
        {p.candidate_impact_kmh ? fmt.kmh(p.candidate_impact_kmh) : "—"}
      </span>
      <span className="flex w-[100px] justify-end">
        <Link
          href={`/analysis/failures/${p.candidate_run_id}/playback`}
          className="rounded-full border border-solid border-vehicsim-line-strong bg-white px-3 py-[6px] text-[12px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft"
        >
          ▶ So sánh
        </Link>
      </span>
    </div>
  );
}

function PairOutcome({ outcome, falseActivation }: { outcome: OutcomeKey; falseActivation: boolean }) {
  // SAFE nhưng phanh oan vẫn là FAIL: hiện như "False braking" để cột trước/sau khớp verdict.
  return <OutcomeBadge outcome={outcome === "SAFE" && falseActivation ? "FALSE_BRAKING" : outcome} size="sm" />;
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className={cx("size-2 rounded-full", cls)} />
      {label}
    </span>
  );
}

function criterionActual(v: number | string | null): string {
  if (v === null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return v;
}
