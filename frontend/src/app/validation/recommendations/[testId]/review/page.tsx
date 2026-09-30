"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Checkbox, ErrorNote, PillButton, RECOMMENDATION_STATUS, ROLE_LABELS, Toggle, cx, fmt, initials, paramValue } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RecommendationDetail, ReviewDecision } from "@/types/vehicsim";

type Decision = Exclude<ReviewDecision, "PENDING">;

export default function ReviewPage() {
  const { testId } = useParams<{ testId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { refresh, canWrite } = useVehicSimContext();
  const [r, setR] = useState<RecommendationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    vehicsimApi.recommendation(Number(testId))
      .then((data) => {
        setR(data);
        setConditions(data.review.conditions ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được khuyến nghị"));
  }, [testId]);

  if (!r) {
    return (
      <VehicSimPage crumbs={[{ label: "Kiểm định" }, { label: "Khuyến nghị", href: "/validation/recommendations" }, { label: "Duyệt" }]} title="Duyệt">
        <ErrorNote message={error} />
      </VehicSimPage>
    );
  }

  const counts = r.summary.counts;
  const rates = r.summary.rates;
  const final = r.review.decision === "ACCEPT" || r.review.decision === "REJECT";
  const running = r.status === "RUNNING" || r.status === "PENDING";
  // Khớp các chặn trong regression.decide: chỉ Accept khi test PASSED, baseline còn hiện hành, candidate chưa được quyết.
  const acceptBlock =
    r.status !== "PASSED"
      ? "Kiểm thử hồi quy không đạt — ứng viên làm xấu đi kịch bản không bao giờ được chấp nhận"
      : r.baseline.status !== "BASELINE"
        ? "Bản cơ sở đã đổi kể từ lúc chạy kiểm thử này — hãy chạy lại kiểm thử hồi quy"
        : r.candidate.status !== "CANDIDATE"
          ? "Ứng viên này đã được quyết định ở một kiểm thử khác"
          : null;
  const rejectBlock = r.candidate.status !== "CANDIDATE" ? "Ứng viên này đã được quyết định ở một kiểm thử khác" : null;
  const firstFixed = r.summary.pairs?.find((p) => p.change === "fixed");
  const firstRegressed = r.summary.pairs?.find((p) => p.change === "regressed");

  const checklist = [
    <>
      Tôi đã xem kết quả kiểm thử hồi quy{" "}
      <Link href={`/validation/regression/${r.id}`} className="font-semibold underline">
        {r.code}
      </Link>{" "}
      ({counts?.regressed ?? 0} ca xấu đi, {counts?.fixed ?? 0} ca được sửa)
    </>,
    <>Tôi đã xem các đánh đổi và họ kịch bản bị ảnh hưởng</>,
    <>
      Tôi đã phát lại ít nhất một{" "}
      {firstFixed ? (
        <Link href={`/analysis/failures/${firstFixed.candidate_run_id}/playback`} className="font-semibold underline">
          kịch bản được sửa
        </Link>
      ) : (
        "kịch bản được sửa"
      )}
      {firstRegressed && (
        <>
          {" "}
          và một{" "}
          <Link href={`/analysis/failures/${firstRegressed.candidate_run_id}/playback`} className="font-semibold underline">
            kịch bản bị xấu đi
          </Link>
        </>
      )}
    </>,
    <>Tôi hiểu rằng bằng chứng độ bền vững, Pareto và độ nhạy chưa được chạy cho ứng viên này</>,
  ];
  const ready =
    canWrite && !final && !running && !!decision && checks.every(Boolean) && reason.trim().length > 0 && confirmed && !submitting &&
    !(decision === "ACCEPT" && acceptBlock) && !(decision === "REJECT" && rejectBlock);

  const submit = async () => {
    if (!ready || !decision) return;
    setSubmitting(true);
    setError(null);
    try {
      await vehicsimApi.decide(r.id, { decision, reason: reason.trim(), conditions: conditions.trim() || undefined, confirmed });
      await refresh(); // Accept đổi baseline → chip "System" và danh sách version phải cập nhật.
      router.push(`/validation/recommendations/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được quyết định");
      setSubmitting(false);
    }
  };

  const options: { key: Decision; title: string; detail: string; icon: string; tone: string; block: string | null }[] = [
    {
      key: "ACCEPT",
      title: "Chấp nhận",
      detail: `AEB ${r.candidate.label} trở thành bản cơ sở`,
      icon: "✓",
      tone: "border-vehicsim-ok bg-vehicsim-ok-bg text-vehicsim-ok",
      block: acceptBlock,
    },
    {
      key: "REJECT",
      title: "Từ chối",
      detail: "Loại ứng viên; giữ nguyên bản cơ sở",
      icon: "✕",
      tone: "border-vehicsim-danger bg-vehicsim-danger-bg text-vehicsim-danger",
      block: rejectBlock,
    },
    {
      key: "REQUEST_MORE_TESTS",
      title: "Yêu cầu thêm kiểm thử",
      detail: "Trả lại kèm yêu cầu thêm kịch bản",
      icon: "↻",
      tone: "border-vehicsim-decision bg-vehicsim-decision-bg text-vehicsim-decision",
      block: null,
    },
  ];
  const outcomeNote =
    decision === "ACCEPT"
      ? `Khi chấp nhận: AEB ${r.candidate.label} trở thành bản cơ sở, ${r.baseline.label} được lưu trữ, quyết định được lưu cùng ${r.recommendation_code} · ${r.code}.`
      : decision === "REJECT"
        ? `Khi từ chối: AEB ${r.candidate.label} bị đánh dấu từ chối và ${r.baseline.label} vẫn là bản cơ sở.`
        : decision === "REQUEST_MORE_TESTS"
          ? `Khuyến nghị vẫn mở và ${r.candidate.label} vẫn là ứng viên cho tới khi có quyết định cuối.`
          : "Chọn một quyết định. Chỉ chấp nhận được khi kiểm thử hồi quy đạt.";

  return (
    <VehicSimPage
      step={6}
      crumbs={[
        { label: "Kiểm định" },
        { label: "Khuyến nghị", href: "/validation/recommendations" },
        { label: r.recommendation_code, href: `/validation/recommendations/${r.id}` },
        { label: "Duyệt" },
      ]}
      title={`Duyệt · ${r.recommendation_code}`}
      subtitle="Chấp nhận hoặc từ chối cấu hình AEB được khuyến nghị. Quyết định được ký bằng tài khoản của bạn và lưu cùng kiểm thử hồi quy."
      actions={
        <>
          <PillButton href={`/validation/recommendations/${r.id}`}>Huỷ</PillButton>
          <PillButton variant="dark" onClick={submit} disabled={!ready}>
            {submitting ? "Đang gửi…" : "Gửi quyết định"}
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      {final && <ErrorNote message={`Khuyến nghị này đã có quyết định cuối (${RECOMMENDATION_STATUS[r.recommendation_status].label}).`} />}
      {!canWrite && <ErrorNote message="Tài khoản người xem không được ra quyết định." />}

      <div className="flex w-full items-start gap-4">
        <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
          <h2 className="text-[17px] font-bold text-vehicsim-ink">Danh sách kiểm tra khi duyệt</h2>
          <div className="flex flex-col gap-3">
            {checklist.map((item, i) => (
              <label key={i} className="flex items-center gap-3 text-[14px] text-vehicsim-ink">
                <Checkbox checked={checks[i]} label={`Mục kiểm tra ${i + 1}`} onChange={(v) => setChecks((prev) => prev.map((c, j) => (j === i ? v : c)))} />
                <span>{item}</span>
              </label>
            ))}
          </div>

          <h2 className="pt-2 text-[17px] font-bold text-vehicsim-ink">Quyết định</h2>
          <div className="flex gap-3">
            {options.map((o) => {
              const active = decision === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={!!o.block || final}
                  title={o.block ?? undefined}
                  onClick={() => setDecision(o.key)}
                  className={cx(
                    "flex min-w-0 flex-1 flex-col items-start gap-2 rounded-[16px] border-2 border-solid px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                    active ? o.tone : "border-vehicsim-line bg-white text-vehicsim-ink hover:bg-vehicsim-soft",
                  )}
                >
                  <span className="flex items-center gap-2 text-[16px] font-bold">
                    <span
                      className={cx(
                        "flex size-7 items-center justify-center rounded-full text-[13px]",
                        active ? "bg-current" : "bg-vehicsim-soft",
                      )}
                    >
                      <span className={active ? "text-white" : "text-vehicsim-muted"}>{o.icon}</span>
                    </span>
                    {o.title}
                  </span>
                  <span className="text-[12px] text-vehicsim-muted">{o.block ?? o.detail}</span>
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-vehicsim-muted">Lý do (bắt buộc)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder={
                rates
                  ? `vd. Sửa được ${counts?.fixed ?? 0} kịch bản, ${counts?.regressed ?? 0} ca xấu đi; phanh nhầm ${fmt.pct(rates.false_activation_baseline_pct)} → ${fmt.pct(rates.false_activation_candidate_pct)}…`
                  : "Vì sao chọn quyết định này?"
              }
              className="rounded-[14px] border border-solid border-vehicsim-line-strong px-4 py-3 text-[14px] leading-[1.5] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
            />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[13px] font-medium text-vehicsim-muted">Điều kiện / việc tiếp theo</span>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              maxLength={4000}
              rows={2}
              placeholder="vd. Kiểm định lại trong mưa và ban đêm trước bản phát hành tới."
              className="rounded-[14px] border border-solid border-vehicsim-line-strong px-4 py-3 text-[14px] leading-[1.5] text-vehicsim-ink placeholder:text-vehicsim-faint focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
            />
          </label>
          <p className="flex gap-3 rounded-[14px] bg-vehicsim-decision-bg px-4 py-3 text-[12px] leading-[1.5] text-vehicsim-muted">
            <span className="mt-[6px] size-[6px] shrink-0 rounded-full bg-vehicsim-decision" />
            {outcomeNote}
          </p>
        </section>

        <div className="flex w-[330px] shrink-0 flex-col gap-4">
          <section className="flex flex-col gap-1 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
            <h2 className="mb-2 text-[17px] font-bold text-vehicsim-ink">Tóm tắt {r.recommendation_code}</h2>
            {r.changed_parameters.map((p) => (
              <SummaryRow key={p.code} label={p.name} value={`${paramValue(p.baseline, p.unit)} → ${paramValue(p.candidate, p.unit)}`} cls="text-vehicsim-decision" />
            ))}
            {rates && (
              <>
                <SummaryRow
                  label="Tỉ lệ va chạm"
                  value={`${fmt.pct(rates.collision_baseline_pct)} → ${fmt.pct(rates.collision_candidate_pct)}`}
                  cls={rates.collision_candidate_pct <= rates.collision_baseline_pct ? "text-vehicsim-ok" : "text-vehicsim-danger"}
                />
                <SummaryRow
                  label="Phanh nhầm"
                  value={`${fmt.pct(rates.false_activation_baseline_pct)} → ${fmt.pct(rates.false_activation_candidate_pct)}`}
                  cls={rates.false_activation_candidate_pct <= rates.false_activation_baseline_pct ? "text-vehicsim-ok" : "text-vehicsim-warn"}
                />
              </>
            )}
            <SummaryRow label="Kiểm thử hồi quy" value={r.status === "PASSED" ? "ĐẠT" : r.status === "FAILED" ? "KHÔNG ĐẠT" : r.status} cls={r.status === "PASSED" ? "text-vehicsim-ok" : "text-vehicsim-danger"} />
            <SummaryRow label="Độ bền vững" value="CHƯA CHẠY" cls="text-vehicsim-faint" />
          </section>

          <section className="flex flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Ký duyệt</h2>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-vehicsim-avatar text-[12px] font-bold text-vehicsim-decision">
                {initials(user?.full_name || user?.name || "U")}
              </span>
              <span className="flex flex-col">
                <span className="text-[14px] font-bold text-vehicsim-ink">{user?.full_name || user?.name}</span>
                <span className="text-[12px] text-vehicsim-faint">
                  {ROLE_LABELS[user?.role ?? ""] ?? user?.role} · {fmt.date(new Date().toISOString())}
                </span>
              </span>
            </div>
            <label className="flex items-center gap-3">
              <Toggle on={confirmed} onChange={setConfirmed} label="Xác nhận" disabled={final} />
              <span className="text-[12px] leading-[1.4] text-vehicsim-muted">Tôi xác nhận quyết định này dựa trên bằng chứng mô phỏng ở trên.</span>
            </label>
          </section>
        </div>
      </div>
    </VehicSimPage>
  );
}

function SummaryRow({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-solid border-vehicsim-line py-[9px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("text-right font-bold", cls)}>{value}</span>
    </div>
  );
}
