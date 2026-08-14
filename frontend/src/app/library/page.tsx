"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  Download,
  FileCode,
  Loader2,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { getScenarios } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
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
  { value: "", label: "Tất cả" },
  ...Object.entries(ROAD_TYPE_LABELS).map(([v, l]) => ({
    value: v as RoadType,
    label: l,
  })),
];

const WEATHER_OPTIONS: { value: Weather | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...Object.entries(WEATHER_LABELS).map(([v, l]) => ({
    value: v as Weather,
    label: l,
  })),
];

const ACTOR_OPTIONS: { value: ActorType | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...Object.entries(ACTOR_TYPE_LABELS).map(([v, l]) => ({
    value: v as ActorType,
    label: l,
  })),
];

const MANEUVER_OPTIONS: { value: ManeuverType | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  ...Object.entries(MANEUVER_TYPE_LABELS).map(([v, l]) => ({
    value: v as ManeuverType,
    label: l,
  })),
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [oddFilter, setOddFilter] = useState<ODDPayload>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch
  const fetchData = useCallback(
    async (searchTerm: string, odd: ODDPayload) => {
      setLoading(true);
      try {
        const res = await getScenarios({ search: searchTerm, odd });
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
    fetchData("", {});
  }, [fetchData]);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(value, oddFilter);
    }, 300);
  };

  // Filter change (immediate)
  const handleFilterChange = (key: keyof ODDPayload, value: string) => {
    const next = { ...oddFilter, [key]: value || undefined };
    setOddFilter(next);
    fetchData(search, next);
  };

  // Download .xosc
  const handleDownload = (
    e: React.MouseEvent,
    scenarioId: string,
    xoscContent?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!xoscContent) return;
    const blob = new Blob([xoscContent], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenarioId}.xosc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Status badge
  const statusBadge = (status: string) => {
    switch (status) {
      case "approved_library":
        return <span className="badge badge--approved">Đã duyệt</span>;
      case "rejected":
        return <span className="badge badge--rejected">Từ chối</span>;
      case "pending_review":
        return <span className="badge badge--pending">Chờ duyệt</span>;
      case "pending_sim_review":
        return <span className="badge badge--before-sim">Chờ sim</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen p-6 pt-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">
                Thư viện kịch bản
              </h1>
              <p className="text-sm text-slate-500">
                {total} kịch bản
              </p>
            </div>
          </div>
        </div>

        {/* ─── Search & Filters ─── */}
        <div className="glass-card p-5">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                className="input-field pl-10"
                placeholder="Tìm kiếm kịch bản..."
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
                  placeholder: "Đường",
                },
                {
                  key: "weather" as const,
                  options: WEATHER_OPTIONS,
                  placeholder: "Thời tiết",
                },
                {
                  key: "actor_type" as const,
                  options: ACTOR_OPTIONS,
                  placeholder: "Tác nhân",
                },
                {
                  key: "maneuver" as const,
                  options: MANEUVER_OPTIONS,
                  placeholder: "Hành vi",
                },
              ].map((filter) => (
                <select
                  key={filter.key}
                  className="input-field w-auto min-w-[120px] text-sm py-2"
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
                  <div className="skeleton h-3 w-2/3" />
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-16 rounded-full" />
                    <div className="skeleton h-5 w-14 rounded-full" />
                    <div className="skeleton h-5 w-18 rounded-full" />
                  </div>
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
              Chưa có kịch bản nào
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Hãy tạo kịch bản đầu tiên từ trang Generator, sau đó duyệt để đưa
              vào thư viện.
            </p>
          </div>
        )}

        {/* ─── Card Grid ─── */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {items.map((item) => (
              <Link
                key={item.scenario_id}
                href={`/library/${item.scenario_id}`}
                className="glass-card glass-card-hover overflow-hidden group block"
              >
                {/* SVG Thumbnail */}
                <div className="relative h-[160px] overflow-hidden bg-slate-900/50 border-b border-slate-700/15">
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

                  {/* Hover arrow */}
                  <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-blue-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-3">
                  <h3 className="font-semibold text-slate-200 truncate text-sm group-hover:text-white transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
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
                      {renderSafeValue(item.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
                      {renderSafeValue(item.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between pt-1">
                    {statusBadge(item.status)}
                    {item.xosc_content && (
                      <button
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-400 transition-colors"
                        onClick={(e) =>
                          handleDownload(e, item.scenario_id, item.xosc_content)
                        }
                      >
                        <Download className="w-3 h-3" />
                        .xosc
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
