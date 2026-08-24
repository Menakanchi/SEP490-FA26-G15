"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Shield,
  CheckCircle2,
  XCircle,
  User,
  Loader2,
  Map,
  Users,
  AlertTriangle,
  FileCode,
  Copy,
  Download,
  Filter,
  RefreshCw,
  Layers,
  Sparkle,
} from "lucide-react";
import { getScenarios, getScenarioById, postReview, downloadXosc, completeSimulation } from "@/services/api";
import ScenarioPreview from "@/components/ScenarioPreview";
import { RoleGate } from "@/components/RoleGate";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/context/AuthContext";
import type { DuplicateDiff, ScenarioItem, ScenarioDetail, ReviewGate } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
  renderActorCategoryLabel,
} from "@/types";

const REVIEW_STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "pending_sim_review", label: "Chờ duyệt mô phỏng (Cổng 1)" },
  { value: "simulation_queued", label: "Chờ chạy thử (Queued)" },
  { value: "pending_library_review", label: "Chờ duyệt thư viện (Cổng 2)" },
  { value: "approved_library", label: "Đã duyệt chính thức" },
  { value: "rejected", label: "Bị từ chối" },
];

const DUPLICATE_ROLE_LABELS: Record<string, string> = {
  ego: "xe ego",
  car: "ô tô con",
  motorcycle: "xe máy",
  truck: "xe tải",
  pedestrian: "người đi bộ",
};

const DUPLICATE_MANEUVER_LABELS: Record<string, string> = {
  cut_in: "tạt đầu",
  sudden_brake: "phanh gấp",
  lane_drift: "lấn làn",
  stop_in_lane: "dừng giữa làn",
  run_red_light: "vượt đèn đỏ",
  wrong_way: "đi ngược chiều",
  jaywalk: "băng ngang đường",
};

function duplicateFieldLabel(field: string): string {
  const parts = field.split(".");
  if (parts[0] === "actors") {
    const role = DUPLICATE_ROLE_LABELS[parts[1]] ?? parts[1];
    if (parts[2] === "s_offset_m") return `Vị trí dọc của ${role}`;
    if (parts[2] === "initial_speed_kmh") return `Tốc độ ban đầu của ${role}`;
  }
  if (parts[0] === "maneuvers") {
    const maneuver = DUPLICATE_MANEUVER_LABELS[parts[1]] ?? parts[1];
    if (parts.slice(2).join(".") === "trigger.value") return `Ngưỡng kích hoạt hành vi ${maneuver}`;
    if (parts[2] === "target_speed_kmh") return `Tốc độ đích khi ${maneuver}`;
  }
  return field;
}

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialScenarioId = searchParams.get("scenario_id");
  const { user, role } = useAuth();

  // Admin Route Guard: Redirect Admin to /admin
  useEffect(() => {
    if (user?.role === "admin" || role === "admin") {
      router.push("/admin");
    }
  }, [user?.role, role, router]);

  // State: List
  const [list, setList] = useState<ScenarioItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  // State: Selected Scenario Detail
  const [selectedId, setSelectedId] = useState<string | null>(initialScenarioId);
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  // Form State
  const [reviewer, setReviewer] = useState(user?.name || user?.username || user?.email || "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ reviewer?: string; reason?: string }>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [nearDuplicate, setNearDuplicate] = useState<DuplicateDiff | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);

  // Fetch List
  const fetchScenarioList = useCallback(async () => {
    try {
      const res = await getScenarios({ limit: 50, reviewQueue: true });
      const fetchedItems = res.items || [];
      setList(fetchedItems);

      if (fetchedItems.length > 0) {
        let defaultId = initialScenarioId;
        if (!defaultId || !fetchedItems.some((item) => item.scenario_id === defaultId)) {
          defaultId = fetchedItems[0].scenario_id;
        }
        setSelectedId(defaultId);
      } else {
        setSelectedId(null);
        setScenario(null);
      }
    } catch (err) {
      console.error("Failed to load scenario list", err);
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, [initialScenarioId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp dữ liệu lúc mount
    void fetchScenarioList();
  }, [fetchScenarioList]);

  // Fetch Selected Detail
  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear scenario state when selectedId is null
      setScenario(null);
      return;
    }

    setDetailLoading(true);
    setDetailError(false);
    getScenarioById(selectedId)
      .then((data) => {
        setScenario(data);
        setDetailLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load scenario detail", err);
        setDetailError(true);
        setDetailLoading(false);
      });
  }, [selectedId]);

  const handleSelectScenario = (id: string) => {
    setNearDuplicate(null);
    setSelectedId(id);
    router.replace(`/review?scenario_id=${id}`, { scroll: false });
  };

  const gateToReview: ReviewGate =
    scenario?.status === "pending_sim_review" ? "before_sim" : "before_library";

  const gateLabel =
    gateToReview === "before_sim" ? "Cổng 1: Mô phỏng (BEFORE_SIM)" : "Cổng 2: Thư viện (BEFORE_LIBRARY)";

  const handleSubmitReview = async (approved: boolean, forceSimulate = false) => {
    if (!scenario) return;

    const errors: { reviewer?: string; reason?: string } = {};
    if (!reviewer.trim()) {
      errors.reviewer = "Vui lòng nhập tên reviewer chịu trách nhiệm.";
    }
    if (!approved && (!reason.trim() || reason.trim().length < 10)) {
      errors.reason = "Vui lòng nhập lý do từ chối (bắt buộc từ 10 ký tự trở lên).";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    try {
      const result = await postReview({
        scenario_id: scenario.scenario_id,
        gate: gateToReview,
        approved,
        reviewer: reviewer.trim(),
        reason: forceSimulate && nearDuplicate
          ? `Vẫn chạy dù gần trùng với ${nearDuplicate.duplicate_scenario_id}. ${reason.trim()}`.trim()
          : reason.trim() || "Chấp nhận kịch bản",
        force_simulate: forceSimulate,
      });

      if (result.warning === "near_duplicate" && result.duplicate) {
        setNearDuplicate(result.duplicate);
        setToast(null);
        return;
      }

      setNearDuplicate(null);

      setToast({
        type: "success",
        msg: approved
          ? `Đã phê duyệt kịch bản ${scenario.scenario_id} tại ${gateLabel}!`
          : `Đã từ chối kịch bản ${scenario.scenario_id}.`,
      });

      setListLoading(true);
      await fetchScenarioList();
      const updated = await getScenarioById(scenario.scenario_id);
      setScenario(updated);
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Lỗi khi gửi quyết định duyệt.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteSimulation = async (passed: boolean) => {
    if (!scenario) return;
    setSubmitting(true);
    try {
      await completeSimulation(scenario.scenario_id, {
        passed,
        notes: reason.trim() || (passed ? "Đã kiểm thử mô phỏng ngoại tuyến đạt yêu cầu" : "Báo lỗi mô phỏng ngoại tuyến"),
      });

      setToast({
        type: "success",
        msg: passed
          ? `Đã xác nhận chạy thử Đạt! Kịch bản ${scenario.scenario_id} đã chuyển sang 'Chờ duyệt thư viện' (pending_library_review).`
          : `Đã báo lỗi mô phỏng. Kịch bản ${scenario.scenario_id} đã chuyển sang Từ chối (rejected).`,
      });

      setListLoading(true);
      await fetchScenarioList();
      const updated = await getScenarioById(scenario.scenario_id);
      setScenario(updated);
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Lỗi khi cập nhật kết quả mô phỏng.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyXml = () => {
    if (scenario?.xosc_content) {
      navigator.clipboard.writeText(scenario.xosc_content);
      setXmlCopied(true);
      setTimeout(() => setXmlCopied(false), 2000);
    }
  };

  const handleDownloadXml = async () => {
    if (!scenario) return;
    try {
      const xml = await downloadXosc(scenario.scenario_id);
      const blob = new Blob([xml], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scenario.scenario_id}.xosc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Chưa được phép tải file .xosc",
      });
    }
  };

  // Filter logic based on dropdown status selection
  const displayList = list.filter((s) => {
    if (!statusFilter || statusFilter === "all") return true;
    if (statusFilter === "approved_library") {
      return s.status === "approved_library" || s.status === "approved_sim";
    }
    return s.status === statusFilter;
  });

  return (
    <div className="min-h-screen max-w-7xl mx-auto p-4 md:p-6 space-y-6 font-sans bg-slate-50 dark:bg-slate-950 text-[#0f2d59] dark:text-slate-100 transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-600 text-white shadow-green-500/20 font-bold"
              : "bg-red-600 text-white shadow-red-500/20 font-bold"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Top Header Banner (Light Blue Aesthetic Box) */}
      <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-[#0f2d59] dark:text-white">
              Kiểm duyệt kịch bản (Reviewer Flow - HITL)
            </h1>
            <p className="text-xs md:text-sm text-blue-900/80 dark:text-slate-400 font-medium">
              Cổng duyệt hai tầng: Thư viện (BEFORE_LIBRARY) & Mô phỏng (BEFORE_SIM)
            </p>
          </div>
        </div>

        {/* Dynamic Status Filter Dropdown & Refresh Controls */}
        <div className="relative flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs md:text-sm font-semibold bg-transparent text-[#0f2d59] dark:text-sky-200 focus:outline-none cursor-pointer"
            >
              {REVIEW_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-[#0f2d59] dark:text-slate-100 font-medium">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setListLoading(true);
              void fetchScenarioList();
            }}
            className="text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 border border-sky-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0f2d59] dark:text-slate-300 hover:bg-sky-100/80 dark:hover:bg-slate-700 font-bold transition cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ${listLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Main Grid: Left Sidebar + Right Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar List Container */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold text-[#0f2d59] dark:text-slate-400 uppercase tracking-wider">
                Danh sách kịch bản ({displayList.length})
              </h2>
              {statusFilter !== "all" && (
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                  Lọc: {REVIEW_STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                </span>
              )}
            </div>

            {listLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                Không tìm thấy kịch bản nào khớp với bộ lọc.
              </div>
            ) : (
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {displayList.map((item) => {
                  const isSelected = item.scenario_id === selectedId;
                  return (
                    <button
                      key={item.scenario_id}
                      onClick={() => handleSelectScenario(item.scenario_id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-sky-100/90 dark:bg-blue-950/60 border-2 border-blue-600 text-blue-950 dark:text-purple-100 shadow-sm font-bold"
                          : "bg-white dark:bg-slate-800/60 border-sky-100 dark:border-slate-700 text-[#0f2d59] dark:text-slate-200 hover:border-blue-300 hover:bg-sky-50/50 shadow-xs"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 dark:text-cyan-400 truncate">
                          {item.scenario_id}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            item.status === "approved_library" || item.status === "approved_sim"
                              ? "bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                              : item.status === "rejected"
                              ? "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                              : item.status === "simulation_queued"
                              ? "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#0f2d59] dark:text-slate-300 mt-1 line-clamp-1 font-semibold">
                        {item.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Pane Containers (Light Blue Aesthetic Cards) */}
        <div className="lg:col-span-8 space-y-6">
          {detailLoading ? (
            <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-12 flex items-center justify-center shadow-sm">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : detailError || !scenario ? (
            <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-600 dark:text-slate-400 text-sm font-medium shadow-sm">
              Vui lòng chọn một kịch bản từ danh sách bên trái để kiểm duyệt.
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/60 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0f2d59] dark:text-white">
                      {scenario.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      ID: {scenario.scenario_id} | Trạng thái hiện tại:{" "}
                      <strong className="text-purple-600 dark:text-purple-400">{scenario.status}</strong>
                    </p>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    Cổng áp dụng: {gateLabel}
                  </span>
                </div>

                {/* ⚠️ Inferred ODD Warning Banner */}
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/80 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block text-amber-950 dark:text-amber-200 mb-0.5">
                      Cảnh báo thông số tự suy luận (Inferred ODD Warning):
                    </strong>
                    <span>
                      Hệ thống tự điền giả định mặc định cho các trục ODD không được đề cập trong prompt. Kỹ sư duyệt cần kiểm tra các thông số ODD và mảng actors bên dưới trước khi phê duyệt.
                    </span>
                  </div>
                </div>

                {/* 4 ODD Cell Parameter Boxes (Light Blue Tint) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-sky-100/60 dark:bg-slate-800 text-[#0f2d59] dark:text-sky-100 border border-sky-300/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Đường</span>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400">
                      {renderSafeValue(scenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-100/60 dark:bg-slate-800 text-[#0f2d59] dark:text-sky-100 border border-sky-300/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Thời tiết</span>
                    <span className="text-xs font-bold text-cyan-700 dark:text-cyan-400">
                      {renderSafeValue(scenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-100/60 dark:bg-slate-800 text-[#0f2d59] dark:text-sky-100 border border-sky-300/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Tác nhân</span>
                    <span className="text-xs font-bold text-orange-700 dark:text-orange-400">
                      {renderSafeValue(scenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-100/60 dark:bg-slate-800 text-[#0f2d59] dark:text-sky-100 border border-sky-300/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Hành vi</span>
                    <span className="text-xs font-bold text-red-700 dark:text-red-400">
                      {renderSafeValue(scenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Preview — bản khai trước khi chạy, quỹ đạo đo được sau khi chạy */}
              <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                  <Map className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  {scenario.latest_execution_result?.trajectory?.length
                    ? "Quỹ đạo đo được trên CARLA"
                    : "Bản khai kịch bản (chưa chạy mô phỏng)"}
                </h3>
                <ScenarioPreview
                  spec={scenario.spec}
                  execution={scenario.latest_execution_result}
                />
              </div>

              {/* All Actors Table Box */}
              {scenario.spec?.actors?.length ? (
                <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    Danh sách toàn bộ Tác nhân (`spec.actors` - {scenario.spec.actors.length} đối tượng):
                  </h3>
                  <div className="w-full overflow-x-auto rounded-2xl border border-sky-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                    <table className="min-w-[640px] w-full text-left border-collapse">
                      <thead className="bg-sky-100/60 dark:bg-slate-800/80 text-[#1e3a8a] dark:text-sky-300 font-semibold text-xs tracking-wider uppercase border-b border-sky-200/80 dark:border-slate-700">
                        <tr>
                          <th className="py-3 px-4 whitespace-nowrap">Tên đối tượng</th>
                          <th className="py-3 px-4 whitespace-nowrap">Loại xe</th>
                          <th className="py-3 px-4 whitespace-nowrap">Vai trò</th>
                          <th className="py-3 px-4 whitespace-nowrap">
                            Làn đường <span className="text-[10px] font-normal text-slate-500 normal-case">(lane_offset)</span>
                          </th>
                          <th className="py-3 px-4 whitespace-nowrap">
                            Khoảng cách <span className="text-[10px] font-normal text-slate-500 normal-case">(m)</span>
                          </th>
                          <th className="py-3 px-4 whitespace-nowrap">
                            Vận tốc <span className="text-[10px] font-normal text-slate-500 normal-case">(km/h)</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100 dark:divide-slate-800 text-xs md:text-sm">
                        {scenario.spec.actors.map((actor, idx) => (
                          <tr key={actor.name || idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-blue-700 dark:text-cyan-300 whitespace-nowrap">
                              {actor.name}
                            </td>
                            <td className="py-3 px-4 font-bold text-[#0f2d59] dark:text-slate-100 whitespace-nowrap">
                              {renderActorCategoryLabel(actor, scenario.odd)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {actor.is_ego ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  Xe chính (Hero)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  Xe phụ (Adversary)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              Làn {actor.position?.lane_offset || 0}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {actor.position?.s_offset_m ?? 0} m
                            </td>
                            <td className="py-3 px-4 font-mono font-semibold text-blue-900 dark:text-blue-300 whitespace-nowrap">
                              {actor.initial_speed_kmh ?? 50} km/h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Retrieved Examples Block Box */}
              <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Kịch bản mẫu được Retrieve (`retrieved_examples`):
                </h3>

                {!scenario.retrieved_examples || scenario.retrieved_examples.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 flex items-center gap-3">
                    <Sparkle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <div>
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 text-xs font-bold mr-2 border border-purple-200 dark:border-purple-700">
                        Chế độ Zero-Shot
                      </span>
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        Không có kịch bản mẫu tương đồng trong cơ sở dữ liệu.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {scenario.retrieved_examples.map((item, idx) => {
                      const scorePct = item.similarity_score
                        ? Math.round(item.similarity_score * 100)
                        : 85;
                      return (
                        <div
                          key={item.id || idx}
                          className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl border border-sky-200/80 dark:border-slate-700/60 space-y-2 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-[#0f2d59] dark:text-slate-100 truncate">
                              {item.title || item.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-mono text-[10px] font-bold border border-purple-200 dark:border-purple-800">
                              {scorePct}% Tương đồng
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {item.content || item.description_vi}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Decision Form Box / Manual Simulation Control Box */}
              {scenario.status === "simulation_queued" ? (
                <div className="bg-sky-50/90 dark:bg-slate-900 border-2 border-blue-500/80 rounded-3xl p-6 space-y-4 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 dark:border-slate-800 pb-3">
                    <h3 className="text-base font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                      <Sparkle className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                      Kiểm thử Mô phỏng Ngoại tuyến (Manual Simulation Test)
                    </h3>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-300">
                      Trạng thái: simulation_queued
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Kịch bản đã được phê duyệt ở Cổng 1 và đang ở trạng thái chờ chạy thử mô phỏng (<code className="font-bold text-blue-700">simulation_queued</code>). Kỹ sư/Reviewer có thể tải file <code className="font-bold text-blue-700">.xosc</code> bên dưới về mô phỏng ngoại tuyến (Esmini / CARLA / Ansys) và xác nhận kết quả kiểm thử:
                  </p>

                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-sky-200/80 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0f2d59] dark:text-slate-200">
                        1. Tải file cấu hình kịch bản:
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadXml}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Tải file {scenario.scenario_id}.xosc
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0f2d59] dark:text-slate-300 mb-1">
                        2. Ghi chú kết quả chạy thử (Tùy chọn / Bắt buộc nếu từ chối):
                      </label>
                      <textarea
                        className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Ghi chú kết quả mô phỏng (Ví dụ: Đã test chạy thử trên Esmini/CARLA đạt yêu cầu va chạm tại 35m)..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <RoleGate
                    allowedRoles={["reviewer", "admin"]}
                    fallback={
                      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-300 text-xs">
                        Quyền xác nhận kết quả chạy thử chỉ dành cho <strong>Reviewer</strong> hoặc <strong>Admin</strong>.
                      </div>
                    }
                  >
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleCompleteSimulation(false)}
                        disabled={submitting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        🔴 Báo lỗi mô phỏng / Từ chối
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCompleteSimulation(true)}
                        disabled={submitting}
                        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        🟢 Xác nhận đã chạy thử Đạt
                      </button>
                    </div>
                  </RoleGate>
                </div>
              ) : (
                <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                  <h3 className="text-base font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Form Phê duyệt / Từ chối (HITL Decision Form)
                  </h3>

                  {nearDuplicate && gateToReview === "before_sim" && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                            Gần trùng với {nearDuplicate.duplicate_scenario_id}
                          </p>
                          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                            Chưa có job CARLA nào được tạo. Hãy xem chênh lệch rồi quyết định dùng bản cũ hoặc vẫn chạy bản này.
                          </p>
                        </div>
                      </div>
                      {nearDuplicate.differences.length > 0 ? (
                        <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                          {nearDuplicate.differences.map((difference, index) => (
                            <div key={`${difference.field}-${index}`} title={difference.field}>
                              <span className="font-semibold">{duplicateFieldLabel(difference.field)}</span>:{" "}
                              <span className="font-mono">{String(difference.existing)} → {String(difference.current)}</span>
                              {difference.delta !== null ? ` (Δ ${difference.delta}${difference.unit ? ` ${difference.unit}` : ""})` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-800 dark:text-amber-300">Động học trùng hoàn toàn trong ngưỡng so sánh.</p>
                      )}
                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => router.push(`/library/${nearDuplicate.duplicate_scenario_id}`)}
                          className="px-3 py-2 rounded-xl border border-amber-400 text-amber-900 dark:text-amber-200 text-xs font-bold"
                        >
                          Xem bản đã có
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSubmitReview(true, true)}
                          disabled={submitting}
                          className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50"
                        >
                          Vẫn chạy CARLA
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ❌ Critical Error Banner */}
                  {(formErrors.reviewer || formErrors.reason) && (
                    <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 text-xs text-red-800 dark:text-red-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-red-900 dark:text-red-200">
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        Lỗi kiểm tra dữ liệu đầu vào (Validation Error):
                      </div>
                      {formErrors.reviewer && <p>• {formErrors.reviewer}</p>}
                      {formErrors.reason && <p>• {formErrors.reason}</p>}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#0f2d59] dark:text-slate-300 mb-1.5">
                        Tên kỹ sư / reviewer chịu trách nhiệm <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className={`w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition ${formErrors.reviewer ? "border-red-500" : ""}`}
                        placeholder="Ví dụ: Engineer QA Lead"
                        value={reviewer}
                        onChange={(e) => setReviewer(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0f2d59] dark:text-slate-300 mb-1.5">
                        Lý do đánh giá / ghi chú lý do từ chối (Ghi rõ nguyên nhân nếu Reject)
                      </label>
                      <textarea
                        className={`w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition min-h-[80px] ${formErrors.reason ? "border-red-500" : ""}`}
                        placeholder="Bắt buộc có từ 10 ký tự trở lên khi từ chối (Reject)..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <RoleGate
                    allowedRoles={["reviewer", "admin"]}
                    fallback={
                      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            Tài khoản hiện tại ở vai trò <strong>{role || "guest"}</strong> (Chỉ được xem). Quyền Phê duyệt / Từ chối kịch bản chỉ dành cho <strong>Reviewer</strong> hoặc <strong>Admin</strong>.
                          </span>
                        </div>
                      </div>
                    }
                  >
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleSubmitReview(false)}
                        disabled={submitting}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        Từ chối (Reject)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSubmitReview(true)}
                        disabled={submitting}
                        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Phê duyệt (Approve)
                      </button>
                    </div>
                  </RoleGate>
                </div>
              )}

              {/* OpenSCENARIO Code View & Download Box */}
              <div className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Mã OpenSCENARIO XML
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyXml}
                      disabled={!scenario.xosc_content}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs font-bold text-[#0f2d59] dark:text-slate-300 hover:bg-sky-100/80 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 inline mr-1 text-blue-600 dark:text-blue-400" />
                      {xmlCopied ? "Đã chép!" : "Sao chép"}
                    </button>
                    <button
                      onClick={handleDownloadXml}
                      disabled={scenario.status !== "approved_library"}
                      title={
                        scenario.status === "approved_library"
                          ? "Tải file .xosc"
                          : "Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc"
                      }
                      className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition ${
                        scenario.status !== "approved_library" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      <Download className="w-3.5 h-3.5 inline mr-1" />
                      Tải .xosc
                    </button>
                  </div>
                </div>

                {scenario.xosc_content ? (
                  <pre className="p-4 bg-slate-950 text-slate-100 rounded-2xl max-h-[300px] overflow-auto text-xs font-mono border border-slate-800">
                    <code>{scenario.xosc_content}</code>
                  </pre>
                ) : (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    Chưa có mã XML
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRoleGuard({ children }: { children: React.ReactNode }) {
  const { role, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated && role === "creator") {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, role, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-purple-600">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (role === "creator") {
    return null;
  }

  return <AuthGate allowedRoles={["reviewer", "admin"]}>{children}</AuthGate>;
}

export default function ReviewPage() {
  return (
    <ReviewRoleGuard>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-purple-600">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        }
      >
        <ReviewPageContent />
      </Suspense>
    </ReviewRoleGuard>
  );
}
