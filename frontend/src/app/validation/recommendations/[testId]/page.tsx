"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, RECOMMENDATION_STATUS, RecommendationBadge, Tag, cx, fmt, paramValue } from "@/components/VehicSimUi";
import { vi } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { ParamDiff, RecommendationDetail } from "@/types/vehicsim";

const CONFIDENCE_PCT = { High: 88, Medium: 58, Low: 26 } as const;
const CONFIDENCE_LABEL = { High: "Cao", Medium: "Trung bình", Low: "Thấp" } as const;

export default function RecommendationPage() {
  const { testId } = useParams<{ testId: string }>();
  const { canWrite } = useVehicSimContext();
  const [r, setR] = useState<RecommendationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vehicsimApi.recommendation(Number(testId))
      .then(setR)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được khuyến nghị"));
  }, [testId]);

  const running = r?.status === "RUNNING" || r?.status === "PENDING";
  const final = r?.review.decision === "ACCEPT" || r?.review.decision === "REJECT";
  const effect = r?.expected_effect;

  return (
    <VehicSimPage
      step={6}
      crumbs={[{ label: "Kiểm định" }, { label: "Khuyến nghị", href: "/validation/recommendations" }, { label: r?.recommendation_code ?? "…" }]}
      title={r?.recommendation_code ?? "Khuyến nghị"}
      badges={r && <RecommendationBadge status={r.recommendation_status} className="px-3 py-[6px] text-[13px]" />}
      subtitle={
        r &&
        `AEB ${r.baseline.label} → ${r.candidate.label} · kiểm thử hồi quy ${r.code} · ${r.family} · tạo ngày ${fmt.date(r.created_at)}`
      }
      actions={
        r && (
          <>
            <PillButton onClick={() => window.print()} className="print:hidden">
              Xuất PDF
            </PillButton>
            <PillButton
              variant="dark"
              href={!final && !running && canWrite ? `/validation/recommendations/${r.id}/review` : undefined}
              disabled={final || running || !canWrite}
              title={!canWrite ? "Tài khoản người xem chỉ có quyền xem" : final ? "Đã có quyết định cuối" : undefined}
              className="print:hidden"
            >
              Duyệt quyết định →
            </PillButton>
          </>
        )
      }
    >
      <ErrorNote message={error} />
      {r && running && (
        <ErrorNote message={`Kiểm thử hồi quy ${r.code} vẫn đang chạy — khuyến nghị sẽ có khi mọi cặp lượt chạy hoàn tất.`} />
      )}
      {r && !running && effect && (
        <div className="flex w-full items-start gap-4">
          <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-[20px] border border-solid border-vehicsim-line bg-white p-6 shadow-vehicsim-card">
            <h2 className="text-[17px] font-bold text-vehicsim-ink">Thay đổi được khuyến nghị</h2>
            <div className="overflow-hidden rounded-[14px] border border-solid border-vehicsim-line">
              <div className="flex h-10 items-center bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
                <span className="min-w-0 flex-1">Tham số</span>
                <span className="w-[110px]">Hiện tại</span>
                <span className="w-[110px]">Ứng viên</span>
                <span className="w-[100px]">Thay đổi</span>
              </div>
              {r.changed_parameters.length === 0 && <p className="px-5 py-4 text-[13px] text-vehicsim-muted">Ứng viên không đổi tham số nào.</p>}
              {r.changed_parameters.map((p) => (
                <div key={p.code} className="flex h-[48px] items-center border-t border-solid border-vehicsim-line px-5 text-[14px]">
                  <span className="min-w-0 flex-1 font-medium text-vehicsim-ink">{p.name}</span>
                  <span className="w-[110px] text-vehicsim-ink">{paramValue(p.baseline, p.unit)}</span>
                  <span className="w-[110px] font-semibold text-vehicsim-decision">{paramValue(p.candidate, p.unit)}</span>
                  <span className="w-[100px]">
                    <Tag tone="info">{delta(p)}</Tag>
                  </span>
                </div>
              ))}
            </div>

            <h2 className="text-[17px] font-bold text-vehicsim-ink">Tác động dự kiến</h2>
            <div className="flex gap-3">
              <Effect label="Tỉ lệ va chạm" pair={effect.collision_rate} unit="%" lowerIsBetter />
              <Effect label="Phanh nhầm" pair={effect.false_activation} unit="%" lowerIsBetter />
              <Effect label="Trung vị TTC nhỏ nhất" pair={effect.median_min_ttc} unit=" s" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] bg-vehicsim-soft px-4 py-3">
                <span className="text-[12px] font-medium text-vehicsim-faint">Kịch bản được sửa / xấu đi</span>
                <span className="text-[17px] font-bold text-vehicsim-ink">
                  <span className="text-vehicsim-ok">+{effect.fixed ?? 0}</span> / <span className={effect.regressed ? "text-vehicsim-danger" : ""}>{effect.regressed ? `−${effect.regressed}` : 0}</span>
                </span>
                <Tag tone={effect.regressed ? "danger" : "ok"}>{effect.regressed ? "có ca xấu đi" : "không ca nào xấu đi"}</Tag>
              </div>
            </div>

            <h2 className="text-[17px] font-bold text-vehicsim-ink">Họ kịch bản bị ảnh hưởng</h2>
            <div className="flex flex-wrap gap-2">
              {(r.summary.families ?? []).map((f) => {
                const tone = f.regressed ? "danger" : f.fixed ? "ok" : "warn";
                const word = f.regressed ? `xấu đi (−${f.regressed})` : f.fixed ? `tốt lên (+${f.fixed})` : "không đổi";
                return (
                  <Tag key={f.scenario_id} tone={tone} className="px-3 py-[6px] text-[12px]">
                    {f.name} · {word}
                  </Tag>
                );
              })}
            </div>

            <h2 className="text-[17px] font-bold text-vehicsim-ink">Đánh đổi đã biết</h2>
            {r.tradeoffs.length ? (
              <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.5] text-vehicsim-ink">
                {r.tradeoffs.map((t) => (
                  <li key={t}>{vi(t)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-vehicsim-muted">Không phát hiện đánh đổi nào trên bộ kịch bản này.</p>
            )}

            <p className="flex gap-3 rounded-[14px] bg-vehicsim-soft px-4 py-3 text-[12px] leading-[1.6] text-vehicsim-muted">
              <span className="mt-[6px] size-[6px] shrink-0 rounded-full bg-vehicsim-faint" />
              Khuyến nghị kỹ thuật dựa trên mô phỏng động học. Không chứng nhận an toàn xe và không thay thế kiểm thử vật lý.
              Cần kỹ sư duyệt trước khi phiên bản hệ thống mới trở thành bản cơ sở.
            </p>
          </section>

          <div className="flex w-[330px] shrink-0 flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
              <h2 className="text-[17px] font-bold text-vehicsim-ink">Bằng chứng</h2>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-vehicsim-muted">Độ tin cậy</span>
                <span className={cx("font-bold", r.confidence === "High" ? "text-vehicsim-ok" : r.confidence === "Medium" ? "text-vehicsim-warn" : "text-vehicsim-danger")}>
                  {CONFIDENCE_LABEL[r.confidence]}
                </span>
              </div>
              <div className="h-[6px] w-full rounded-[3px] bg-vehicsim-line">
                <div
                  className={cx("h-[6px] rounded-[3px]", r.confidence === "High" ? "bg-vehicsim-ok" : r.confidence === "Medium" ? "bg-vehicsim-amber" : "bg-vehicsim-danger")}
                  style={{ width: `${CONFIDENCE_PCT[r.confidence]}%` }}
                />
              </div>
              {r.evidence.map((e) => {
                const body = (
                  <>
                    <span
                      className={cx(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                        e.status === "PASS" ? "bg-vehicsim-ok text-white" : e.status === "FAIL" ? "bg-vehicsim-danger text-white" : "bg-vehicsim-line text-vehicsim-faint",
                      )}
                    >
                      {e.status === "PASS" ? "✓" : e.status === "FAIL" ? "!" : "–"}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cx("text-[13px] font-semibold", e.status === "NOT_RUN" ? "text-vehicsim-faint" : "text-vehicsim-ink")}>{vi(e.title)}</span>
                      <span className="text-[11px] text-vehicsim-faint">
                        {e.status === "NOT_RUN" ? "CHƯA CHẠY" : e.status === "PASS" ? "ĐẠT" : "KHÔNG ĐẠT"} · {vi(e.detail)}
                      </span>
                    </span>
                  </>
                );
                return e.key === "regression" ? (
                  <Link key={e.key} href={`/validation/regression/${r.id}`} className="flex items-center gap-3 rounded-[14px] bg-vehicsim-soft px-3 py-3 hover:bg-vehicsim-line">
                    {body}
                    <span className="text-[14px] font-bold text-vehicsim-decision">→</span>
                  </Link>
                ) : (
                  <div key={e.key} className="flex items-center gap-3 rounded-[14px] bg-vehicsim-soft px-3 py-3" title="Chưa có trong MVP">
                    {body}
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-1 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
              <h2 className="mb-2 text-[17px] font-bold text-vehicsim-ink">Duyệt</h2>
              <Row label="Người yêu cầu" value={r.review.requested_by ?? "—"} />
              <Row label="Quyết định" value={RECOMMENDATION_STATUS[r.recommendation_status].label} />
              {r.review.reviewed_by && <Row label="Người duyệt" value={r.review.reviewed_by} />}
              {r.review.reviewed_at && <Row label="Ngày duyệt" value={fmt.date(r.review.reviewed_at)} />}
              {r.review.note && <Block label="Lý do" text={r.review.note} />}
              {r.review.conditions && <Block label="Điều kiện / việc tiếp theo" text={r.review.conditions} />}
              {!r.review.reviewed_by && (
                <p className="pt-2 text-[12px] text-vehicsim-muted">
                  {r.recommendation_status === "BLOCKED"
                    ? "Kiểm thử hồi quy không đạt — ứng viên chỉ có thể bị từ chối hoặc trả lại để kiểm thử thêm."
                    : "Đang chờ kỹ sư quyết định."}
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </VehicSimPage>
  );
}

function delta(p: ParamDiff): string {
  if (p.baseline === undefined || p.candidate === undefined) return "—";
  const d = Math.round((p.candidate - p.baseline) * 1000) / 1000;
  const unit = p.unit === "ratio" ? "" : p.unit === "m/s2" ? " m/s²" : p.unit === "m/s3" ? " m/s³" : ` ${p.unit}`;
  return `${d > 0 ? "+" : ""}${fmt.num(d, 3)}${unit}`;
}

function Effect({ label, pair, unit, lowerIsBetter }: { label: string; pair: [number | null, number | null]; unit: string; lowerIsBetter?: boolean }) {
  const [a, b] = pair;
  const diff = a === null || b === null ? null : b - a;
  const good = diff === null || Math.abs(diff) < 1e-9 ? null : lowerIsBetter ? diff < 0 : diff > 0;
  const show = (v: number | null) => (v === null ? "—" : `${v.toFixed(unit === "%" ? 1 : 2)}${unit}`);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] bg-vehicsim-soft px-4 py-3">
      <span className="text-[12px] font-medium text-vehicsim-faint">{label}</span>
      <span className="text-[17px] font-bold text-vehicsim-ink">
        {show(a)} → {show(b)}
      </span>
      <Tag tone={good === null ? "neutral" : good ? "ok" : "warn"}>
        {diff === null ? "—" : `${diff > 0 ? "↑" : diff < 0 ? "↓" : ""}${Math.abs(diff).toFixed(unit === "%" ? 1 : 2)}${unit === "%" ? " điểm %" : unit}`}
      </Tag>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-solid border-vehicsim-line py-[9px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className="font-bold text-vehicsim-ink">{value}</span>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-solid border-vehicsim-line py-[9px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className="whitespace-pre-wrap text-vehicsim-ink">{text}</span>
    </div>
  );
}
