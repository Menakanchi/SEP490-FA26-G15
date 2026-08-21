"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Download,
  FileCode,
  BookOpen,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { getScenarios, downloadXosc } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import { AuthGate } from "@/components/AuthGate";
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

function LibraryPageContent() {
  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "error" | "success"; msg: string } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [oddFilter, setOddFilter] = useState<ODDPayload>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void fetchData("", {});
  }, [fetchData]);

  // Debounced search
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchData(val, oddFilter);
    }, 400);
  };

  // Filter change
  const handleFilterChange = (key: keyof ODDPayload, val: string) => {
    const next = { ...oddFilter, [key]: val || undefined };
    setOddFilter(next);
    setLoading(true);
    void fetchData(search, next);
  };

  // Download .xosc status gate
  const handleDownload = async (
    e: React.MouseEvent,
    scenarioId: string,
    status: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (status !== "approved_library") {
      setToast({
        type: "error",
        msg: "Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc",
      });
      return;
    }

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
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">Đã duyệt (Library)</span>;
      case "rejected":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">Từ chối</span>;
      case "pending_review":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono">Chờ duyệt</span>;
      case "pending_sim_review":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">Chờ sim</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{status}</span>;
    }
  };

  const filterConfigs = [
    { key: "road_type" as const, options: ROAD_OPTIONS },
    { key: "weather" as const, options: WEATHER_OPTIONS },
    { key: "actor_type" as const, options: ACTOR_OPTIONS },
    { key: "maneuver" as const, options: MANEUVER_OPTIONS },
  ];

  return (
    <div className="min-h-screen p-6 pt-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
              toast.type === "error" ? "bg-amber-500 text-slate-950 font-bold" : "bg-green-600 text-white"
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            {toast.msg}
          </div>
        )}

        {/* ─── Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                Thư viện kịch bản (Library Search)
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Tìm kiếm theo từ khóa & lọc theo 4 trục ODD chuẩn
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
            Tổng cộng: {total} kịch bản
          </span>
        </div>

        {/* ─── Search & Filters ─── */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                placeholder="Tìm kiếm theo từ khóa (Ví dụ: tạt đầu, mưa lớn, cao tốc)..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* ODD Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Filter className="w-4 h-4 text-slate-400 hidden lg:block shrink-0" />
              {filterConfigs.map((filter) => (
                <select
                  key={filter.key}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
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
              <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-3 p-4">
                <div className="skeleton h-[160px] w-full rounded-2xl" />
                <div className="p-2 space-y-2">
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Empty state ─── */}
        {!loading && items.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 py-16 flex flex-col items-center text-center p-6 shadow-sm">
            <FileCode className="w-14 h-14 text-slate-400 mb-4" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Không tìm thấy kịch bản phù hợp
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Hãy thử chọn bộ lọc khác hoặc nhập từ khóa tìm kiếm mới.
            </p>
          </div>
        )}

        {/* ─── Card Grid ─── */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((item) => {
              const isApproved = item.status === "approved_library";
              return (
                <Link
                  key={item.scenario_id}
                  href={`/library/${item.scenario_id}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden group block hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300"
                >
                  {/* SVG 2D Thumbnail */}
                  <div className="relative h-[160px] overflow-hidden bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                    {item.spec?.actors?.length ? (
                      <SVG2DRenderer
                        actors={item.spec.actors}
                        maneuvers={item.spec.maneuvers}
                        width="100%"
                        height={160}
                        showLabels={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <FileCode className="w-10 h-10 opacity-30" />
                      </div>
                    )}

                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <ChevronRight className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 space-y-3">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.description_vi}
                    </p>

                    {/* ODD Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {renderSafeValue(item.odd?.road_type, ROAD_TYPE_LABELS)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        {renderSafeValue(item.odd?.weather, WEATHER_LABELS)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                        {renderSafeValue(item.odd?.actor_type, ACTOR_TYPE_LABELS)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                        {renderSafeValue(item.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                      </span>
                    </div>

                    {/* Bottom Action Row */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      {statusBadge(item.status)}

                      <button
                        title={
                          isApproved
                            ? "Tải file .xosc"
                            : "Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc"
                        }
                        onClick={(e) =>
                          handleDownload(e, item.scenario_id, item.status)
                        }
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-lg transition-all ${
                          isApproved
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60"
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
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

export default function LibraryPage() {
  return (
    <AuthGate>
      <LibraryPageContent />
    </AuthGate>
  );
}
