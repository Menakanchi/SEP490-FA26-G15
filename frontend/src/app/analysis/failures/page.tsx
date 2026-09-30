"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import {
  CLASS_STYLE,
  Checkbox,
  ClassBadge,
  EmptyState,
  ErrorNote,
  FilterSelect,
  OutcomeBadge,
  Pagination,
  PillButton,
  StatCard,
  cx,
  fmt,
  runCode,
} from "@/components/VehicSimUi";
import { vi, viSummary } from "@/components/vehicsimI18n";
import { vehicsimApi } from "@/services/vehicsim";
import type { FailureClass, FailureFilters, FailureList, Outcome, Weather } from "@/types/vehicsim";

const PAGE_SIZE = 7;
const CLASS_ORDER: FailureClass[] = ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"];
const OPTIONAL_COLUMNS = ["impact", "ttc", "config"] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
const COLUMN_LABELS: Record<OptionalColumn, string> = { impact: "Tốc độ va chạm", ttc: "TTC nhỏ nhất", config: "Cấu hình" };

export default function FailureCasesPage() {
  const router = useRouter();
  const { ctx } = useVehicSimContext();
  const [filters, setFilters] = useState<FailureFilters>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FailureList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hidden, setHidden] = useState<Set<OptionalColumn>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await vehicsimApi.failures(filters, page, PAGE_SIZE));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được danh sách lỗi");
    }
  }, [filters, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải lại khi bộ lọc / trang đổi
    void load();
  }, [load]);

  const setFilter = <K extends keyof FailureFilters>(key: K, value: FailureFilters[K] | "") => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value === "" ? undefined : value }));
  };

  const k = data?.kpis;
  const classTotal = k ? CLASS_ORDER.reduce((sum, c) => sum + k.by_class[c], 0) : 0;
  const versionOptions = useMemo(
    () => (ctx?.versions ?? []).map((v) => ({ value: String(v.id), label: `AEB ${v.label}` })),
    [ctx],
  );
  const show = (c: OptionalColumn) => !hidden.has(c);

  return (
    <VehicSimPage
      step={4}
      crumbs={[{ label: "Phân tích" }, { label: "Ca lỗi" }]}
      title="Ca lỗi"
      subtitle="Mọi lượt mô phỏng thất bại hoặc suýt va chạm, phân loại theo khâu hỏng trong chuỗi AEB."
      actions={
        <>
          <PillButton onClick={() => void vehicsimApi.exportFailures(filters).catch((e) => setError(e.message))}>Xuất CSV</PillButton>
          <PillButton variant="dark" disabled title="Optimization (FE-13) chưa có trong đợt MVP">
            Tối ưu các ca đã chọn ({selected.size})
          </PillButton>
        </>
      }
    >
      <ErrorNote message={error} />

      <div className="flex items-start gap-4">
        <StatCard
          label="Tổng số ca lỗi"
          value={k?.total ?? "—"}
          note={k ? `+${k.this_week} trong tuần` : undefined}
          tone="danger"
        />
        <StatCard
          label="Va chạm"
          value={k?.collisions ?? "—"}
          note={k && k.total ? `${Math.round((100 * k.collisions) / k.total)}% số ca lỗi` : undefined}
          tone="danger"
        />
        <StatCard
          label="Suýt va chạm"
          value={k?.near_misses ?? "—"}
          note={k ? (k.false_braking ? `+${k.false_braking} phanh nhầm` : "TTC nhỏ nhất < 1.0 s") : undefined}
          tone="warn"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 self-stretch rounded-[20px] border border-solid border-vehicsim-line bg-white p-5 drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]">
          <span className="text-[13px] font-medium text-vehicsim-muted">Theo nhóm lỗi</span>
          <div className="flex h-[10px] w-full overflow-hidden rounded-full bg-vehicsim-soft">
            {k &&
              CLASS_ORDER.map((c) =>
                k.by_class[c] ? (
                  <div key={c} className={cx("h-[10px]", CLASS_STYLE[c].bar)} style={{ flex: `${k.by_class[c]} 0 0` }} />
                ) : null,
              )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-[6px]">
            {CLASS_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter("failure_class", filters.failure_class === c ? "" : c)}
                className={cx(
                  "flex items-center gap-[6px] text-left text-[12px] font-medium",
                  filters.failure_class === c ? "text-vehicsim-ink underline" : "text-vehicsim-muted",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- chấm màu SVG từ Figma */}
                <img alt="" src={CLASS_STYLE[c].dot} width={8} height={8} className="size-2" />
                {CLASS_STYLE[c].label} {k?.by_class[c] ?? 0}
              </button>
            ))}
          </div>
          {k && classTotal < k.total && (
            <span className="text-[11px] text-vehicsim-faint">{k.total - classTotal} ca không có khâu hỏng (biên an toàn mỏng)</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <FamilyChip active={!filters.scenario_id} label="Tất cả họ kịch bản" count={k?.total} onClick={() => setFilter("scenario_id", "")} />
        {data?.families.map((f) => (
          <FamilyChip
            key={f.id}
            active={filters.scenario_id === f.id}
            label={f.name}
            count={f.failures}
            onClick={() => setFilter("scenario_id", f.id)}
          />
        ))}
        <Link
          href="/scenarios"
          title="Họ kịch bản"
          className="flex size-10 shrink-0 items-center justify-center rounded-[20px] border border-solid border-vehicsim-line bg-white text-[16px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft"
        >
          →
        </Link>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-solid border-vehicsim-line bg-white shadow-vehicsim-card">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-[15px] font-bold text-vehicsim-ink">{data ? `${data.total} ca lỗi` : "…"}</span>
            <FilterSelect<FailureClass>
              label="Nhóm lỗi"
              value={filters.failure_class ?? ""}
              options={CLASS_ORDER.map((c) => ({ value: c, label: CLASS_STYLE[c].label }))}
              onChange={(v) => setFilter("failure_class", v)}
            />
            <FilterSelect<Exclude<Outcome, "SAFE">>
              label="Kết quả"
              value={filters.outcome ?? ""}
              options={[
                { value: "COLLISION", label: "Va chạm" },
                { value: "NEAR_MISS", label: "Suýt va chạm" },
                { value: "FALSE_BRAKING", label: "Phanh nhầm" },
              ]}
              onChange={(v) => setFilter("outcome", v)}
            />
            <FilterSelect<Weather>
              label="Thời tiết"
              value={filters.weather ?? ""}
              options={[
                { value: "CLEAR", label: "Trời quang" },
                { value: "CLOUDY", label: "Nhiều mây" },
                { value: "RAIN", label: "Mưa" },
                { value: "HEAVY_RAIN", label: "Mưa to" },
                { value: "FOG", label: "Sương mù" },
              ]}
              onChange={(v) => setFilter("weather", v)}
            />
            <FilterSelect<string>
              label="Cấu hình"
              value={filters.aeb_version_id ? String(filters.aeb_version_id) : ""}
              options={versionOptions}
              onChange={(v) => setFilter("aeb_version_id", v ? Number(v) : "")}
            />
            <FilterSelect<string>
              label="Thời gian"
              value={filters.days ? String(filters.days) : ""}
              options={[
                { value: "7", label: "7 ngày qua" },
                { value: "30", label: "30 ngày qua" },
                { value: "90", label: "90 ngày qua" },
              ]}
              onChange={(v) => setFilter("days", v ? Number(v) : "")}
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnsOpen((o) => !o)}
              className="rounded-full border border-solid border-vehicsim-line-strong bg-white px-[14px] py-2 text-[12px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft"
            >
              Cột hiển thị
            </button>
            {columnsOpen && (
              <div className="absolute right-0 top-11 z-10 flex w-44 flex-col gap-2 rounded-[16px] border border-solid border-vehicsim-line bg-white p-3 shadow-vehicsim-card">
                {OPTIONAL_COLUMNS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-[12px] font-medium text-vehicsim-ink">
                    <Checkbox
                      checked={show(c)}
                      label={COLUMN_LABELS[c]}
                      onChange={(v) =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (v) next.delete(c);
                          else next.add(c);
                          return next;
                        })
                      }
                    />
                    {COLUMN_LABELS[c]}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-10 items-center border-b border-solid border-vehicsim-line bg-vehicsim-soft px-5 text-[11px] font-semibold uppercase text-vehicsim-faint">
          <span className="w-7" />
          <span className="w-[78px]">Lượt chạy</span>
          <span className="w-[210px]">Kịch bản</span>
          <span className="w-[120px]">Kết quả</span>
          <span className="w-[132px]">Nhóm lỗi</span>
          <span className="min-w-0 flex-1">Nguyên nhân gốc</span>
          {show("impact") && <span className="w-[86px]">Va chạm ở</span>}
          {show("ttc") && <span className="w-[76px]">TTC min</span>}
          {show("config") && <span className="w-[78px]">Cấu hình</span>}
          <span className="w-16" />
        </div>

        {data && data.items.length === 0 && (
          <EmptyState title="Không có ca lỗi nào với bộ lọc này">
            Chạy cơ sở cho một họ kịch bản ở mục <Link href="/scenarios" className="font-semibold underline">Kịch bản</Link> để có dữ liệu.
          </EmptyState>
        )}

        {data?.items.map((item) => {
          const isSelected = selected.has(item.run_id);
          return (
            <div
              key={item.run_id}
              onClick={() => router.push(`/analysis/failures/${item.run_id}`)}
              className={cx(
                "flex h-[58px] cursor-pointer items-center border-b border-solid border-vehicsim-line px-5 hover:bg-vehicsim-row",
                isSelected ? "bg-vehicsim-row" : "bg-white",
              )}
            >
              <span className="w-7" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  label={`Select run ${item.run_id}`}
                  onChange={(v) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(item.run_id);
                      else next.delete(item.run_id);
                      return next;
                    })
                  }
                />
              </span>
              <span className="w-[78px] text-[13px] font-semibold text-vehicsim-ink">{runCode(item.run_id)}</span>
              <span className="flex w-[210px] flex-col gap-[2px] pr-3">
                <span className="truncate text-[13px] font-semibold text-vehicsim-ink">
                  {item.family} <span className="font-medium text-vehicsim-faint">· {item.variant}</span>
                </span>
                <span className="truncate text-[12px] text-vehicsim-faint">{viSummary(item.summary)}</span>
              </span>
              <span className="w-[120px]">
                <OutcomeBadge outcome={item.outcome} />
              </span>
              <span className="w-[132px]">
                <ClassBadge value={item.failure_class} />
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 pr-3 text-[13px] text-vehicsim-muted">{vi(item.root_cause)}</span>
              {show("impact") && (
                <span className={cx("w-[86px] text-[13px] font-medium", item.impact_kmh ? "text-vehicsim-ink" : "text-vehicsim-faint")}>
                  {item.impact_kmh ? fmt.kmh(item.impact_kmh) : "—"}
                </span>
              )}
              {show("ttc") && (
                <span
                  className={cx(
                    "w-[76px] text-[13px] font-semibold",
                    item.min_ttc_s !== null && item.min_ttc_s <= 0.05 ? "text-vehicsim-danger" : "text-vehicsim-ink",
                  )}
                >
                  {fmt.s(item.min_ttc_s)}
                </span>
              )}
              {show("config") && (
                <span className="w-[78px]">
                  <span className="rounded-full bg-vehicsim-soft px-[10px] py-[5px] text-[12px] font-medium text-vehicsim-muted">{item.config}</span>
                </span>
              )}
              <span className="flex w-16 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/analysis/failures/${item.run_id}/playback`}
                  title="Phát lại"
                  className="flex size-[30px] items-center justify-center rounded-[15px] border border-solid border-vehicsim-line bg-white text-[10px] font-semibold text-vehicsim-ink hover:bg-vehicsim-soft"
                >
                  ▶
                </Link>
                <Link href={`/analysis/failures/${item.run_id}`} title="Chi tiết" className="text-[16px] font-bold text-vehicsim-faint hover:text-vehicsim-ink">
                  ⋯
                </Link>
              </span>
            </div>
          );
        })}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-5 py-[14px]">
            <span className="text-[13px] font-medium text-vehicsim-faint">
              Hiển thị {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} / {data.total}
              {selected.size > 0 && `  ·  đã chọn ${selected.size}`}
            </span>
            <Pagination page={data.page} pages={data.pages} onPage={setPage} />
          </div>
        )}
      </section>
    </VehicSimPage>
  );
}

function FamilyChip({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex shrink-0 flex-col items-start gap-[2px] whitespace-nowrap rounded-[16px] bg-white px-[18px] py-3 text-left",
        active
          ? "border-[1.5px] border-solid border-vehicsim-ink drop-shadow-[0px_4px_8px_rgba(18,20,26,0.05)]"
          : "border border-solid border-vehicsim-line hover:bg-vehicsim-soft",
      )}
    >
      <span className={cx("text-[13px] font-semibold", active ? "text-vehicsim-ink" : "text-vehicsim-muted")}>{label}</span>
      <span className="text-[12px] text-vehicsim-faint">{count ?? 0} ca lỗi</span>
    </button>
  );
}
