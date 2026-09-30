"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { Checkbox, ErrorNote, PillButton, Tag, Toggle, cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { RegressionPreview } from "@/types/vehicsim";

/** Khớp `DEFAULT_CRITERIA` / `CRITERIA_LABELS` trong src/services/vehicsim/regression.py. */
const CRITERIA = [
  { key: "no_new_collision", label: "Không kịch bản an toàn nào được chuyển thành va chạm", required: true },
  { key: "collision_rate_not_increase", label: "Tỉ lệ va chạm không được tăng", required: false },
  { key: "false_activation_increase_max_pts", label: "Tỉ lệ phanh nhầm tăng tối đa", required: false, value: 0.5, unit: "điểm %", step: 0.1 },
  { key: "median_min_ttc_change_min_s", label: "Trung vị TTC nhỏ nhất thay đổi ít nhất", required: false, value: -0.1, unit: "s", step: 0.05 },
  { key: "identical_seeds", label: "Dùng cùng seed ngẫu nhiên cho cả hai phiên bản", required: true },
] as const;

type CriterionState = Record<string, { enabled: boolean; value?: number }>;

const initialCriteria = (): CriterionState =>
  Object.fromEntries(CRITERIA.map((c) => [c.key, { enabled: true, value: "value" in c ? c.value : undefined }]));

export default function NewRegressionPage() {
  return (
    <Suspense>
      <NewRegressionForm />
    </Suspense>
  );
}

function NewRegressionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { ctx, canWrite } = useVehicSimContext();
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [oldCritical, setOldCritical] = useState(true);
  const [allVariants, setAllVariants] = useState(true);
  const [criteria, setCriteria] = useState<CriterionState>(initialCriteria);
  const [preview, setPreview] = useState<RegressionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseline = ctx?.system.baseline ?? null;
  const candidates = useMemo(() => (ctx?.versions ?? []).filter((v) => v.status === "CANDIDATE"), [ctx]);
  const candidate = candidates.find((v) => v.id === candidateId) ?? null;
  const familyName = ctx?.families.find((f) => f.id === scenarioId)?.name ?? "—";

  // Chọn sẵn candidate (từ ?candidate= của trang AEB) và họ kịch bản đầu tiên.
  useEffect(() => {
    if (!ctx) return;
    const wanted = Number(params.get("candidate"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- giá trị mặc định khi ngữ cảnh vừa tải xong
    setCandidateId((cur) => cur ?? (candidates.find((v) => v.id === wanted) ?? candidates[0])?.id ?? null);
    setScenarioId((cur) => cur ?? ctx.families[0]?.id ?? null);
  }, [ctx, candidates, params]);

  useEffect(() => {
    if (scenarioId === null) return;
    vehicsimApi.regressionPreview(scenarioId)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được số liệu bộ kịch bản"));
  }, [scenarioId]);

  const scenarios = !preview ? 0 : allVariants ? preview.variant_count : oldCritical ? preview.old_critical_count : 0;
  const extraBaseline = preview && allVariants ? Math.max(0, preview.variant_count - preview.baseline_runs_existing) : 0;
  const simulations = scenarios + extraBaseline;
  const ready = canWrite && !!candidate && !!baseline && scenarioId !== null && scenarios > 0 && !submitting;

  const submit = async () => {
    if (!ready || !candidate || scenarioId === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await vehicsimApi.createRegression({
        candidate_version_id: candidate.id,
        scenario_id: scenarioId,
        include_old_critical: oldCritical,
        include_all_variants: allVariants,
        criteria: Object.fromEntries(
          CRITERIA.map((c) => [c.key, { enabled: criteria[c.key].enabled, ...(criteria[c.key].value !== undefined ? { value: criteria[c.key].value } : {}) }]),
        ),
        name: `${familyName} · ứng viên ${candidate.label}${candidate.notes ? ` · ${candidate.notes}` : ""}`.slice(0, 150),
      });
      router.push(`/validation/regression/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được kiểm thử hồi quy");
      setSubmitting(false);
    }
  };

  return (
    <VehicSimPage
      step={5}
      crumbs={[{ label: "Kiểm định" }, { label: "Kiểm thử hồi quy", href: "/validation/regression" }, { label: "Kiểm thử mới" }]}
      title="Tạo kiểm thử hồi quy"
      subtitle="Chạy lại các kịch bản nguy hiểm cũ và các biến thể trên cả hai phiên bản trước khi ứng viên được khuyến nghị."
      actions={
        <>
          <PillButton href="/validation/regression">Huỷ</PillButton>
          <PillButton variant="dark" onClick={submit} disabled={!ready} title={canWrite ? undefined : "Tài khoản người xem chỉ có quyền xem"}>
            {submitting ? "Đang khởi chạy…" : "Chạy kiểm thử hồi quy"}
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="flex w-full items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <FormCard title="Phiên bản">
            <div className="flex items-end gap-3">
              <Field label="Bản cơ sở (cũ)">
                <div className="flex h-[42px] items-center rounded-[12px] border border-solid border-vehicsim-line-strong bg-vehicsim-soft px-[14px] text-[14px] font-medium text-vehicsim-ink">
                  {baseline ? `AEB ${baseline.label} · bản cơ sở` : "Chưa có bản cơ sở"}
                </div>
              </Field>
              <span className="mb-[3px] flex size-9 shrink-0 items-center justify-center rounded-full bg-vehicsim-soft text-[14px] font-bold text-vehicsim-ink">→</span>
              <Field label="Ứng viên (mới)">
                <select
                  value={candidateId ?? ""}
                  onChange={(e) => setCandidateId(e.target.value ? Number(e.target.value) : null)}
                  className="h-[42px] w-full rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] font-medium text-vehicsim-ink"
                >
                  {candidates.length === 0 && <option value="">Chưa có phiên bản ứng viên</option>}
                  {candidates.map((v) => (
                    <option key={v.id} value={v.id}>
                      AEB {v.label}
                      {v.notes ? ` · ${v.notes}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {ctx && candidates.length === 0 && (
              <p className="text-[12px] text-vehicsim-muted">
                Chưa có phiên bản ứng viên. Tạo một cấu hình ứng viên ở{" "}
                <Link href="/aeb" className="font-semibold text-vehicsim-ink underline">
                  AEB
                </Link>{" "}
                trước.
              </p>
            )}
          </FormCard>

          <FormCard
            title="Bộ kịch bản"
            aside={<span className="rounded-full bg-vehicsim-soft px-[10px] py-[5px] text-[12px] font-semibold text-vehicsim-ink">{scenarios} kịch bản</span>}
          >
            <Field label="Họ kịch bản">
              <select
                value={scenarioId ?? ""}
                onChange={(e) => {
                  setPreview(null);
                  setScenarioId(e.target.value ? Number(e.target.value) : null);
                }}
                className="h-[42px] w-full rounded-[12px] border border-solid border-vehicsim-line-strong bg-white px-[14px] text-[14px] font-medium text-vehicsim-ink"
              >
                {(ctx?.families ?? []).length === 0 && <option value="">Chưa có họ kịch bản</option>}
                {ctx?.families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <SetOption
              checked={oldCritical}
              onChange={setOldCritical}
              title="Kịch bản nguy hiểm cũ"
              detail={`Mọi biến thể mà ${baseline ? `AEB ${baseline.label}` : "bản cơ sở"} từng lỗi hoặc suýt va chạm`}
              tag="Ca lỗi"
              count={preview?.old_critical_count}
            />
            <SetOption
              checked={allVariants}
              onChange={setAllVariants}
              title="Toàn bộ biến thể của họ"
              detail={`Mọi biến thể đã sinh của ${familyName}, gồm cả ca nguy hiểm · cùng seed với các lượt chạy cơ sở`}
              tag="Họ kịch bản"
              count={preview?.variant_count}
            />
            <SetOption
              checked={false}
              disabled
              title="Kịch bản mới sinh"
              detail="Vùng rủi ro cao theo active learning — có khi phần Tối ưu hoá (FE-13) hoàn thành"
              tag="Bộ sinh kịch bản"
            />
          </FormCard>

          <FormCard title="Tiêu chí đạt">
            <div className="flex flex-col">
              {CRITERIA.map((c) => {
                const state = criteria[c.key];
                return (
                  <div key={c.key} className="flex min-h-[52px] items-center gap-3 border-b border-solid border-vehicsim-line py-2 last:border-b-0">
                    <Toggle
                      on={state.enabled}
                      disabled={c.required}
                      label={c.label}
                      onChange={(on) => setCriteria((prev) => ({ ...prev, [c.key]: { ...prev[c.key], enabled: on } }))}
                    />
                    <span className={cx("flex-1 text-[14px] font-medium", state.enabled ? "text-vehicsim-ink" : "text-vehicsim-faint")}>{c.label}</span>
                    {c.required && <Tag tone="danger">Bắt buộc</Tag>}
                    {"unit" in c && (
                      <label className="flex h-9 w-[96px] items-center gap-1 rounded-[10px] border border-solid border-vehicsim-line-strong px-3">
                        <input
                          type="number"
                          step={c.step}
                          value={state.value ?? ""}
                          disabled={!state.enabled}
                          aria-label={c.label}
                          onChange={(e) =>
                            setCriteria((prev) => ({
                              ...prev,
                              [c.key]: { ...prev[c.key], value: e.target.value === "" ? undefined : Number(e.target.value) },
                            }))
                          }
                          className="w-full min-w-0 bg-transparent text-[13px] font-semibold text-vehicsim-ink focus:outline-none disabled:text-vehicsim-faint"
                        />
                        <span className="text-[12px] font-medium text-vehicsim-muted">{c.unit}</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </FormCard>
        </div>

        <aside className="flex w-[330px] shrink-0 flex-col gap-3 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
          <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-vehicsim-faint">Tóm tắt lượt chạy</span>
          <SummaryRow label="Phiên bản" value={baseline && candidate ? `${baseline.label} → ${candidate.label}` : "—"} />
          <SummaryRow label="Kịch bản" value={String(scenarios)} />
          <SummaryRow
            label="Số lượt mô phỏng"
            value={
              extraBaseline > 0 ? `${simulations} (${scenarios} + ${extraBaseline} cơ sở)` : `${simulations} (${scenarios} ứng viên)`
            }
          />
          <SummaryRow label="Lượt chạy cơ sở dùng lại" value={preview ? String(Math.min(scenarios, preview.baseline_runs_existing)) : "—"} />
          <SummaryRow label="Bộ mô phỏng" value="Động học 1.0 · Celery" />
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[13px] font-medium text-vehicsim-muted">Theo họ kịch bản</span>
            <div className="flex items-center justify-between text-[13px] font-medium text-vehicsim-ink">
              <span>{familyName}</span>
              <span className="font-bold">{scenarios}</span>
            </div>
            <div className="h-[5px] w-full rounded-[3px] bg-vehicsim-line">
              <div className="h-[5px] rounded-[3px] bg-vehicsim-ink" style={{ width: scenarios ? "100%" : "0%" }} />
            </div>
            {preview && (
              <div className="flex items-center justify-between text-[12px] text-vehicsim-muted">
                <span>trong đó ca nguy hiểm cũ</span>
                <span className="font-semibold text-vehicsim-ink">{Math.min(preview.old_critical_count, scenarios)}</span>
              </div>
            )}
          </div>
          <p className="mt-2 flex gap-2 rounded-[12px] bg-vehicsim-decision-bg px-4 py-3 text-[12px] leading-[1.5] text-vehicsim-muted">
            <span className="mt-[6px] size-[6px] shrink-0 rounded-full bg-vehicsim-decision" />
            Ứng viên trượt một tiêu chí bắt buộc sẽ tự động bị chặn khỏi khuyến nghị. Bản cơ sở và ứng viên luôn chạy mỗi biến thể với
            cùng một seed ngẫu nhiên.
          </p>
        </aside>
      </div>
    </VehicSimPage>
  );
}

function FormCard({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex w-full flex-col gap-4 rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 shadow-vehicsim-card">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      {children}
    </div>
  );
}

function SetOption({
  checked,
  onChange,
  disabled,
  title,
  detail,
  tag,
  count,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  detail: string;
  tag: string;
  count?: number;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-[14px] border border-solid px-4 py-3",
        checked ? "border-vehicsim-ink" : "border-vehicsim-line",
        disabled && "opacity-50",
      )}
      title={disabled ? "Chưa có trong MVP" : undefined}
    >
      {disabled ? <span className="size-4 shrink-0 rounded-[4px] border border-solid border-vehicsim-check" /> : <Checkbox checked={checked} label={title} onChange={(v) => onChange?.(v)} />}
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[14px] font-semibold text-vehicsim-ink">{title}</span>
        <span className="text-[12px] text-vehicsim-faint">{detail}</span>
      </span>
      <Tag>{tag}</Tag>
      <span className="w-12 text-right text-[22px] font-extrabold text-vehicsim-ink">{count ?? "—"}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-solid border-vehicsim-line py-[9px] text-[13px]">
      <span className="font-medium text-vehicsim-muted">{label}</span>
      <span className="text-right font-bold text-vehicsim-ink">{value}</span>
    </div>
  );
}
