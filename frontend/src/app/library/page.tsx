"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BookOpen,
  Search,
  Filter,
  Download,
  AlertCircle,
  MapPin,
  Users,
  Globe,
  User,
  Lock,
  Edit,
  Trash2,
  Send,
  X,
  Bot,
} from "lucide-react";
import {
  getScenarios,
  downloadXosc,
  deleteScenario,
  updateScenario,
  submitScenario,
} from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { ScenarioItem, ODDPayload } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
} from "@/types";

const ROAD_OPTIONS = [
  { value: "", label: "Loại đường" },
  { value: "highway", label: "Cao tốc" },
  { value: "urban", label: "Đô thị" },
  { value: "rural", label: "Nông thôn" },
  { value: "junction", label: "Nút giao" },
];

const WEATHER_OPTIONS = [
  { value: "", label: "Thời tiết" },
  { value: "clear_day", label: "Nắng ngày" },
  { value: "rain_heavy", label: "Mưa lớn" },
  { value: "fog_dense", label: "Sương mù" },
  { value: "night_dark", label: "Ban đêm" },
];

const ACTOR_OPTIONS = [
  { value: "", label: "Tác nhân" },
  { value: "sedan", label: "Ô tô Sedan" },
  { value: "truck", label: "Xe tải / Bus" },
  { value: "motorbike", label: "Xe máy" },
  { value: "pedestrian", label: "Người đi bộ" },
];

const MANEUVER_OPTIONS = [
  { value: "", label: "Hành vi" },
  { value: "cut_in", label: "Tạt đầu" },
  { value: "rear_end", label: "Va chạm đuôi" },
  { value: "emergency_brake", label: "Phanh gấp" },
  { value: "pedestrian_crossing", label: "Băng qua đường" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Trạng thái" },
  { value: "draft", label: "Bản nháp" },
  { value: "pending_sim_review", label: "Chờ duyệt mô phỏng" },
  { value: "simulation_queued", label: "Đã duyệt đợi chạy thử" },
  { value: "pending_library_review", label: "Chờ duyệt thư viện" },
  { value: "approved_library", label: "Đã duyệt chính thức" },
  { value: "rejected", label: "Bị từ chối" },
];

function LibraryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const tabParam = searchParams.get("tab") === "me" ? "me" : "public";
  const [activeTab, setActiveTab] = useState<"public" | "me">(tabParam);

  const [items, setItems] = useState<ScenarioItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [oddFilter, setOddFilter] = useState<ODDPayload>({});
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [toast, setToast] = useState<{ type: "error" | "success"; msg: string } | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<ScenarioItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Confirm Modal State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync tab state with URL (Admin is restricted to public library only)
  useEffect(() => {
    if (user?.role === "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab for admin
      setActiveTab("public");
    } else {
      setActiveTab(tabParam);
    }
  }, [tabParam, user?.role]);

  // Fetch logic
  const fetchData = useCallback(
    async (s: string, odd: ODDPayload, tab: "public" | "me") => {
      try {
        const query: Record<string, unknown> = { limit: 50 };
        if (s.trim()) query.search = s.trim();
        if (odd.road_type) query.road_type = odd.road_type;
        if (odd.weather) query.weather = odd.weather;
        if (odd.actor_type) query.actor_type = odd.actor_type;
        if (odd.maneuver) query.maneuver = odd.maneuver;

        if (tab === "public") {
          query.scope = "public";
        } else {
          query.scope = "me";
          query.user = user?.username || user?.name || "creator";
        }

        const res = await getScenarios(query);
        setItems(res.items || []);
        setTotal(res.total || 0);
      } catch (err) {
        console.error("Library fetch failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp dữ liệu thư viện khi tab hoặc điều kiện lọc thay đổi
    void fetchData(search, oddFilter, activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, activeTab, authLoading]);

  const handleTabSwitch = (tab: "public" | "me") => {
    setActiveTab(tab);
    setLoading(true);
    setStatusFilter("");
    router.push(tab === "public" ? "/library" : "/library?tab=me");
  };

  // Debounced search
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchData(val, oddFilter, activeTab);
    }, 400);
  };

  // Filter change
  const handleFilterChange = (key: keyof ODDPayload, val: string) => {
    const next = { ...oddFilter, [key]: val || undefined };
    setOddFilter(next);
    setLoading(true);
    void fetchData(search, next, activeTab);
  };

  // Filter items by status on client-side when statusFilter is active
  const displayItems = items.filter((item) => {
    if (activeTab === "me" && statusFilter) {
      if (statusFilter === "approved_library") {
        return item.status === "approved_library" || item.status === "approved_sim";
      }
      return item.status === statusFilter;
    }
    return true;
  });

  // Download .xosc status gate
  const handleDownload = async (
    e: React.MouseEvent,
    scenarioId: string,
    status: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (status !== "approved_library" && status !== "approved_sim") {
      setToast({
        type: "error",
        msg: "Chỉ kịch bản đã qua duyệt mới được phép tải file .xosc",
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
      case "draft":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-mono">Bản nháp</span>;
      case "approved_library":
      case "approved_sim":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">Đã duyệt (Library)</span>;
      case "rejected":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">Từ chối</span>;
      case "pending_review":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono">Chờ duyệt</span>;
      case "pending_sim_review":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">Chờ sim</span>;
      case "simulation_queued":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">Đã duyệt chờ sim</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{status}</span>;
    }
  };

  const controllerBadge = (evaluation: ScenarioItem["controller_evaluation"]) => {
    const outcome = evaluation?.outcome ?? "not_run";
    const badges: Record<string, { label: string; classes: string }> = {
      not_run: {
        label: "BA: Chưa đánh giá",
        classes: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700",
      },
      pending: {
        label: "BA: Đang chạy A/B",
        classes: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      },
      controller_collision: {
        label: "BA: Va chạm",
        classes: "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
      },
      near_failure: {
        label: "BA: Suýt thất bại",
        classes: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      },
      avoided_hazard: {
        label: "BA: Đã tránh",
        classes: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      },
      execution_failed: {
        label: "BA: Lỗi thực thi",
        classes: "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
      },
      incomparable_initial_conditions: {
        label: "BA: Cần chạy lại",
        classes: "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
      },
      inconclusive: {
        label: "BA: Chưa kết luận",
        classes: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700",
      },
    };
    const badge = badges[outcome] ?? badges.inconclusive;
    return (
      <span
        title={evaluation?.recommendation_vi ?? "Kịch bản chưa được đánh giá bằng BehaviorAgent"}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${badge.classes}`}
      >
        <Bot className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  // Open Edit Modal
  const handleOpenEdit = (e: React.MouseEvent, item: ScenarioItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.status === "approved_library" || item.status === "approved_sim") {
      setToast({ type: "error", msg: "Kịch bản đã duyệt được khóa cứng, không thể chỉnh sửa." });
      return;
    }
    setEditingItem(item);
    setEditTitle(item.title || "");
    setEditDesc(item.description_vi || "");
  };

  // Submit Edit
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setEditSubmitting(true);
    try {
      await updateScenario(editingItem.scenario_id, {
        title: editTitle,
        description_vi: editDesc,
        user: user?.username || user?.name || "creator",
      });
      setToast({ type: "success", msg: "Đã cập nhật kịch bản thành công!" });
      setEditingItem(null);
      void fetchData(search, oddFilter, activeTab);
    } catch (err) {
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Cập nhật kịch bản thất bại." });
    } finally {
      setEditSubmitting(false);
    }
  };

  // Submit for Review
  const handleSubmitForReview = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await submitScenario(id);
      setToast({ type: "success", msg: "Đã gửi kịch bản lên hàng chờ duyệt (HITL Review)!" });
      void fetchData(search, oddFilter, activeTab);
    } catch (err) {
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Gửi duyệt thất bại." });
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteScenario(deletingId, user?.username || user?.name || "creator");
      setToast({ type: "success", msg: `Đã xóa kịch bản ${deletingId} thành công!` });
      setDeletingId(null);
      void fetchData(search, oddFilter, activeTab);
    } catch (err) {
      setToast({ type: "error", msg: err instanceof Error ? err.message : "Xóa kịch bản thất bại." });
    }
  };

  const filterConfigs = [
    { key: "road_type" as const, options: ROAD_OPTIONS },
    { key: "weather" as const, options: WEATHER_OPTIONS },
    { key: "actor_type" as const, options: ACTOR_OPTIONS },
    { key: "maneuver" as const, options: MANEUVER_OPTIONS },
  ];

  return (
    <div className="min-h-screen p-6 pt-8 font-sans bg-white dark:bg-slate-950 text-[#0f2d59] dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
              toast.type === "error" ? "bg-amber-500 text-slate-950 font-bold" : "bg-green-600 text-white font-bold"
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            {toast.msg}
          </div>
        )}

        {/* ─── Header Banner ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#0f2d59] dark:text-slate-100">
                Thư viện kịch bản ODD
              </h1>
              <p className="text-sm text-blue-900/80 dark:text-slate-400 font-medium">
                {activeTab === "public"
                  ? "Thư viện Chung: Tất cả kịch bản đã qua duyệt chính thức (Read-Only & Download)"
                  : "Thư viện Cá nhân: Quản lý bản nháp, kịch bản chờ duyệt và lịch sử sinh kịch bản của tôi"}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-sky-50/80 dark:bg-slate-900 text-[#0f2d59] dark:text-blue-300 border border-sky-100 dark:border-slate-800 shadow-sm shrink-0">
            Hiển thị: {displayItems.length} / {total} kịch bản
          </span>
        </div>

        {/* ─── Tab Switcher (Chung vs Cá nhân) - Hidden for Admin ─── */}
        {user?.role === "admin" ? (
          <div className="flex items-center gap-2 border-b border-sky-100 dark:border-slate-800 pb-3">
            <span className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Thư viện Chung (Public Approved Library) — Chế độ Giám sát Admin (Read-Only & Download)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-b border-sky-100 dark:border-slate-800 pb-3">
            <button
              onClick={() => handleTabSwitch("public")}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activeTab === "public"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "bg-sky-50/70 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200/80 dark:border-slate-700"
              }`}
            >
              <Globe className="w-4 h-4" />
              Thư viện Chung (Public Approved)
            </button>

            <button
              onClick={() => handleTabSwitch("me")}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                activeTab === "me"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "bg-sky-50/70 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200/80 dark:border-slate-700"
              }`}
            >
              <User className="w-4 h-4" />
              Thư viện Cá nhân (My Scenarios)
            </button>
          </div>
        )}

        {/* ─── Search & Filters Toolbar (Deep Navy Theme & Single Row Layout) ─── */}
        <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-sky-100 dark:border-slate-800 shadow-sm">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center">
            {/* Search Input (~35% width / 4 of 12 columns on xl screens) */}
            <div className="relative xl:col-span-4 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1e3a8a] dark:text-sky-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 bg-sky-50/60 dark:bg-slate-800/80 border border-sky-200/80 dark:border-slate-700 rounded-xl text-xs md:text-sm text-[#0f2d59] dark:text-sky-100 placeholder:text-blue-900/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 transition font-medium"
                placeholder="Tìm kiếm từ khóa (tạt đầu, mưa lớn, cao tốc)..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Dropdown Filters Group (8 of 12 columns on xl screens) */}
            <div className="xl:col-span-8 flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#1e3a8a] dark:text-sky-400 hidden 2xl:block shrink-0" />
              <div className={`grid ${activeTab === "me" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"} gap-2 w-full`}>
                {/* Status Filter — Only displayed in My Scenarios tab */}
                {activeTab === "me" && (
                  <select
                    className="w-full px-2.5 py-2 bg-blue-50/80 dark:bg-slate-800/90 border border-blue-200/90 dark:border-slate-700 rounded-xl text-xs md:text-sm font-bold text-[#0f2d59] dark:text-sky-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-[#0f2d59] dark:text-slate-100 font-medium">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* ODD Filters */}
                {filterConfigs.map((filter) => (
                  <select
                    key={filter.key}
                    className="w-full px-2.5 py-2 bg-sky-50/60 dark:bg-slate-800/80 border border-sky-200/80 dark:border-slate-700 rounded-xl text-xs md:text-sm font-medium text-[#0f2d59] dark:text-sky-200 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition cursor-pointer"
                    value={(oddFilter[filter.key] as string) ?? ""}
                    onChange={(e) =>
                      handleFilterChange(filter.key, e.target.value)
                    }
                  >
                    {filter.options.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-[#0f2d59] dark:text-slate-100 font-medium">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Loading ─── */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl border border-sky-100 dark:border-slate-800 overflow-hidden space-y-3 p-4 shadow-sm">
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
        {!loading && displayItems.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-sky-100 dark:border-slate-800 p-12 text-center space-y-3 shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
            <h3 className="text-base font-bold text-[#0f2d59] dark:text-slate-100">
              Không tìm thấy kịch bản nào
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {activeTab === "public"
                ? "Chưa có kịch bản đã duyệt công khai. Hãy sinh kịch bản mới và gửi duyệt!"
                : statusFilter
                ? `Không có kịch bản nào có trạng thái '${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}'.`
                : "Bạn chưa tạo kịch bản cá nhân nào. Hãy bấm 'Sinh kịch bản mới' hoặc 'Lưu nháp' tại trang Generator."}
            </p>
          </div>
        )}

        {/* ─── Scenario Cards Grid ─── */}
        {!loading && displayItems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {displayItems.map((item) => {
              const isApproved =
                item.status === "approved_library" || item.status === "approved_sim";

              return (
                <div
                  key={item.scenario_id}
                  className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Body Content */}
                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {isApproved && (
                          <span title="Khóa chỉnh sửa kịch bản đã duyệt" className="p-1 rounded bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-slate-700">
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                        {statusBadge(item.status)}
                        {isApproved && controllerBadge(item.controller_evaluation)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                          <span className="truncate max-w-[180px]">
                            {item.scenario_id}
                          </span>
                          <span>{item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : ""}</span>
                        </div>
                        <h3 className="text-sm font-bold text-[#0f2d59] dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-1">
                          {item.title}
                        </h3>
                        {item.description_vi && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {item.description_vi}
                          </p>
                        )}
                      </div>

                      {/* ODD Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {item.odd?.road_type && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <MapPin className="w-2.5 h-2.5" />
                            {renderSafeValue(item.odd.road_type, ROAD_TYPE_LABELS)}
                          </span>
                        )}
                        {item.odd?.weather && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                            {renderSafeValue(item.odd.weather, WEATHER_LABELS)}
                          </span>
                        )}
                        {item.odd?.actor_type && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                            <Users className="w-2.5 h-2.5" />
                            {renderSafeValue(item.odd.actor_type, ACTOR_TYPE_LABELS)}
                          </span>
                        )}
                        {item.odd?.maneuver && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                            {renderSafeValue(item.odd.maneuver, MANEUVER_TYPE_LABELS)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions / Controls */}
                  <div className="px-5 py-3 bg-sky-50/40 dark:bg-slate-950/50 border-t border-sky-100/80 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2">
                    <Link
                      href={`/library/${item.scenario_id}`}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 group-hover:underline"
                    >
                      Chi tiết &rarr;
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {/* Controls for My Scenarios */}
                      {activeTab === "me" && (
                        <>
                          {item.status === "draft" && (
                            <button
                              onClick={(e) => handleSubmitForReview(e, item.scenario_id)}
                              title="Gửi kịch bản đi duyệt (HITL Review)"
                              className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 transition cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {!isApproved ? (
                            <>
                              <button
                                onClick={(e) => handleOpenEdit(e, item)}
                                title="Chỉnh sửa mô tả / tên kịch bản"
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeletingId(item.scenario_id);
                                }}
                                title="Xóa kịch bản"
                                className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                              <Lock className="w-3 h-3 text-slate-400" />
                              Đã khóa
                            </span>
                          )}
                        </>
                      )}

                      {/* Download .xosc Button */}
                      <button
                        onClick={(e) => handleDownload(e, item.scenario_id, item.status)}
                        disabled={!isApproved}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                          isApproved
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                        }`}
                      >
                        <Download className="w-3 h-3" />
                        .xosc
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Edit Scenario Modal ─── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-sky-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-[#0f2d59] dark:text-slate-100 flex items-center gap-2">
                <Edit className="w-4 h-4 text-blue-600" />
                Chỉnh sửa kịch bản ({editingItem.scenario_id})
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#0f2d59] dark:text-slate-300 mb-1">
                  Tên kịch bản:
                </label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0f2d59] dark:text-slate-300 mb-1">
                  Mô tả tình huống tiếng Việt:
                </label>
                <textarea
                  className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-sky-100 dark:border-slate-800">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {editSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 font-bold text-base">
              <Trash2 className="w-6 h-6" />
              Xác nhận xóa kịch bản?
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Bạn có chắc chắn muốn xóa kịch bản <code className="font-bold text-[#0f2d59] dark:text-slate-100">{deletingId}</code>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
              >
                Xác nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-6 font-sans bg-white dark:bg-slate-950 text-[#0f2d59] dark:text-slate-100 flex items-center justify-center">Đang tải thư viện...</div>}>
      <LibraryContent />
    </Suspense>
  );
}
