"use client";

import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Card, ErrorNote, PillButton, cx } from "@/components/VehicSimUi";
import { composeDescription } from "@/components/project/journey";
import { ProjectAvatar } from "@/components/project/ProjectUi";
import { ApiError } from "@/services/api";
import type { VehicleOption } from "@/types/vehicsim";

/*
 * Form của project: tạo project 3 bước (Thông tin → Phương tiện → Xác nhận) và cài đặt project.
 * Hai form dùng chung các ô thông tin và thẻ chọn xe; mục tiêu + ghi chú được gộp vào `description`.
 */

const NAME_MAX = 150;
const DESCRIPTION_MAX = 2000;

const GOAL_PRESETS = [
  { label: "Người đi bộ băng ngang", goal: "AEB có phanh kịp khi người đi bộ bất ngờ băng ngang trước xe không?" },
  { label: "Ban đêm", goal: "AEB có phanh kịp khi người đi bộ băng ngang vào ban đêm không?" },
  { label: "Đường ướt", goal: "AEB có dừng kịp trước người đi bộ khi mặt đường ướt không?" },
  { label: "Phanh oan", goal: "AEB có phanh nhầm khi người đi bộ dừng lại ở lề đường không?" },
];

const WIZARD_STEPS = ["Thông tin", "Phương tiện", "Xác nhận"] as const;
type WizardStep = 0 | 1 | 2;

export interface ProjectValues {
  name: string;
  goal: string;
  note: string;
  vehicleId: number | null;
}

const inputCls =
  "w-full rounded-[12px] border border-solid px-[14px] text-[15px] text-vehicsim-ink placeholder:text-vehicsim-muted/70 focus:outline-none focus:ring-2 focus:ring-vehicsim-decision/30";

function length(text: string): number {
  return [...text].length;
}

/** Kiểm tra phía trình duyệt, cùng giới hạn với `ProjectService` (backend vẫn kiểm lại). */
function validate(values: ProjectValues): { name: string | null; description: string | null } {
  const name = values.name.trim();
  return {
    name: !name ? "Đặt tên cho project." : length(name) > NAME_MAX ? `Tên tối đa ${NAME_MAX} ký tự.` : null,
    description: length(composeDescription(values)) > DESCRIPTION_MAX ? `Mục tiêu và ghi chú tối đa ${DESCRIPTION_MAX} ký tự.` : null,
  };
}

/** Lỗi backend gắn với ô nào, theo tiền tố `code` (NAME_, DESCRIPTION_, VEHICLE_). */
function serverFieldError(error: unknown, prefix: string): string | null {
  return error instanceof ApiError && error.code?.startsWith(prefix) ? error.message : null;
}

function generalError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return ["NAME_", "DESCRIPTION_", "VEHICLE_"].some((p) => serverFieldError(error, p)) ? null : error.message;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-3 text-[14px] font-semibold text-vehicsim-ink">
        {label}
        {hint && <span className="text-[13px] font-normal text-vehicsim-muted">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-[13px] text-vehicsim-danger">{error}</span>}
    </label>
  );
}

/** Tên, mục tiêu thử nghiệm (có gợi ý) và ghi chú. */
function InfoFields({
  values,
  onChange,
  nameError,
  descriptionError,
  onNameBlur,
}: {
  values: ProjectValues;
  onChange: (patch: Partial<ProjectValues>) => void;
  nameError: string | null;
  descriptionError: string | null;
  onNameBlur?: () => void;
}) {
  return (
    <>
      <Field label="Tên project" hint={`${length(values.name)} / ${NAME_MAX}`} error={nameError}>
        <input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={onNameBlur}
          maxLength={NAME_MAX}
          autoFocus
          placeholder="vd. Thử AEB ban đêm"
          className={cx(inputCls, "h-[46px]", nameError ? "border-vehicsim-danger" : "border-vehicsim-line-strong")}
        />
      </Field>
      <Field label="Mục tiêu thử nghiệm" hint="Câu hỏi project này cần trả lời">
        <div className="flex flex-wrap gap-2">
          {GOAL_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={values.goal === p.goal}
              onClick={() => onChange({ goal: p.goal })}
              className={cx(
                "rounded-full px-4 py-2 text-[13px] font-semibold",
                values.goal === p.goal ? "bg-vehicsim-ink text-white" : "border border-solid border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          value={values.goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          rows={2}
          placeholder="Chọn gợi ý ở trên hoặc tự viết, vd. AEB có kịp phanh khi…"
          className={cx(inputCls, "border-vehicsim-line-strong py-3 leading-[1.55]")}
        />
      </Field>
      <Field label="Ghi chú thêm" hint="Tuỳ chọn" error={descriptionError}>
        <textarea
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          rows={3}
          placeholder="Điều kiện muốn kiểm, giả định, câu hỏi phụ…"
          className={cx(inputCls, "py-3 leading-[1.55]", descriptionError ? "border-vehicsim-danger" : "border-vehicsim-line-strong")}
        />
      </Field>
    </>
  );
}

function specs(v: VehicleOption): string {
  const out: string[] = [];
  if (v.length_m && v.width_m) out.push(`${v.length_m.toLocaleString("vi-VN")} × ${v.width_m.toLocaleString("vi-VN")} m`);
  if (v.mass_kg) out.push(`${Math.round(v.mass_kg).toLocaleString("vi-VN")} kg`);
  if (v.max_brake_decel_mps2) out.push(`giảm tốc tối đa ${v.max_brake_decel_mps2.toLocaleString("vi-VN")} m/s²`);
  return out.join(" · ") || "Chưa có thông số";
}

/** Thẻ chọn xe kèm thông số thật từ danh mục; khoá lại (kèm lý do) khi project đã có lượt chạy. */
function VehicleCards({
  vehicles,
  value,
  onChange,
  locked,
  error,
}: {
  vehicles: VehicleOption[];
  value: number | null;
  onChange: (id: number) => void;
  locked?: string | null;
  error?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="pb-2 text-[14px] font-semibold text-vehicsim-ink">Xe dùng cho mọi lượt chạy của project</legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-4">
        {vehicles.map((v) => {
          const selected = v.id === value;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!!locked && !selected}
              onClick={() => onChange(v.id)}
              className={cx(
                "flex flex-col gap-2 rounded-[16px] border-2 border-solid p-4 text-left disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "border-vehicsim-ink bg-vehicsim-soft" : "border-vehicsim-line hover:border-vehicsim-line-strong",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[16px] font-bold text-vehicsim-ink">{v.name}</span>
                {v.is_default && <span className="rounded-full bg-vehicsim-decision-bg px-[10px] py-1 text-[12px] font-semibold text-vehicsim-decision">Khuyên dùng</span>}
              </span>
              <span className="text-[13px] leading-[1.5] text-vehicsim-muted">{specs(v)}</span>
            </button>
          );
        })}
      </div>
      {error && <span className="text-[13px] text-vehicsim-danger">{error}</span>}
      <p className="text-[13px] text-vehicsim-muted">{locked ?? "Đổi được xe trong Cài đặt project tới khi có lượt chạy đầu tiên."}</p>
    </fieldset>
  );
}

function Stepper({ step }: { step: WizardStep }) {
  return (
    <ol aria-label="Các bước tạo project" className="flex items-center gap-3">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden className={cx("h-[2px] w-10 rounded-full", i <= step ? "bg-vehicsim-ink" : "bg-vehicsim-line-strong")} />}
          <span
            className={cx(
              "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
              i < step ? "bg-vehicsim-ok text-white" : i === step ? "bg-vehicsim-ink text-white" : "border border-solid border-vehicsim-line-strong text-vehicsim-muted",
            )}
          >
            {i < step ? <Check className="size-4" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cx("text-[14px]", i === step ? "font-bold text-vehicsim-ink" : "font-medium text-vehicsim-muted")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Bước của wizard chứa ô bị backend báo lỗi. */
function stepOfError(error: unknown): WizardStep | null {
  if (serverFieldError(error, "NAME_") || serverFieldError(error, "DESCRIPTION_")) return 0;
  if (serverFieldError(error, "VEHICLE_")) return 1;
  return null;
}

/** Tạo project 3 bước (M1). Chỉ khai báo project; kịch bản bắt đầu sau khi tạo xong. */
export function ProjectWizard({
  vehicles,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  vehicles: VehicleOption[];
  busy: boolean;
  error: unknown;
  onSubmit: (values: ProjectValues) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(0);
  const [touched, setTouched] = useState(false);
  const [values, setValues] = useState<ProjectValues>({
    name: "",
    goal: "",
    note: "",
    vehicleId: (vehicles.find((v) => v.is_default) ?? vehicles[0])?.id ?? null,
  });
  const [shownError, setShownError] = useState<unknown>(null);

  if (error !== shownError) {
    setShownError(error);
    const target = stepOfError(error);
    if (target !== null) setStep(target);
  }

  const invalid = validate(values);
  const vehicle = vehicles.find((v) => v.id === values.vehicleId) ?? null;
  const change = (patch: Partial<ProjectValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      setTouched(true);
      if (!invalid.name && !invalid.description) setStep(1);
    } else if (step === 1) {
      if (vehicle) setStep(2);
    } else if (!busy) {
      onSubmit(values);
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-6">
      <Stepper step={step} />
      <div className="flex w-full items-start gap-6">
        <Card className="flex min-w-0 flex-1 flex-col gap-6 p-7">
          <ErrorNote message={generalError(error)} />

          {step === 0 && (
            <InfoFields
              values={values}
              onChange={change}
              onNameBlur={() => setTouched(true)}
              nameError={(touched ? invalid.name : null) ?? serverFieldError(error, "NAME_")}
              descriptionError={invalid.description ?? serverFieldError(error, "DESCRIPTION_")}
            />
          )}

          {step === 1 && (
            <VehicleCards vehicles={vehicles} value={values.vehicleId} onChange={(id) => change({ vehicleId: id })} error={serverFieldError(error, "VEHICLE_")} />
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[17px] font-bold text-vehicsim-ink">Kiểm tra lại trước khi tạo</h2>
              <dl className="flex flex-col">
                {[
                  ["Tên project", values.name.trim()],
                  ["Mục tiêu", values.goal.trim() || "Chưa ghi"],
                  ["Ghi chú", values.note.trim() || "Không có"],
                  ["Phương tiện", vehicle?.name ?? "—"],
                  ["Cấu hình AEB gốc", "v1.0 · 4 tham số, dùng làm mốc so sánh"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-6 border-b border-solid border-vehicsim-line py-3 text-[14px] last:border-b-0">
                    <dt className="shrink-0 text-vehicsim-muted">{label}</dt>
                    <dd className="whitespace-pre-line text-right font-semibold text-vehicsim-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="rounded-[14px] bg-vehicsim-decision-bg px-4 py-3 text-[14px] text-vehicsim-decision">Tạo xong, bạn sẽ sang bước ① Thiết kế kịch bản.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-solid border-vehicsim-line pt-5">
            {step === 0 ? (
              <PillButton onClick={onCancel} disabled={busy}>
                Huỷ
              </PillButton>
            ) : (
              <PillButton onClick={() => setStep((s) => (s - 1) as WizardStep)} disabled={busy}>
                <ArrowLeft aria-hidden className="size-4" /> Quay lại
              </PillButton>
            )}
            <PillButton type="submit" variant="dark" disabled={busy}>
              {step < 2 ? "Tiếp" : busy ? "Đang tạo…" : "Tạo project"}
              {!busy && <ArrowRight aria-hidden className="size-4" />}
            </PillButton>
          </div>
        </Card>

        <Card className="flex w-[320px] shrink-0 flex-col gap-4 p-6">
          <span className="text-[12px] font-bold uppercase tracking-[0.6px] text-vehicsim-muted">Xem trước</span>
          <div className="flex items-center gap-3">
            <ProjectAvatar id={0} name={values.name.trim() || "?"} />
            <span className="min-w-0 truncate text-[16px] font-bold text-vehicsim-ink">{values.name.trim() || "Tên project"}</span>
          </div>
          <p className="text-[14px] leading-[1.55] text-vehicsim-muted">{values.goal.trim() || "Mục tiêu thử nghiệm sẽ hiện ở đây và trên trang chủ project."}</p>
          <p className="text-[14px] text-vehicsim-ink">
            <span className="text-vehicsim-muted">Xe: </span>
            {vehicle?.name ?? "chưa chọn"}
          </p>
        </Card>
      </div>
    </form>
  );
}

/** Cài đặt project (M8): sửa thông tin và xe trên một trang. */
export function ProjectSettingsForm({
  initial,
  vehicles,
  vehicleLocked,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial: ProjectValues;
  vehicles: VehicleOption[];
  vehicleLocked: string | null;
  busy: boolean;
  error: unknown;
  onSubmit: (values: ProjectValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const invalid = validate(values);
  const change = (patch: Partial<ProjectValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy && !invalid.name && !invalid.description) onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-[880px] flex-col gap-6">
      <ErrorNote message={generalError(error)} />
      <Card className="flex flex-col gap-6 p-7">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">Thông tin</h2>
        <InfoFields
          values={values}
          onChange={change}
          nameError={invalid.name ?? serverFieldError(error, "NAME_")}
          descriptionError={invalid.description ?? serverFieldError(error, "DESCRIPTION_")}
        />
      </Card>
      <Card className="flex flex-col gap-4 p-7">
        <h2 className="text-[17px] font-bold text-vehicsim-ink">Phương tiện</h2>
        <VehicleCards
          vehicles={vehicles}
          value={values.vehicleId}
          onChange={(id) => change({ vehicleId: id })}
          locked={vehicleLocked}
          error={serverFieldError(error, "VEHICLE_")}
        />
      </Card>
      <div className="flex justify-end gap-2">
        <PillButton onClick={onCancel} disabled={busy}>
          Huỷ
        </PillButton>
        <PillButton type="submit" variant="dark" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </PillButton>
      </div>
    </form>
  );
}
