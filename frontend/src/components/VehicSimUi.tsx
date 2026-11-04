"use client";

/**
 * Thành phần giao diện VehicSim dùng chung, dựng theo Figma FE-12/13/14.
 * Màu lấy từ token `--color-vehicsim-*` trong globals.css.
 */

import React from "react";
import Link from "next/link";
import type { FailureClass, Outcome, OutcomeKey, RecommendationStatus, RegressionStatus } from "@/types/vehicsim";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Khối & thẻ
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-solid border-vehicsim-line bg-white shadow-2xs", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold text-vehicsim-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  tone = "neutral",
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "danger" | "warn" | "ok" | "neutral" | "info";
  valueClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[10px] self-stretch rounded-lg border border-solid border-vehicsim-line bg-white p-4 shadow-2xs">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("text-[26px] font-extrabold tracking-tight tabular-nums text-vehicsim-ink", valueClass)}>{value}</span>
      {note !== undefined && note !== null && <Tag tone={tone}>{note}</Tag>}
    </div>
  );
}

const TONES = {
  danger: "bg-vehicsim-danger-bg text-vehicsim-danger",
  warn: "bg-vehicsim-warn-bg text-vehicsim-warn",
  ok: "bg-vehicsim-ok-bg text-vehicsim-ok",
  info: "bg-vehicsim-decision-bg text-vehicsim-decision",
  neutral: "bg-vehicsim-soft text-vehicsim-muted",
  dark: "bg-vehicsim-ink text-white",
} as const;

export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium leading-normal",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Badge kết quả / nhóm lỗi / trạng thái
// ---------------------------------------------------------------------------

const OUTCOME_STYLE: Record<Outcome, { label: string; cls: string; dot: string }> = {
  COLLISION: { label: "Va chạm", cls: "bg-vehicsim-danger-bg text-vehicsim-danger", dot: "/vehicsim/dot-collision.svg" },
  NEAR_MISS: { label: "Suýt va chạm", cls: "bg-vehicsim-warn-bg text-vehicsim-warn", dot: "/vehicsim/dot-nearmiss.svg" },
  FALSE_BRAKING: { label: "Phanh nhầm", cls: "bg-vehicsim-control-bg text-vehicsim-control", dot: "/vehicsim/dot-control.svg" },
  SAFE: { label: "An toàn", cls: "bg-vehicsim-ok-bg text-vehicsim-ok", dot: "" },
};

export function OutcomeBadge({ outcome, size = "md" }: { outcome: Outcome | OutcomeKey; size?: "sm" | "md" }) {
  const s = OUTCOME_STYLE[outcome];
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded px-2 py-0.5 font-medium leading-normal",
        size === "sm" ? "text-[11px]" : "text-[12px]",
        s.cls,
      )}
    >
      {s.dot ? (
        // eslint-disable-next-line @next/next/no-img-element -- chấm màu SVG từ Figma
        <img alt="" src={s.dot} width={6} height={6} className="size-[6px]" />
      ) : (
        <span className="size-[6px] rounded-sm bg-current" />
      )}
      {s.label}
    </span>
  );
}

export const CLASS_STYLE: Record<FailureClass, { label: string; cls: string; bar: string; dot: string }> = {
  PERCEPTION: { label: "Nhận thức", cls: "bg-vehicsim-perception-bg text-vehicsim-perception", bar: "bg-vehicsim-perception", dot: "/vehicsim/dot-perception.svg" },
  DECISION: { label: "Quyết định", cls: "bg-vehicsim-decision-bg text-vehicsim-decision", bar: "bg-vehicsim-decision", dot: "/vehicsim/dot-decision.svg" },
  CONTROL: { label: "Điều khiển", cls: "bg-vehicsim-control-bg text-vehicsim-control", bar: "bg-vehicsim-control", dot: "/vehicsim/dot-control.svg" },
  VEHICLE_DYNAMICS: { label: "Động lực học", cls: "bg-vehicsim-dynamics-bg text-vehicsim-dynamics", bar: "bg-vehicsim-dynamics", dot: "/vehicsim/dot-dynamics.svg" },
};

export function ClassBadge({ value }: { value: FailureClass | null }) {
  if (!value) return <Tag>Biên an toàn</Tag>;
  const s = CLASS_STYLE[value];
  return (
    <span className={cx("inline-flex w-fit items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium leading-normal", s.cls)}>
      {s.label}
    </span>
  );
}

export const REGRESSION_STATUS: Record<RegressionStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ chạy", cls: "bg-vehicsim-soft text-vehicsim-muted" },
  RUNNING: { label: "Đang chạy", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" },
  PASSED: { label: "Đạt", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" },
  FAILED: { label: "Không đạt", cls: "bg-vehicsim-danger-bg text-vehicsim-danger" },
  ERROR: { label: "Lỗi", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" },
};

export function StatusBadge({ status, suffix }: { status: RegressionStatus; suffix?: string }) {
  const s = REGRESSION_STATUS[status];
  return (
    <span className={cx("inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium leading-normal", s.cls)}>
      <span className="size-[6px] rounded-sm bg-current" />
      {s.label}
      {suffix}
    </span>
  );
}

export const RECOMMENDATION_STATUS: Record<RecommendationStatus, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-vehicsim-warn-bg text-vehicsim-warn" },
  ACCEPT: { label: "Đã chấp nhận", cls: "bg-vehicsim-ok-bg text-vehicsim-ok" },
  REJECT: { label: "Đã từ chối", cls: "bg-vehicsim-soft text-vehicsim-muted" },
  REQUEST_MORE_TESTS: { label: "Yêu cầu thêm kiểm thử", cls: "bg-vehicsim-decision-bg text-vehicsim-decision" },
  BLOCKED: { label: "Bị chặn", cls: "bg-vehicsim-danger-bg text-vehicsim-danger" },
};

export function RecommendationBadge({ status, className }: { status: RecommendationStatus; className?: string }) {
  const s = RECOMMENDATION_STATUS[status];
  return (
    <span className={cx("inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium leading-normal", s.cls, className)}>
      <span className="size-[6px] rounded-sm bg-current" />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Nút & ô nhập
// ---------------------------------------------------------------------------

type ButtonProps = {
  variant?: "dark" | "light";
  href?: string;
  children: React.ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function PillButton({ variant = "light", href, children, className, ...rest }: ButtonProps) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-medium transition shadow-2xs disabled:cursor-not-allowed disabled:opacity-50",
    variant === "dark"
      ? "bg-vehicsim-ink text-white hover:bg-neutral-800"
      : "border border-solid border-vehicsim-line-strong bg-white text-vehicsim-ink hover:bg-vehicsim-soft",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (value: T | "") => void;
}) {
  return (
    <label className="relative inline-flex items-center rounded-md border border-solid border-vehicsim-line bg-white px-2.5 py-1 text-[12px] font-medium text-vehicsim-ink hover:bg-vehicsim-soft">
      <span>
        {label}: {options.find((o) => o.value === value)?.label ?? "Tất cả"} ▾
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Tất cả</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold text-white",
        checked ? "bg-vehicsim-ink" : "border border-solid border-vehicsim-check bg-white",
      )}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition disabled:cursor-not-allowed",
        on ? "bg-vehicsim-ink" : "bg-vehicsim-line-strong",
      )}
    >
      <span className={cx("absolute top-[3px] size-4 rounded-full bg-white transition-all", on ? "left-[19px]" : "left-[3px]")} />
    </button>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] font-bold text-vehicsim-ink">{title}</p>
      {children && <div className="max-w-[460px] text-[13px] leading-[1.5] text-vehicsim-muted">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-3.5 py-2 text-[12px] font-medium text-vehicsim-danger">
      {message}
    </div>
  );
}

/** Phân trang dạng viên tròn như Figma: ‹ 1 2 3 … 9 ›. */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const nums = new Set<number>([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  const btn = "flex size-7 items-center justify-center rounded-md text-[12px] font-medium";
  const idle = "border border-solid border-vehicsim-line bg-white text-vehicsim-ink hover:bg-vehicsim-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";
  return (
    <nav aria-label="Phân trang" className="flex items-center gap-[6px]">
      <button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cx(btn, idle)}>
        <span aria-hidden>‹</span>
      </button>
      {sorted.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - sorted[i - 1] > 1 && (
            <span aria-hidden className={cx(btn, "text-vehicsim-muted")}>
              …
            </span>
          )}
          <button
            type="button"
            aria-label={`Trang ${n}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={cx(btn, "tabular-nums", n === page ? "bg-vehicsim-ink text-white" : idle)}
          >
            {n}
          </button>
        </React.Fragment>
      ))}
      <button type="button" aria-label="Trang sau" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cx(btn, idle)}>
        <span aria-hidden>›</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Định dạng số
// ---------------------------------------------------------------------------

export const fmt = {
  s: (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)} s`),
  kmh: (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(1)} km/h`),
  m: (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)} m`),
  pct: (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`),
  num: (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? "—" : v.toFixed(digits).replace(/\.?0+$/, "")),
  date: (iso: string | null | undefined) =>
    iso ? new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
  signed: (v: number | null | undefined, digits = 1, unit = "") =>
    v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`,
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  manager: "Quản lý workspace",
  engineer: "Kỹ sư",
  reviewer: "Người duyệt",
  experience: "Người trải nghiệm (EXP)",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "U";
}

/** Định danh bộ mô phỏng → nhãn cho người dùng; luôn kèm định danh gốc để đối chiếu với run đã lưu. */
export function simulatorLabel(simulator: string | null | undefined): string {
  if (!simulator) return "—";
  if (simulator.startsWith("vehicsim-kinematic")) return `Bộ động học (${simulator})`;
  const carla = simulator.match(/^carla-(\d+\.\d+\.\d+)(-xosc\d+)?$/);
  if (carla) return `CARLA ${carla[1]}${carla[2] ? " · OpenSCENARIO" : " · runner cũ"} (${simulator})`;
  return simulator;
}

/** Mã run hiển thị như Figma: #1023. */
export function runCode(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

/** Hiển thị giá trị tham số AEB theo đơn vị. */
export function paramValue(value: number | undefined, unit: string): string {
  if (value === undefined) return "—";
  const u = unit === "ratio" ? "" : unit === "m/s2" ? " m/s²" : unit === "m/s3" ? " m/s³" : ` ${unit}`;
  return `${fmt.num(value)}${u}`;
}
