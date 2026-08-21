"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Download,
  FileCode,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { getScenarios, downloadXosc } from "@/services/api";
import type {
  ScenarioItem,
  ODDPayload,
  RoadType,
  Weather,
  ActorType,
  ManeuverType,
} from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
  renderOddActorTypeLabel,
} from "@/types";

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const ROAD_OPTIONS: { value: RoadType | ""; label: string }[] = [
  { value: "", label: "Tất cả đường" },
  ...Object.entries(ROAD_TYPE_LABELS).map(([v, l]) => ({
    value: v as RoadType,
    label: l,
  })),
];

const WEATHER_OPTIONS: { value: Weather | ""; label: string }[] = [
  { value: "", label: "Tất cả thời tiết" },
  ...Object.entries(WEATHER_LABELS).map(([v, l]) => ({
    value: v as Weather,
    label: l,
  })),
];

const ACTOR_OPTIONS: { value: ActorType | ""; label: string }[] = [
  { value: "", label: "Tất cả tác nhân" },
  ...Object.entries(ACTOR_TYPE_LABELS).map(([v, l]) => ({
    value: v as ActorType,
    label: l,
  })),
];

const MANEUVER_OPTIONS: { value: ManeuverType | ""; label: string }[] = [
  { value: "", label: "Tất cả hành vi" },
  ...Object.entries(MANEUVER_TYPE_LABELS).map(([v, l]) => ({
    value: v as ManeuverType,
    label: l,
  })),
];

export default function LibraryPage() {
  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "error" | "success"; msg: string } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [oddFilter, setOddFilter] = useState<ODDPayload>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Không bật `loading` ở đây: nó khởi tạo đã là true cho lần nạp đầu, còn các
  // lần nạp do người dùng gõ/lọc thì bật ngay tại handler tương ứng.
  const fetchData = useCallback(
    async (searchTerm: string, odd: ODDPayload) => {
      try {
        const res = await getScenarios({ search: searchTerm, odd, limit: 100 });
        setItems(res.items);
        setTotal(res.total);
      } catch {
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // On mount
  useEffect(() => {
  // `react-hooks` 7 chặn mọi setState mà effect với tới được, kể cả khi nó nằm
  // sau `await`. Cách sửa thật là chuyển việc nạp lên server component / `use()`
  // + Suspense, tức bỏ hẳn effect này — một refactor riêng, không nhét vào PR
  // tính năng được. Tắt có phạm vi ở đúng ba chỗ để lỗi khác vẫn nhìn thấy.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp dữ liệu lúc mount
    void fetchData("", {});
  }, [fetchData]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void fetchData(value, oddFilter);
    }, 300);
  };

  // Filter change
  const handleFilterChange = (key: keyof ODDPayload, value: string) => {
    const next = { ...oddFilter, [key]: value || undefined };
    setOddFilter(next);
    setLoading(true);
    void fetchData(search, next);
  };

  const handleDownload = async (e: React.MouseEvent, scenarioId: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const xml = await downloadXosc(scenarioId);
      const blob = new Blob([xml], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scenarioId}.xosc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Chặn tải file .xosc",
      });
    }
  };

  // Status badge helper
  const statusBadge = (status: string) => {
    switch (status) {
      case "approved_library":
        return <span className="badge badge--approved">Đã duyệt (Library)</span>;
      case "rejected":
        return <span className="badge badge--rejected">Từ chối</span>;
      case "pending_sim_review":
        return <span className="badge badge--before-sim">Chờ Cổng 1</span>;
      case "simulation_queued":
        return <span className="badge badge--before-sim">Đang chạy sim</span>;
      case "pending_library_review":
        return <span className="badge badge--pending font-mono">Chờ Cổng 2</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen p-6 pt-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
              toast.type === "error" ? "bg-amber-500 text-slate-950 font-bold" : "bg-green-500 text-white"
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            {toast.msg}
          </div>
        )}

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">
                Thư viện kịch bản (Library Search)
              </h1>
              <p className="text-sm text-slate-400">
                Tìm kiếm theo từ khóa & lọc theo 4 trục ODD chuẩn
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Tổng cộng: {total} kịch bản
          </span>
        </div>

        {/* ─── Search & Filters ─── */}
        <div className="glass-card p-5">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                className="input-field pl-10 text-sm"
                placeholder="Tìm kiếm theo từ khóa (Ví dụ: tạt đầu, mưa lớn, cao tốc)..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* ODD Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="w-4 h-4 text-slate-500 hidden lg:block" />
              {[
                {
                  key: "road_type" as const,
                  options: ROAD_OPTIONS,
                },
                {
                  key: "weather" as const,
                  options: WEATHER_OPTIONS,
                },
                {
                  key: "actor_type" as const,
                  options: ACTOR_OPTIONS,
                },
                {
                  key: "maneuver" as const,
                  options: MANEUVER_OPTIONS,
                },
              ].map((filter) => (
                <select
                  key={filter.key}
                  className="input-field w-auto text-xs py-2"
                  value={(oddFilter[filter.key] as string) ?? ""}
                  onChange={(e) =>
                    handleFilterChange(filter.key, e.target.value)
                  }
                >
                  {filter.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Loading ─── */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="glass-card overflow-hidden">
                <div className="skeleton h-[160px] w-full rounded-none" />
                <div className="p-5 space-y-3">
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Empty state ─── */}
        {!loading && items.length === 0 && (
          <div className="glass-card py-16 flex flex-col items-center text-center">
            <FileCode className="w-16 h-16 text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-300">
              Không tìm thấy kịch bản phù hợp
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Hãy thử chọn bộ lọc khác hoặc nhập từ khóa tìm kiếm mới.
            </p>
          </div>
        )}

        {/* ─── Card Grid ─── */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((item) => {
              return (
                <Link
                  key={item.scenario_id}
                  href={`/library/${item.scenario_id}`}
                  className="glass-card glass-card-hover overflow-hidden group block"
                >
                  {/* Content */}
                  <div className="p-5 space-y-3">
                    <h3 className="font-semibold text-slate-200 truncate text-sm group-hover:text-white transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {item.description_vi}
                    </p>

                    {/* ODD Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">
                        {renderSafeValue(item.odd?.road_type, ROAD_TYPE_LABELS)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">
                        {renderSafeValue(item.odd?.weather, WEATHER_LABELS)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/15">
                        {renderOddActorTypeLabel(item.odd)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
                        {renderSafeValue(item.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                      </span>
                    </div>

                    {/* XML đã được sinh trước Cổng 1 nên luôn có thể tải để kiểm tra. */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/20">
                      {statusBadge(item.status)}

                      <button
                        title="Tải file .xosc"
                        onClick={(e) => handleDownload(e, item.scenario_id)}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md transition-all bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30"
                      >
                        <Download className="w-3 h-3" />
                        .xosc
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
