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
    <section className={cx("rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold text-vehicsim-ink">{children}</h2>
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
    <div className="flex min-w-0 flex-1 flex-col gap-[10px] self-stretch rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
      <span className="text-[13px] font-medium text-vehicsim-muted">{label}</span>
      <span className={cx("text-[34px] font-extrabold tracking-[-0.68px] text-vehicsim-ink", valueClass)}>{value}</span>
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
        "inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] py-[5px] text-[11px] font-semibold",
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
        "inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] py-[5px] font-semibold",
        size === "sm" ? "text-[11px]" : "text-[12px]",
        s.cls,
      )}
    >
      {s.dot ? (
        // eslint-disable-next-line @next/next/no-img-element -- chấm màu SVG từ Figma
        <img alt="" src={s.dot} width={6} height={6} className="size-[6px]" />
      ) : (
        <span className="size-[6px] rounded-full bg-current" />
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
    <span className={cx("inline-flex w-fit items-center whitespace-nowrap rounded-full px-[10px] py-[5px] text-[12px] font-semibold", s.cls)}>
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
    <span className={cx("inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] py-[5px] text-[12px] font-semibold", s.cls)}>
      <span className="size-[6px] rounded-full bg-current" />
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
    <span className={cx("inline-flex w-fit items-center gap-[6px] whitespace-nowrap rounded-full px-[10px] py-[5px] text-[12px] font-semibold", s.cls, className)}>
      <span className="size-[6px] rounded-full bg-current" />
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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    variant === "dark"
      ? "bg-vehicsim-ink text-white hover:bg-black/80"
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
    <label className="relative inline-flex items-center rounded-full border border-solid border-vehicsim-line bg-white px-3 py-[6px] text-[12px] font-medium text-vehicsim-ink hover:bg-vehicsim-soft">
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

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-[15px] font-bold text-vehicsim-ink">{title}</p>
      {children && <div className="max-w-[460px] text-[13px] text-vehicsim-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[16px] border border-solid border-vehicsim-danger/30 bg-vehicsim-danger-bg px-4 py-3 text-[13px] text-vehicsim-danger">
      {message}
    </div>
  );
}

/** Phân trang dạng viên tròn như Figma: ‹ 1 2 3 … 9 ›. */
export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const nums = new Set<number>([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  const btn = "flex size-8 items-center justify-center rounded-[16px] text-[12px] font-semibold";
  return (
    <div className="flex items-center gap-[6px]">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cx(btn, "border border-solid border-vehicsim-line bg-white text-vehicsim-ink disabled:opacity-40")}>
        ‹
      </button>
      {sorted.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - sorted[i - 1] > 1 && <span className={cx(btn, "border border-solid border-vehicsim-line bg-white text-vehicsim-ink")}>…</span>}
          <button
            type="button"
            onClick={() => onPage(n)}
            className={cx(btn, n === page ? "bg-vehicsim-ink text-white" : "border border-solid border-vehicsim-line bg-white text-vehicsim-ink")}
          >
            {n}
          </button>
        </React.Fragment>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cx(btn, "border border-solid border-vehicsim-line bg-white text-vehicsim-ink disabled:opacity-40")}>
        ›
      </button>
    </div>
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
  engineer: "Kỹ sư kiểm định",
  viewer: "Người xem",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "U";
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
