"use client";

import React, { useId, useState } from "react";
import { Check, Lock } from "lucide-react";
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

/** Nhãn gắn đúng ô nhập qua `htmlFor`, để các nút gợi ý nằm cạnh không giành mất nhãn của ô. */
function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-semibold text-vehicsim-ink">
          {label}
        </label>
        {hint && <span className="text-[13px] tabular-nums text-vehicsim-muted">{hint}</span>}
      </div>
      {children}
      {error && (
        <span id={`${id}-error`} className="text-[13px] text-vehicsim-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** Thuộc tính lỗi cho ô nhập: đánh dấu không hợp lệ và trỏ tới dòng lỗi bên dưới. */
function invalidProps(id: string, error: string | null | undefined) {
  return error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}

/** Tên, mục tiêu thử nghiệm (có gợi ý) và ghi chú. */
function InfoFields({
  values,
  onChange,
  nameError,
  descriptionError,
  onNameBlur,
  autoFocusName = true,
}: {
  values: ProjectValues;
  onChange: (patch: Partial<ProjectValues>) => void;
  nameError: string | null;
  descriptionError: string | null;
  onNameBlur?: () => void;
  /** Wizard đưa focus vào ô tên ngay; trang cài đặt thì không, để người dùng đọc trang trước. */
  autoFocusName?: boolean;
}) {
  const id = useId();
  const [nameId, goalId, noteId] = [`${id}-name`, `${id}-goal`, `${id}-note`];
  return (
    <>
      <Field id={nameId} label="Tên project" hint={`${length(values.name)} / ${NAME_MAX}`} error={nameError}>
        <input
          id={nameId}
          name="name"
          autoComplete="off"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={onNameBlur}
          maxLength={NAME_MAX}
          autoFocus={autoFocusName}
          placeholder="vd. Thử AEB ban đêm"
          {...invalidProps(nameId, nameError)}
          className={cx(inputCls, "h-[46px]", nameError ? "border-vehicsim-danger" : "border-vehicsim-line-strong")}
        />
      </Field>
      <Field id={goalId} label="Mục tiêu thử nghiệm" hint="Câu hỏi project này cần trả lời">
        <div role="group" aria-label="Gợi ý mục tiêu" className="flex flex-wrap gap-2">
          {GOAL_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={values.goal === p.goal}
              onClick={() => onChange({ goal: p.goal })}
              className={cx(
                "rounded-full px-4 py-2 text-[13px] font-semibold",
                values.goal === p.goal ? "bg-vehicsim-primary text-white" : "border border-solid border-vehicsim-line-strong text-vehicsim-ink hover:bg-vehicsim-soft",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          id={goalId}
          name="goal"
          value={values.goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          rows={2}
          placeholder="Chọn gợi ý ở trên hoặc tự viết, vd. AEB có kịp phanh khi…"
          className={cx(inputCls, "border-vehicsim-line-strong py-3 leading-[1.55]")}
        />
      </Field>
      <Field id={noteId} label="Ghi chú thêm" hint="Tuỳ chọn" error={descriptionError}>
        <textarea
          id={noteId}
          name="note"
          {...invalidProps(noteId, descriptionError)}
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

/** Thẻ chọn xe kèm thông số thật từ danh mục; khoá lại (kèm lý do) khi project đã có lượt chạy. Radio gốc nên mũi tên đổi được lựa chọn. */
function VehicleCards({
  vehicles,
  value,
  onChange,
  locked,
  error,
  hideLegend,
}: {
  vehicles: VehicleOption[];
  value: number | null;
  onChange: (id: number) => void;
  locked?: string | null;
  error?: string | null;
  /** Trang cài đặt đã có tiêu đề mục bên cạnh nên chỉ giữ chú thích cho trình đọc màn hình. */
  hideLegend?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className={cx("pb-2 text-[14px] font-semibold text-vehicsim-ink", hideLegend && "sr-only")}>Xe dùng cho mọi lượt chạy của project</legend>
      {locked && (
        <p className="flex items-start gap-2 rounded-[12px] bg-vehicsim-soft px-4 py-3 text-[13px] leading-[1.5] text-vehicsim-muted">
          <Lock aria-hidden className="mt-[2px] size-4 shrink-0" />
          {locked}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
        {vehicles.map((v) => {
          const selected = v.id === value;
          return (
            <label
              key={v.id}
              className={cx(
                "relative flex cursor-pointer flex-col gap-2 rounded-[16px] border-2 border-solid p-4 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-vehicsim-decision has-[input:focus-visible]:ring-offset-2 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50",
                selected ? "border-vehicsim-primary bg-vehicsim-soft" : "border-vehicsim-line hover:border-vehicsim-line-strong",
              )}
            >
              <input
                type="radio"
                name={name}
                value={v.id}
                checked={selected}
                disabled={!!locked && !selected}
                onChange={() => onChange(v.id)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 pr-7">
                <span className="text-[16px] font-bold text-vehicsim-ink">{v.name}</span>
                {v.is_default && <span className="rounded-full bg-vehicsim-decision-bg px-[10px] py-1 text-[12px] font-semibold text-vehicsim-decision">Khuyên dùng</span>}
              </span>
              <span className="text-[13px] leading-[1.5] text-vehicsim-muted">{specs(v)}</span>
              <span
                aria-hidden
                className={cx(
                  "absolute right-4 top-4 flex size-5 items-center justify-center rounded-full",
                  selected ? "bg-vehicsim-primary text-white" : "border-2 border-solid border-vehicsim-line-strong bg-vehicsim-surface",
                )}
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>
      {error && <span className="text-[13px] text-vehicsim-danger">{error}</span>}
      {!locked && <p className="text-[13px] text-vehicsim-muted">Đổi được xe trong Cài đặt project tới khi có lượt chạy đầu tiên.</p>}
    </fieldset>
  );
}

function Stepper({ step }: { step: WizardStep }) {
  return (
    <ol aria-label="Các bước tạo project" className="flex items-center gap-3">
      {WIZARD_STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-3">
          {i > 0 && <span aria-hidden className={cx("h-[2px] w-10 rounded-full", i <= step ? "bg-vehicsim-primary" : "bg-vehicsim-line-strong")} />}
          <span
            className={cx(
              "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
              i < step ? "bg-vehicsim-ok text-white" : i === step ? "bg-vehicsim-primary text-white" : "border border-solid border-vehicsim-line-strong text-vehicsim-muted",
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
                Quay lại
              </PillButton>
            )}
            <PillButton type="submit" variant="dark" disabled={busy}>
              {step < 2 ? "Tiếp" : busy ? "Đang tạo…" : "Tạo project"}
              
            </PillButton>
          </div>
        </Card>

        <Card className="flex w-[320px] shrink-0 flex-col gap-4 p-6">
          <span className="text-[12px] font-bold uppercase tracking-[0.6px] text-vehicsim-muted">Xem trước</span>
          <div className="flex items-center gap-3">
            <ProjectAvatar name={values.name.trim() || "?"} />
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

/**
 * Một mục của trang cài đặt: cột trái là tên mục và giải thích, cột phải là các ô.
 * Hai cột chỉ bật khi chính thẻ đủ rộng (container query), hẹp thì xếp chồng.
 */
export function SettingsSection({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description: React.ReactNode;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cx(
        "@container rounded-xl border border-solid bg-vehicsim-surface p-7",
        tone === "danger" ? "border-vehicsim-danger/25" : "border-vehicsim-line",
      )}
    >
      <div className="grid gap-5 @3xl:grid-cols-[220px_minmax(0,1fr)] @3xl:gap-10">
        <div className="flex flex-col gap-2">
          <h2 id={id} className={cx("text-[17px] font-bold leading-[1.3]", tone === "danger" ? "text-vehicsim-danger" : "text-vehicsim-ink")}>
            {title}
          </h2>
          <p className="text-[14px] leading-[1.55] text-pretty text-vehicsim-muted">{description}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </section>
  );
}

function same(a: ProjectValues, b: ProjectValues): boolean {
  return a.name === b.name && a.goal === b.goal && a.note === b.note && a.vehicleId === b.vehicleId;
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
  const dirty = !same(values, initial);
  const change = (patch: Partial<ProjectValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!busy && dirty && !invalid.name && !invalid.description) onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-5">
      <ErrorNote message={generalError(error)} />
      <SettingsSection title="Thông tin" description="Tên và mục tiêu hiện trên thẻ project và trang chủ project. Mục tiêu nên là một câu hỏi AEB cần trả lời.">
        <InfoFields
          values={values}
          onChange={change}
          autoFocusName={false}
          nameError={invalid.name ?? serverFieldError(error, "NAME_")}
          descriptionError={invalid.description ?? serverFieldError(error, "DESCRIPTION_")}
        />
      </SettingsSection>
      <SettingsSection
        title="Phương tiện"
        description="Mọi lượt chạy trong project dùng chung một xe, để so sánh baseline và ứng viên là công bằng."
      >
        <VehicleCards
          vehicles={vehicles}
          value={values.vehicleId}
          onChange={(id) => change({ vehicleId: id })}
          locked={vehicleLocked}
          error={serverFieldError(error, "VEHICLE_")}
          hideLegend
        />
      </SettingsSection>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-solid border-vehicsim-line bg-vehicsim-surface py-3 pl-6 pr-3">
        <span aria-live="polite" className="flex items-center gap-2 text-[13px] font-medium text-vehicsim-muted">
          {dirty ? (
            <>
              <span aria-hidden className="size-2 rounded-full bg-vehicsim-warn" />
              <span className="text-vehicsim-ink">Có thay đổi chưa lưu</span>
            </>
          ) : (
            "Chưa có thay đổi"
          )}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <PillButton onClick={() => setValues(initial)} disabled={busy}>
              Bỏ thay đổi
            </PillButton>
          )}
          {!dirty && (
            <PillButton onClick={onCancel} disabled={busy}>
              Về trang chủ project
            </PillButton>
          )}
          <PillButton type="submit" variant="dark" disabled={busy || !dirty}>
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          </PillButton>
        </div>
      </div>
    </form>
  );
}
