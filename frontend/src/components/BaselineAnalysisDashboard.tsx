"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VehicSimPage } from "@/components/VehicSimPage";
import { useVehicSimContext } from "@/components/VehicSimContext";
import { ErrorNote, PillButton, StatCard, cx } from "@/components/VehicSimUi";
import { ObjectiveSummary } from "@/components/AnalysisSelectionSummary";
import { vehicsimApi } from "@/services/vehicsim";
import { vi } from "@/components/vehicsimI18n";
import type { AnalysisDashboardData, AnalysisFilters } from "@/types/vehicsim";

const LABELS: Record<string, string> = {
  CLEAR: "Trời quang",
  CLOUDY: "Nhiều mây",
  RAIN: "Mưa",
  HEAVY_RAIN: "Mưa lớn",
  FOG: "Sương mù",
  DAY: "Ban ngày",
  DUSK: "Chạng vạng",
  NIGHT: "Ban đêm",
  PERCEPTION: "Nhận thức",
  DECISION: "Quyết định",
  CONTROL: "Điều khiển",
  VEHICLE_DYNAMICS: "Động lực học",
  SAFE: "An toàn",
  COLLISION: "Va chạm",
  FALSE_BRAKING: "Phanh oan",
  NEAR_MISS: "Suýt va chạm",
  MISSED_BRAKING: "Bỏ sót",
  OTHER_FAILURE: "Lỗi AEB khác",
  ERROR: "Lỗi kỹ thuật",
  CANCELLED: "Đã hủy",
  TIMEOUT: "Hết giờ",
  INCOMPLETE: "Thiếu dữ liệu",
  NOT_FINISHED: "Chưa hoàn tất",
  PENDING: "Đang chờ",
  RUNNING: "Đang chạy",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn tất",
  FAILED: "Lỗi",
  STOPPED: "Đã hủy",
};

export function BaselineAnalysisDashboard({
  initialScenario,
  activeTab = "baseline",
  onTabChange,
}: {
  initialScenario?: number;
  activeTab?: "baseline" | "failures";
  onTabChange?: (tab: "baseline" | "failures") => void;
}) {
  const { ctx } = useVehicSimContext();
  const [filters, setFilters] = useState<AnalysisFilters>({ scenario_id: initialScenario });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AnalysisDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    vehicsimApi
      .analysisRuns(filters, page)
      .then((value) => {
        if (active) {
          setData(value);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(vi(e.message));
        }
      });
    return () => {
      active = false;
    };
  }, [filters, page, refresh]);

  const change = (key: keyof AnalysisFilters, value: string) => {
    setPage(1);
    setData(null);
    const numeric = ["scenario_id", "variant_id", "aeb_version_id", "vehicle_id"].includes(key);
    setFilters((old) => ({ ...old, [key]: value ? (numeric ? Number(value) : value) : undefined }));
  };

  const activeScenarioId = filters.scenario_id ?? ctx?.families?.[0]?.id;
  const currentFamily = ctx?.families?.find((f) => f.id === activeScenarioId);

  return (
    <VehicSimPage
      step={4}
      title="Phân tích kết quả baseline"
      crumbs={[{ label: "Kịch bản", href: "/scenarios" }, { label: "Phân tích kết quả" }]}
      subtitle="Thống kê hiệu năng phanh theo kịch bản. Chuyển sang tối ưu AEB trực tiếp trên toàn bộ không gian biến thể của kịch bản."
      actions={
        <div className="flex items-center gap-2">
          <PillButton onClick={() => setRefresh((x) => x + 1)}>Tải lại kết quả</PillButton>
          {activeScenarioId && (
            <PillButton variant="dark" href={`/aeb?scenario_id=${activeScenarioId}&tab=mobo`}>
              Tối ưu kịch bản này ➔
            </PillButton>
          )}
        </div>
      }
    >
      <ErrorNote message={error} />

      {/* Điều hướng chuyển chế độ (Tabs) */}
      <div className="flex items-center gap-2 border-b border-solid border-vehicsim-line pb-1">
        <button
          type="button"
          onClick={() => onTabChange?.("baseline")}
          className={cx(
            "flex items-center gap-2 rounded-t-[14px] px-5 py-3 text-[14px] font-bold transition",
            activeTab === "baseline"
              ? "border-b-2 border-vehicsim-ink bg-white text-vehicsim-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              : "text-vehicsim-muted hover:text-vehicsim-ink",
          )}
        >
          <span>Kết quả baseline & Đánh giá</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange?.("failures")}
          className={cx(
            "flex items-center gap-2 rounded-t-[14px] px-5 py-3 text-[14px] font-bold transition",
            activeTab === "failures"
              ? "border-b-2 border-vehicsim-ink bg-white text-vehicsim-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              : "text-vehicsim-muted hover:text-vehicsim-ink",
          )}
        >
          <span>Tra cứu ca lỗi chi tiết</span>
        </button>
      </div>

      <section aria-label="Bộ lọc baseline" className="grid grid-cols-2 xl:grid-cols-5 gap-3 rounded-[20px] bg-white p-5 shadow-vehicsim-card">
        <label className="text-[12px] font-semibold text-vehicsim-muted">
          Họ kịch bản
          <select
            aria-label="Họ kịch bản"
            className="mt-1 block w-full rounded-xl border border-vehicsim-line p-2 text-[13px] text-vehicsim-ink"
            value={filters.scenario_id ?? ""}
            onChange={(e) => change("scenario_id", e.target.value)}
          >
            <option value="">Tất cả kịch bản</option>
            {ctx?.families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-vehicsim-muted">
          Phiên bản baseline
          <select
            aria-label="Phiên bản baseline"
            className="mt-1 block w-full rounded-xl border border-vehicsim-line p-2 text-[13px] text-vehicsim-ink"
            value={filters.aeb_version_id ?? ""}
            onChange={(e) => change("aeb_version_id", e.target.value)}
          >
            <option value="">Tất cả phiên bản</option>
            {ctx?.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["status", "Trạng thái", ["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED", "STOPPED"]],
            ["weather", "Thời tiết", ["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"]],
            ["time_of_day", "Thời điểm", ["DAY", "DUSK", "NIGHT"]],
            ["failure_class", "Khâu lỗi", ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"]],
          ] as const
        ).map(([key, label, values]) => (
          <label key={key} className="text-[12px] font-semibold text-vehicsim-muted">
            {label}
            <select
              aria-label={label}
              className="mt-1 block w-full rounded-xl border border-vehicsim-line p-2 text-[13px] text-vehicsim-ink"
              value={filters[key] ?? ""}
              onChange={(e) => change(key, e.target.value)}
            >
              <option value="">Tất cả</option>
              {values.map((value) => (
                <option key={value} value={value}>
                  {LABELS[value] ?? vi(value)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(
          [
            ["variant_id", "ID biến thể"],
            ["vehicle_id", "ID xe"],
            ["simulator", "Phiên bản simulator"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-[12px] font-semibold text-vehicsim-muted">
            {label}
            <input
              aria-label={label}
              type={key === "simulator" ? "text" : "number"}
              min={1}
              className="mt-1 block w-full rounded-xl border border-vehicsim-line p-2 text-[13px] text-vehicsim-ink"
              value={filters[key] ?? ""}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
      </section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="Tổng lượt chạy" value={data?.total ?? "—"} />
        {(
          [
            "SAFE",
            "COLLISION",
            "FALSE_BRAKING",
            "NEAR_MISS",
            "MISSED_BRAKING",
            "OTHER_FAILURE",
            "ERROR",
            "CANCELLED",
            "TIMEOUT",
            "INCOMPLETE",
            "NOT_FINISHED",
          ] as const
        ).map((key) => (
          <StatCard key={key} label={LABELS[key]} value={data ? data.counts[key] ?? 0 : "—"} />
        ))}
      </div>

      {data?.objective_groups.map((group) => (
        <section key={group.identity} className="rounded-[20px] bg-white p-5 space-y-2 shadow-vehicsim-card">
          <h2 className="text-[13px] font-bold text-vehicsim-ink">
            {group.simulator} · baseline #{group.baseline_id} · xe #{group.vehicle_id}
          </h2>
          <ObjectiveSummary value={group.objectives} />
          <p className="text-[11px] text-vehicsim-muted">
            Hợp đồng {group.objectives.version}. Chỉ tổng hợp cùng identity; run lỗi/thiếu làm objective không đầy đủ.
            {group.carla_observational_only ? " CARLA chỉ phục vụ quan sát; chưa tương đương với số động học." : ""}
          </p>
        </section>
      ))}

      {/* Danh sách các lượt chạy của kịch bản */}
      <section className="rounded-[20px] bg-white p-5 space-y-4 shadow-vehicsim-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-vehicsim-ink">
              Danh sách các lượt chạy mô phỏng {data ? `(${data.total})` : ""}
            </h2>
            <p className="text-[12px] text-vehicsim-muted">
              Kết quả chi tiết từng lượt chạy với cấu hình AEB cơ sở (Baseline). Bạn có thể xem chi tiết từng ca lỗi hoặc chuyển ngay sang tối ưu hoá toàn bộ kịch bản.
            </p>
          </div>
          {activeScenarioId && (
            <PillButton variant="dark" href={`/aeb?scenario_id=${activeScenarioId}&tab=mobo`}>
              Tối ưu kịch bản {currentFamily?.code ?? ""} ➔
            </PillButton>
          )}
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-solid border-vehicsim-line">
          <table className="w-full min-w-[900px] text-[12px] text-left">
            <thead className="bg-vehicsim-soft text-[12px] font-bold uppercase tracking-[0.5px] text-vehicsim-ink">
              <tr>
                <th className="p-3">Run / biến thể</th>
                <th className="p-3">Seed</th>
                <th className="p-3">Baseline / xe</th>
                <th className="p-3">Simulator</th>
                <th className="p-3">Trạng thái / kết quả</th>
                <th className="p-3 text-right pr-4">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-solid divide-vehicsim-line bg-white">
              {data?.items.map((run) => (
                <tr key={run.run_id} className="hover:bg-vehicsim-row">
                  <td className="p-3">
                    <Link className="font-bold text-vehicsim-decision hover:underline" href={`/analysis/failures/${run.run_id}`}>
                      #{run.run_id} · {run.variant}
                    </Link>
                    <span className="block text-[11px] text-vehicsim-faint">{run.family}</span>
                  </td>
                  <td className="p-3 font-mono">{run.seed}</td>
                  <td className="p-3 font-medium">
                    #{run.baseline_id} / #{run.vehicle_id}
                  </td>
                  <td className="p-3">{run.simulator}</td>
                  <td className="p-3">
                    <span className="font-semibold text-vehicsim-ink">{LABELS[run.status] ?? run.status}</span>
                    <span className="block text-[11px] text-vehicsim-muted">{LABELS[run.outcome] ?? run.outcome}</span>
                    {!run.trace_available && <span className="text-[11px] font-semibold text-vehicsim-warn">Thiếu telemetry</span>}
                  </td>
                  <td className="p-3 text-right pr-4">
                    <Link
                      href={`/analysis/failures/${run.run_id}`}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-solid border-vehicsim-line-strong bg-white px-3 text-[11px] font-bold text-vehicsim-decision hover:border-vehicsim-decision hover:bg-vehicsim-decision hover:text-white transition shadow-sm"
                    >
                      Chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.total === 0 && (
          <p className="py-6 text-center text-[13px] text-vehicsim-muted">
            Chưa có lượt chạy baseline phù hợp.{" "}
            <Link href="/scenarios" className="font-semibold text-vehicsim-decision underline">
              Chạy baseline ở màn kịch bản
            </Link>
            .
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-[12px] text-vehicsim-muted">
            Hiển thị trang {page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 30))} (30 lượt chạy/trang)
          </span>
          <div className="flex gap-2 items-center">
            <PillButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trang trước
            </PillButton>
            <PillButton disabled={!data || page * 30 >= data.total} onClick={() => setPage((p) => p + 1)}>
              Trang sau
            </PillButton>
          </div>
        </div>

        {/* Banner điều hướng sang Tối ưu AEB toàn kịch bản */}
        <div className="flex items-center justify-between rounded-[16px] bg-vehicsim-soft/70 p-4 border border-solid border-vehicsim-line">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-vehicsim-ink">Sẵn sàng tối ưu hoá thông số AEB?</span>
            <span className="text-[12px] text-vehicsim-muted">
              Thuật toán Bayesian MOBO sẽ tự động tìm kiếm bộ 4 tham số tối ưu (TTC, độ trễ, lực phanh, độ êm) trên toàn bộ biến thể của kịch bản {currentFamily?.code ?? ""}.
            </span>
          </div>
          {activeScenarioId && (
            <PillButton variant="dark" href={`/aeb?scenario_id=${activeScenarioId}&tab=mobo`}>
              Bắt đầu tối ưu kịch bản {currentFamily?.code ?? ""} ➔
            </PillButton>
          )}
        </div>
      </section>
    </VehicSimPage>
  );
}
