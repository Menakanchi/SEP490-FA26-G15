import React from "react";
import { cx } from "@/components/VehicSimUi";

/**
 * 7 nhóm kịch bản Euro NCAP (`scenarios.category`, `ScenarioRules.CATEGORIES` ở backend). Hiện chỉ CP_CROSSING có bộ mô phỏng và bộ
 * xuất .xosc (`FamilyService.CATEGORY`); các nhóm khác hiện mờ để người dùng biết phạm vi (A4.4, TD-42). Mở thêm nhóm nào thì đổi
 * `supported` ở đây cùng lúc với backend.
 */
export const SCENARIO_CATEGORIES: { code: string; label: string; protocol: string; supported: boolean }[] = [
  { code: "CP_CROSSING", label: "Người đi bộ băng ngang", protocol: "CPFA / CPNA", supported: true },
  { code: "CCRS", label: "Xe phía trước đứng yên", protocol: "CCRs", supported: false },
  { code: "CCRM", label: "Xe phía trước chạy chậm", protocol: "CCRm", supported: false },
  { code: "CCRB", label: "Xe phía trước phanh gấp", protocol: "CCRb", supported: false },
  { code: "CPLA", label: "Người đi bộ đi dọc cùng chiều", protocol: "CPLA", supported: false },
  { code: "TURNING", label: "Xe rẽ cắt hướng", protocol: "CCFtap / CPTA", supported: false },
  { code: "CUT_IN", label: "Xe cắt vào làn", protocol: "Cut-in", supported: false },
];

const UNSUPPORTED_HINT = "Chưa hỗ trợ: chưa có bộ mô phỏng và bộ xuất .xosc cho loại này. Nhóm dự kiến làm CCRs (xe phía trước đứng yên) trước.";

/** Chọn loại kịch bản; loại chưa hỗ trợ hiện mờ, không chọn được. */
export function ScenarioCategoryPicker({ value = "CP_CROSSING" }: { value?: string }) {
  return (
    <div className="flex flex-col gap-[6px]" role="group" aria-label="Loại kịch bản (Euro NCAP)">
      <span className="text-[13px] font-medium text-vehicsim-muted">Loại kịch bản (Euro NCAP)</span>
      <div className="flex flex-wrap gap-2">
        {SCENARIO_CATEGORIES.map((c) => {
          const on = c.code === value;
          return (
            <button
              key={c.code}
              type="button"
              data-category={c.code}
              aria-pressed={on}
              disabled={!c.supported}
              title={c.supported ? `${c.label} (${c.protocol})` : UNSUPPORTED_HINT}
              className={cx(
                "flex items-center gap-2 rounded-full border border-solid px-3 py-[7px] text-[12px] font-semibold",
                on
                  ? "border-vehicsim-ink bg-vehicsim-ink text-white"
                  : "border-vehicsim-line-strong bg-white text-vehicsim-muted",
                !c.supported && "cursor-not-allowed border-dashed opacity-50",
              )}
            >
              {c.label}
              <span className={cx("text-[10px] font-normal", on ? "text-white/70" : "text-vehicsim-faint")}>{c.protocol}</span>
              {!c.supported && (
                <span className="rounded-full bg-vehicsim-soft px-[6px] py-[1px] text-[10px] font-semibold text-vehicsim-faint">
                  chưa hỗ trợ
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
