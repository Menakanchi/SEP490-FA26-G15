"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { VehicSimPage } from "@/components/VehicSimPage";
import { Card, ErrorNote, PillButton, StatCard, cx, fmt, paramValue } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { useJourney, useProjectItem } from "@/components/project/ProjectJourneyContext";
import { Modal, OpenProjectCard, TERMS, Term } from "@/components/project/ProjectUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RegressionDetail } from "@/types/vehicsim";

function AdoptDialog({ detail, projectId, onClose }: { detail: RegressionDetail; projectId: number; onClose: () => void }) {
  const router = useRouter();
  const { refresh } = useJourney();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await vehicsimApi.adoptCandidate(projectId, detail.id, reason.trim());
      await refresh();
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đổi được baseline");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Dùng ${detail.candidate.label} làm baseline`} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[14px] leading-[1.55] text-vehicsim-muted">
          {detail.baseline.label} thôi là <Term tip={TERMS.baseline}>baseline</Term>. Vòng sau so sánh mọi ứng viên mới với {detail.candidate.label}; các bước ② – ⑤ bắt đầu lại.
        </p>
        <label className="flex flex-col gap-[6px] text-[14px] font-semibold text-vehicsim-ink">
          Lý do
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="vd. Sửa 6 ca va chạm, không ca nào xấu đi, phanh oan tăng trong giới hạn"
            className="rounded-[12px] border border-solid border-vehicsim-line-strong px-[14px] py-3 text-[14px] font-normal leading-[1.55] text-vehicsim-ink focus:outline-none focus:ring-2 focus:ring-vehicsim-line-strong"
          />
        </label>
        <label className="flex items-start gap-3 text-[14px] leading-[1.5] text-vehicsim-ink">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4" />
          Tôi đã xem kết quả kiểm chứng và hiểu đây là kết quả mô phỏng, không phải chứng nhận an toàn.
        </label>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <PillButton onClick={onClose} disabled={busy}>
            Huỷ
          </PillButton>
          <PillButton type="submit" variant="dark" disabled={busy || !reason.trim() || !confirmed}>
            {busy ? "Đang đổi…" : "Dùng làm baseline"}
          </PillButton>
        </div>
      </form>
    </Modal>
  );
}

export default function ProjectRoundPage() {
  const params = useParams<{ projectId: string; testId: string }>();
  const id = Number(params.projectId);
  const testId = Number(params.testId);
  const { project, opened, error: loadError } = useProjectItem(id);
  const [detail, setDetail] = useState<RegressionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState(false);

  useEffect(() => {
    if (!opened) return;
    vehicsimApi
      .regression(testId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được kết quả kiểm chứng"));
  }, [opened, testId]);

  const d = detail;
  const counts = d?.summary.counts;
  const rates = d?.summary.rates;
  const passed = d?.status === "PASSED";
  const finished = passed || d?.status === "FAILED";
  const adopted = d?.candidate.status === "BASELINE";
  const outdated = !!d && !adopted && d.baseline.status !== "BASELINE";
  const adoptable = passed && !adopted && !outdated && d?.candidate.status === "CANDIDATE" && project?.status === "ACTIVE";
  const failed = (d?.summary.criteria ?? []).filter((c) => c.enabled && !c.passed).map((c) => vi(c.label));
  const changed = (d?.parameter_diff ?? []).filter((p) => p.changed);

  return (
    <VehicSimPage
      crumbs={[
        { label: "Project của tôi", href: "/projects" },
        { label: project?.name ?? "…", href: `/projects/${id}` },
        { label: "Kết luận vòng" },
      ]}
      title={d ? `AEB ${d.baseline.label} → ứng viên ${d.candidate.label}` : "Kết luận vòng"}
      subtitle={d ? `${d.family} · ${d.pass_criteria.scenario_set.variant_count} tình huống chạy lại cùng seed · ${fmt.date(d.created_at)}` : undefined}
    >
      {project && !opened && <OpenProjectCard project={project} purpose="xem kết luận vòng" />}
      <ErrorNote message={error ?? loadError} />

      {d && !finished && (
        <Card className="flex items-center justify-between gap-4 p-5">
          <p className="text-[14px] text-vehicsim-muted">
            {d.status === "ERROR" ? "Lần kiểm chứng gặp lỗi khi chạy, chưa có kết luận." : `Đang kiểm chứng ${d.progress.done}/${d.progress.total} cặp tình huống.`}
          </p>
          <PillButton href={`/validation/regression/${d.id}`}>Xem chi tiết</PillButton>
        </Card>
      )}

      {d && finished && (
        <>
          <div
            className={cx(
              "flex items-center gap-4 rounded-[20px] border border-solid px-5 py-4",
              passed ? "border-vehicsim-ok/30 bg-vehicsim-ok-bg" : "border-vehicsim-danger/30 bg-vehicsim-fail-card",
            )}
          >
            {passed ? <CircleCheck aria-hidden className="size-8 shrink-0 text-vehicsim-ok" /> : <TriangleAlert aria-hidden className="size-8 shrink-0 text-vehicsim-danger" />}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[17px] font-bold text-vehicsim-ink">{passed ? "Ứng viên đạt mọi tiêu chí bắt buộc" : "Ứng viên chưa đạt"}</p>
              <p className="text-[14px] leading-[1.5] text-vehicsim-muted">
                {passed
                  ? `${d.candidate.label} không làm xấu đi tình huống nào trên ${counts?.scenarios ?? 0} cặp. Kết quả mô phỏng, không phải chứng nhận an toàn.`
                  : `Tiêu chí trượt: ${failed.join("; ") || "—"}. Thử một ứng viên khác.`}
              </p>
            </div>
          </div>

          <div className="flex w-full gap-4">
            <StatCard label="Sửa được" value={counts?.fixed ?? "—"} valueClass={counts?.fixed ? "text-vehicsim-ok" : undefined} />
            <StatCard label="Xấu đi" value={counts?.regressed ?? "—"} valueClass={counts?.regressed ? "text-vehicsim-danger" : undefined} />
            <StatCard label="Va chạm mới" value={counts?.new_collisions ?? "—"} valueClass={counts?.new_collisions ? "text-vehicsim-danger" : undefined} />
            <StatCard
              label="Phanh oan (điểm %)"
              value={rates ? fmt.signed(rates.false_activation_candidate_pct - rates.false_activation_baseline_pct, 1) : "—"}
              note={rates ? `${fmt.pct(rates.false_activation_baseline_pct)} → ${fmt.pct(rates.false_activation_candidate_pct)}` : undefined}
            />
          </div>

          <Card className="flex flex-col gap-3 p-6">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Tham số đã đổi</h2>
            {changed.length > 0 ? (
              <ul className="flex flex-col">
                {changed.map((p) => (
                  <li key={p.code} className="flex items-center justify-between gap-6 border-b border-solid border-vehicsim-line py-3 text-[14px] last:border-b-0">
                    <span className="font-semibold text-vehicsim-ink">{p.name}</span>
                    <span className="tabular-nums text-vehicsim-ink">
                      {paramValue(p.baseline, p.unit)} → <strong>{paramValue(p.candidate, p.unit)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-vehicsim-muted">Ứng viên giữ nguyên mọi tham số của baseline.</p>
            )}
          </Card>

          {d.simulator_caveat?.carla && (
            <p className="text-[13px] text-vehicsim-muted">Lần kiểm chứng chạy trên CARLA: phanh chưa hiệu chuẩn, số liệu chỉ để quan sát và đối chiếu.</p>
          )}
          {adopted && <p className="text-[14px] font-semibold text-vehicsim-ok">{d.candidate.label} đã là baseline hiện hành của project.</p>}
          {outdated && (
            <p className="text-[14px] text-vehicsim-muted">
              Baseline đã đổi sau lần kiểm chứng này nên kết luận chỉ để tham khảo; hãy kiểm chứng lại với baseline hiện hành.
            </p>
          )}

          <div className="flex items-center justify-between gap-4 border-t border-solid border-vehicsim-line pt-5">
            <PillButton href={`/validation/regression/${d.id}`}>Xem từng cặp</PillButton>
            <div className="flex gap-2">
              <PillButton variant={adoptable ? "light" : "dark"} href={`/projects/${id}/improve`}>
                Thử ứng viên khác
              </PillButton>
              {adoptable && (
                <PillButton variant="dark" onClick={() => setAdopting(true)}>
                  Dùng {d.candidate.label} làm baseline cho vòng sau 
                </PillButton>
              )}
            </div>
          </div>
        </>
      )}

      {adopting && d && <AdoptDialog detail={d} projectId={id} onClose={() => setAdopting(false)} />}
    </VehicSimPage>
  );
}
