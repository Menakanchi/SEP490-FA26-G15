"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
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
  ClipboardCheck,
} from "lucide-react";

import { getScenarios, getScenarioById, postReview, downloadXosc, completeSimulation } from "@/services/api";
import ScenarioPreview from "@/components/ScenarioPreview";
import { RoleGate } from "@/components/RoleGate";
import { AuthGate } from "@/components/AuthGate";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import type { AssumptionSource, DuplicateDiff, ScenarioItem, ScenarioDetail, ReviewGate } from "@/types";
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

const ODD_AXIS_LABELS: Record<string, string> = {
  road_type: "Đường",
  weather: "Thời tiết",
  actor_type: "Tác nhân",
  maneuver: "Hành vi",
};

/** Hai nguồn có độ tin cậy khác hẳn nhau, nên hiện tách bạch chứ không gộp thành
 * "tự điền": `inferred` là máy đọc câu mà suy ra (thường đúng), `default` là câu
 * không hề nhắc tới. Reviewer cần biết cái nào đáng nghi hơn. */
const ASSUMPTION_SOURCE_LABELS: Record<AssumptionSource, string> = {
  inferred: "máy suy ra từ câu",
  default: "máy điền mặc định",
};

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

  const fetchScenarioDetail = useCallback(async (id: string, showLoading = true) => {
    if (showLoading) setDetailLoading(true);
    setDetailError(false);
    try {
      const data = await getScenarioById(id);
      setScenario(data);
      return data;
    } catch (err) {
      console.error("Failed to load scenario detail", err);
      setDetailError(true);
      return null;
    } finally {
      if (showLoading) setDetailLoading(false);
    }
  }, []);

  // Fetch Selected Detail
  useEffect(() => {
    if (!selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp detail khi scenario được chọn
    void fetchScenarioDetail(selectedId);
  }, [fetchScenarioDetail, selectedId]);

  // Worker cập nhật trạng thái ở backend. Tab Review đang mở phải tự theo dõi
  // đúng scenario thay vì bắt reviewer reload cả trang (reload trước đây còn
  // làm lộ lỗi session bị đổi thành Admin).
  useEffect(() => {
    if (!selectedId || scenario?.status !== "simulation_queued") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const updated = await getScenarioById(selectedId);
        if (cancelled) return;
        setScenario(updated);
        if (updated.status !== "simulation_queued") {
          setListLoading(true);
          void fetchScenarioList();
          if (updated.status === "pending_library_review") {
            setToast({
              type: "success",
              msg: `CARLA đã trả kết quả cho ${updated.scenario_id}. Kịch bản đã chuyển sang Cổng 2.`,
            });
            window.setTimeout(() => {
              document.getElementById("review-decision")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }, 100);
          }
        }
      } catch {
        // Worker hoặc backend có thể đang đổi world; giữ kết quả gần nhất và
        // thử lại ở nhịp sau. Nút Làm mới vẫn cho phép thử ngay có chủ đích.
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchScenarioList, scenario?.status, selectedId]);

  const handleSelectScenario = (id: string) => {
    setNearDuplicate(null);
    setSelectedId(id);
    router.replace(`/review?scenario_id=${id}`, { scroll: false });
  };

  const gateToReview: ReviewGate =
    scenario?.status === "pending_sim_review" ? "before_sim" : "before_library";

  const gateLabel =
    gateToReview === "before_sim" ? "Cổng 1: Mô phỏng (BEFORE_SIM)" : "Cổng 2: Thư viện (BEFORE_LIBRARY)";

  /** Trục ODD máy tự điền. Rỗng là một câu trả lời có nghĩa — không phải "chưa có
   * dữ liệu" — nên UI nói thẳng "cả bốn trục đều do người gõ" thay vì im lặng. */
  const assumptions = scenario?.assumptions ?? [];

  const handleSubmitReview = async (approved: boolean, forceSimulate = false) => {
    if (!scenario) return;

    const errors: { reviewer?: string; reason?: string } = {};
    if (!reviewer.trim()) {
      errors.reviewer = "Vui lòng nhập tên reviewer chịu trách nhiệm.";
    }
    if (!approved && (!reason.trim() || reason.trim().length < 10)) {
      errors.reason = "Vui lòng nhập lý do từ chối (bắt buộc từ 10 ký tự trở lên).";
    }
    const overridingIntentMismatch =
      approved && gateToReview === "before_library" && scenario.intent_evaluation?.verdict === false;
    if (overridingIntentMismatch && reason.trim().length < 10) {
      errors.reason = "Máy báo sai ý định; muốn phê duyệt ngoại lệ, vui lòng ghi lý do ít nhất 10 ký tự.";
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
        force_intent_override: overridingIntentMismatch,
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
          ? gateToReview === "before_sim"
            ? `Đã duyệt Cổng 1 & tự động tạo mô phỏng. Kịch bản ${scenario.scenario_id} đã sẵn sàng tại trang Chấm ý định`
            : `Đã phê duyệt kịch bản ${scenario.scenario_id} tại ${gateLabel}!`
          : `Đã từ chối kịch bản ${scenario.scenario_id}.`,
      });

      setListLoading(true);
      await fetchScenarioList();
      await fetchScenarioDetail(scenario.scenario_id, false);
      router.refresh();
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown> | null | undefined;
      const resData = (errObj?.response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const detailMsg =
        resData?.detail ||
        errObj?.data ||
        errObj?.detail ||
        (err instanceof Error ? err.message : String(err));

      const finalMsg =
        typeof detailMsg === "string"
          ? detailMsg
          : Array.isArray(detailMsg)
          ? detailMsg
              .map((d: Record<string, unknown> | string) => {
                if (typeof d === "string") return d;
                if (d && typeof d === "object") {
                  const locArr = (d as { loc?: unknown[] }).loc;
                  const field = Array.isArray(locArr)
                    ? locArr.filter((x: unknown) => x !== "body").join(".")
                    : "";
                  const msg = (d as { msg?: string }).msg || JSON.stringify(d);
                  return field ? `${field}: ${msg}` : msg;
                }
                return String(d);
              })
              .join("; ")
          : typeof detailMsg === "object" && detailMsg !== null
          ? (detailMsg as { msg?: string; message?: string }).msg ||
            (detailMsg as { msg?: string; message?: string }).message ||
            JSON.stringify(detailMsg)
          : String(detailMsg);

      setToast({
        type: "error",
        msg: finalMsg || "Lỗi khi gửi quyết định duyệt.",
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
      await fetchScenarioDetail(scenario.scenario_id, false);
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

  const handleRefresh = async () => {
    setListLoading(true);
    await Promise.all([
      fetchScenarioList(),
      selectedId ? fetchScenarioDetail(selectedId, false) : Promise.resolve(null),
    ]);
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
    <div className="max-w-7xl mx-auto space-y-6 font-sans text-slate-900 dark:text-slate-100">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
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

      {/* Header Glass Box */}
      <div className="bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-2xl rounded-[32px] p-6 sm:p-7 transition-all">
        <PageHeader
          icon={ClipboardCheck}
          title="HITL Review — Phê duyệt kịch bản"
          subtitle="Cổng duyệt hai tầng: Thư viện (BEFORE_LIBRARY) & Mô phỏng CARLA (BEFORE_SIM)"
          badge="HITL Review"
          actions={
            <div className="relative flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-2 shadow-xs backdrop-blur-md">
                <Filter className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs md:text-sm font-bold bg-transparent text-slate-900 dark:text-sky-200 focus:outline-none cursor-pointer"
                >
                  {REVIEW_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium">
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
                className="text-xs px-4 py-2.5 rounded-2xl flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 font-extrabold transition cursor-pointer shadow-xs backdrop-blur-md"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 ${listLoading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
            </div>
          }
        />
      </div>

      {/* Main Grid: Left Sidebar + Right Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar List Container */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white/75 dark:bg-slate-900/85 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-[32px] p-5 shadow-2xl">
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

                {/* Trục ODD do máy tự điền — chỉ cảnh báo khi THẬT SỰ có, và nói rõ
                    trục nào. Banner bật ở mọi kịch bản là banner không ai đọc, và
                    lúc có một suy luận sai thật thì nó chìm nghỉm. */}
                {assumptions.length > 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/80 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold block text-amber-950 dark:text-amber-200 mb-1">
                        {assumptions.length}/4 trục ODD không do người dùng gõ ra
                      </strong>
                      <ul className="space-y-0.5">
                        {assumptions.map((assumption) => (
                          <li key={assumption.field}>
                            <strong className="font-semibold">
                              {ODD_AXIS_LABELS[assumption.field] ?? assumption.field}
                            </strong>{" = "}
                            <code className="font-mono">{assumption.value}</code>
                            {" — "}
                            {ASSUMPTION_SOURCE_LABELS[assumption.source] ?? assumption.source}
                            {assumption.reason_vi ? `: ${assumption.reason_vi}` : ""}
                          </li>
                        ))}
                      </ul>
                      <span className="block mt-1.5">
                        Một trục đoán sai vừa làm hẹp kết quả tìm ví dụ mẫu, vừa đổi nội dung kịch bản. Đối chiếu với
                        câu gốc trước khi phê duyệt.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/80 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200 shadow-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>
                      Cả bốn trục ODD đều đọc được từ câu người dùng gõ — không có giá trị nào do hệ thống đoán.
                    </span>
                  </div>
                )}

                {/* 4 ODD Cell Parameter Boxes (Light Blue Tint) — ô nào do máy điền
                    thì viền hổ phách và có badge, để cảnh báo ở trên trỏ được vào
                    đúng chỗ thay vì bắt reviewer tự dò. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(
                    [
                      {
                        axis: "road_type",
                        label: "Đường",
                        value: renderSafeValue(scenario.odd?.road_type, ROAD_TYPE_LABELS),
                        tone: "text-blue-700 dark:text-blue-400",
                      },
                      {
                        axis: "weather",
                        label: "Thời tiết",
                        value: renderSafeValue(scenario.odd?.weather, WEATHER_LABELS),
                        tone: "text-cyan-700 dark:text-cyan-400",
                      },
                      {
                        axis: "actor_type",
                        label: "Tác nhân",
                        value: renderSafeValue(scenario.odd?.actor_type, ACTOR_TYPE_LABELS),
                        tone: "text-orange-700 dark:text-orange-400",
                      },
                      {
                        axis: "maneuver",
                        label: "Hành vi",
                        value: renderSafeValue(scenario.odd?.maneuver, MANEUVER_TYPE_LABELS),
                        tone: "text-red-700 dark:text-red-400",
                      },
                    ] as const
                  ).map((box) => {
                    const guessed = assumptions.find((assumption) => assumption.field === box.axis);
                    return (
                      <div
                        key={box.axis}
                        title={guessed?.reason_vi || undefined}
                        className={`p-3 rounded-xl text-center shadow-xs border text-[#0f2d59] dark:text-sky-100 ${
                          guessed
                            ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/80"
                            : "bg-sky-100/60 dark:bg-slate-800 border-sky-300/70 dark:border-slate-700"
                        }`}
                      >
                        <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">
                          {box.label}
                        </span>
                        <span className={`text-xs font-bold ${box.tone}`}>{box.value}</span>
                        {guessed && (
                          <span className="mt-1 flex items-center justify-center gap-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                            <Sparkle className="w-2.5 h-2.5 flex-shrink-0" />
                            {ASSUMPTION_SOURCE_LABELS[guessed.source] ?? guessed.source}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview — bản khai trước khi chạy, quỹ đạo đo được sau khi chạy */}
              {scenario.latest_execution_result && scenario.intent_evaluation && (
                <div
                  className={`rounded-3xl border p-5 shadow-sm ${
                    scenario.intent_evaluation.verdict === true
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : scenario.intent_evaluation.verdict === false
                        ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                        : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {scenario.intent_evaluation.verdict === true ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : scenario.intent_evaluation.verdict === false ? (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Kiểm tra intent L4: {scenario.intent_evaluation.label_vi}
                      </p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {scenario.intent_evaluation.verdict === true
                          ? "Telemetry CARLA cho thấy hành vi đã xảy ra đúng quan hệ hình học của mô tả. Reviewer vẫn đưa ra quyết định cuối."
                          : scenario.intent_evaluation.verdict === false
                            ? "Mặc định không nên đưa vào thư viện. Nếu quan sát thực tế cho thấy oracle báo nhầm, reviewer có thể ghi lý do và phê duyệt ngoại lệ."
                            : "Máy không tự đoán khi thiếu tín hiệu. Reviewer cần dùng quỹ đạo và kết quả mô phỏng để tự kết luận."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                      <Loader2 className="w-5 h-5 text-blue-600 dark:text-cyan-400 animate-spin" />
                      Đang chờ kết quả từ worker CARLA
                    </h3>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-300">
                      Trạng thái: simulation_queued
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    Kịch bản đã qua Cổng 1 và được xếp hàng cho worker. Trang này tự cập nhật mỗi 2 giây;
                    khi CARLA trả kết quả, giao diện sẽ chuyển thẳng sang Cổng 2 mà không cần tải lại trang.
                  </p>

                  <details className="rounded-2xl bg-white dark:bg-slate-800/80 border border-sky-200/80 dark:border-slate-700 p-4">
                    <summary className="cursor-pointer text-xs font-bold text-[#0f2d59] dark:text-slate-200">
                      Không dùng worker? Xác nhận một lượt mô phỏng ngoại tuyến
                    </summary>
                    <div className="pt-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          Tải artifact để chạy bằng CARLA, Esmini hoặc công cụ ngoài.
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
                      <textarea
                        className="w-full px-3.5 py-2 bg-sky-50/40 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-[#0f2d59] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Ghi chú kết quả mô phỏng ngoại tuyến…"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={submitting}
                      />
                      <RoleGate allowedRoles={["reviewer", "admin"]}>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => handleCompleteSimulation(false)}
                            disabled={submitting}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            Báo lỗi mô phỏng
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompleteSimulation(true)}
                            disabled={submitting}
                            className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                          >
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            Xác nhận lượt ngoại tuyến đạt
                          </button>
                        </div>
                      </RoleGate>
                    </div>
                  </details>
                </div>
              ) : scenario.status === "pending_sim_review" || scenario.status === "pending_library_review" ? (
                <div id="review-decision" className="bg-sky-50/70 dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm scroll-mt-6">
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
                          className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
                        {gateToReview === "before_library" && scenario.intent_evaluation?.verdict === false
                          ? "Phê duyệt ngoại lệ L4"
                          : "Phê duyệt (Approve)"}
                      </button>
                    </div>
                  </RoleGate>
                </div>
              ) : (
                <div className="bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                  <div className="flex items-start gap-3">
                    {scenario.status === "approved_library" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h3 className="text-sm font-bold text-[#0f2d59] dark:text-white">
                        {scenario.status === "approved_library"
                          ? "Kịch bản đã hoàn tất hai cổng duyệt"
                          : "Kịch bản không còn chờ quyết định"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Trạng thái hiện tại: <code className="font-bold">{scenario.status}</code>. Lịch sử quyết định được giữ lại để truy vết.
                      </p>
                    </div>
                  </div>
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
  const { role, user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const currentRole = role || user?.role;
    if (!isLoading && isAuthenticated && currentRole === "creator") {
      router.replace("/");
    } else if (!isLoading && isAuthenticated && currentRole === "admin") {
      router.replace("/admin");
    }
  }, [isLoading, isAuthenticated, role, user?.role, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-purple-600">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  const currentRole = role || user?.role;
  if (currentRole === "creator" || currentRole === "admin") {
    return null;
  }

  return <AuthGate allowedRoles={["reviewer"]}>{children}</AuthGate>;
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
