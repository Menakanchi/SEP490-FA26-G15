import React, { useEffect, useState } from "react";
import { cx } from "@/components/VehicSimUi";
import { vehicsimApi } from "@/services/vehicsim";
import type { ScenarioCategory } from "@/types/vehicsim";

/**
 * 7 nhóm kịch bản Euro NCAP (`scenarios.category`, `ScenarioRules.CATEGORIES` ở backend). Nhóm nào chạy được lấy từ
 * `GET /scenario-categories` (ADR-050); `supported` dưới đây chỉ là giá trị dự phòng khi chưa tải được danh mục.
 */
export const SCENARIO_CATEGORIES: { code: ScenarioCategory; label: string; protocol: string; supported: boolean }[] = [
  { code: "CP_CROSSING", label: "Người đi bộ băng ngang", protocol: "CPFA / CPNA", supported: true },
  { code: "CCRS", label: "Xe phía trước đứng yên", protocol: "CCRs", supported: true },
  { code: "CCRM", label: "Xe phía trước chạy chậm", protocol: "CCRm", supported: true },
  { code: "CCRB", label: "Xe phía trước phanh gấp", protocol: "CCRb", supported: true },
  { code: "CPLA", label: "Người đi bộ đi dọc cùng chiều", protocol: "CPLA", supported: false },
  { code: "TURNING", label: "Xe rẽ cắt hướng", protocol: "CCFtap / CPTA", supported: false },
  { code: "CUT_IN", label: "Xe cắt vào làn", protocol: "Cut-in", supported: false },
];

const UNSUPPORTED_HINT = "Chưa hỗ trợ: chưa có bộ mô phỏng cho loại này (TD-42).";
const KINEMATIC_ONLY_HINT = "Chạy trên bộ động học; CARLA chưa hỗ trợ loại này (ADR-050).";

/** Chọn loại kịch bản; loại chưa có bộ mô phỏng hiện mờ. `locked` = sửa họ đã có (một họ một category). */
export function ScenarioCategoryPicker({
  value = "CP_CROSSING",
  onChange,
  locked = false,
}: {
  value?: ScenarioCategory;
  onChange?: (code: ScenarioCategory) => void;
  locked?: boolean;
}) {
  const [catalog, setCatalog] = useState<Record<string, { supported: boolean; carla: boolean }> | null>(null);

  useEffect(() => {
    let alive = true;
    vehicsimApi
      .scenarioCategories()
      .then((rows) => {
        if (alive) setCatalog(Object.fromEntries(rows.map((r) => [r.code, { supported: r.supported, carla: r.simulators.includes("CARLA") }])));
      })
      .catch(() => undefined); // không tải được thì dùng giá trị dự phòng
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-[6px]" role="group" aria-label="Loại kịch bản (Euro NCAP)">
      <span className="text-[13px] font-medium text-vehicsim-muted">Loại kịch bản (Euro NCAP)</span>
      <div className="flex flex-wrap gap-2">
        {SCENARIO_CATEGORIES.map((c) => {
          const on = c.code === value;
          const supported = catalog?.[c.code]?.supported ?? c.supported;
          const carla = catalog?.[c.code]?.carla ?? c.code === "CP_CROSSING";
          const disabled = !supported || (locked && !on) || !onChange;
          return (
            <button
              key={c.code}
              type="button"
              data-category={c.code}
              aria-pressed={on}
              disabled={disabled && !on}
              onClick={() => !disabled && onChange?.(c.code)}
              title={!supported ? UNSUPPORTED_HINT : carla ? `${c.label} (${c.protocol})` : `${c.label} (${c.protocol}) — ${KINEMATIC_ONLY_HINT}`}
              className={cx(
                "flex items-center gap-2 rounded-full border border-solid px-3 py-[7px] text-[12px] font-semibold",
                on
                  ? "border-vehicsim-ink bg-vehicsim-ink text-white"
                  : supported
                    ? "border-vehicsim-line-strong bg-white text-vehicsim-muted hover:bg-vehicsim-soft"
                    : "cursor-not-allowed border-vehicsim-line bg-vehicsim-soft text-vehicsim-faint",
              )}
            >
              {c.label}
              <span className={cx("font-mono text-[10px]", on ? "text-white/70" : "text-vehicsim-faint")}>{c.protocol}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
