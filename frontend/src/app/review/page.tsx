"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Shield,
  CheckCircle2,
  XCircle,
  User,
  MessageSquare,
  Info,
  Loader2,
  Map,
  Cloud,
  Users,
  AlertTriangle,
  Clock,
  FileCode,
  Copy,
  Download,
  Filter,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { getScenarios, getScenarioById, postReview } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import type { ScenarioItem, ScenarioDetail, ReviewGate } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
} from "@/types";

const normalizeStr = (str: string): string => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/_/g, " ")
    .trim();
};

const formatSpecificText = (text: string): string => {
  if (!text) return "";
  const cleaned = text.replace(/_/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const renderSafeValue = (val: any, labelsMap?: Record<string, string>): string => {
  if (!val) return "unknown";
  if (typeof val === "string") return labelsMap?.[val] ?? val;
  if (typeof val === "object") {
    const catKey = val.category && val.category !== "unknown" ? val.category : "";
    const cat = catKey ? (labelsMap?.[catKey] ?? catKey) : "";

    const rawSpec =
      val.specific_type && val.specific_type !== "unknown"
        ? val.specific_type
        : val.specific_action && val.specific_action !== "unknown"
        ? val.specific_action
        : "";

    const spec = formatSpecificText(rawSpec);

    if (cat && spec) {
      if (normalizeStr(cat) === normalizeStr(spec) || normalizeStr(catKey) === normalizeStr(spec)) {
        return cat;
      }
      return `${cat} (${spec})`;
    }
    if (cat) {
      return cat;
    }
    if (spec) {
      return spec;
    }
    return "unknown";
  }
  return String(val);
};

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialScenarioId = searchParams.get("scenario_id");

  // State: List
  const [list, setList] = useState<ScenarioItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

  // State: Selected Scenario Detail
  const [selectedId, setSelectedId] = useState<string | null>(initialScenarioId);
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  // Form State
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);

  // ─── Fetch List ───
  const fetchScenarioList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await getScenarios({ limit: 50 });
      const fetchedItems = res.items || [];
      setList(fetchedItems);

      // Auto-select logic if selectedId is not set or not in list
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
    fetchScenarioList();
  }, [fetchScenarioList]);

  // ─── Fetch Selected Detail ───
  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetailError(false);

    getScenarioById(selectedId)
      .then((data) => {
        setScenario(data);
      })
      .catch((err) => {
        console.error("Failed to load scenario detail", err);
        setDetailError(true);
        setScenario(null);
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }, [selectedId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Select Item Handler
  const handleSelectScenario = (id: string) => {
    setSelectedId(id);
    setFormErrors({});
    const url = new URL(window.location.href);
    url.searchParams.set("scenario_id", id);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  // Determine Gate from Scenario Status
  const gate: ReviewGate | null = (() => {
    if (!scenario) return null;
    if (scenario.status === "pending_review") return "before_library";
    if (scenario.status === "pending_sim_review") return "before_sim";
    return null;
  })();

  const gateBadgeClass = gate === "before_library" ? "badge badge--before-library" : "badge badge--before-sim";
  const gateLabel = gate === "before_library" ? "Cổng Thư viện" : "Cổng Mô phỏng";

  // Form Submit Handler
  const handleSubmitReview = async (approved: boolean) => {
    const errors: Record<string, string> = {};
    if (!reviewer.trim()) errors.reviewer = "Vui lòng nhập tên người duyệt";
    if (!approved && reason.trim().length < 10) {
      errors.reason = "Lý do từ chối phải có ít nhất 10 ký tự";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!scenario || !gate) return;

    setSubmitting(true);
    try {
      await postReview({
        scenario_id: scenario.scenario_id,
        gate,
        approved,
        reviewer: reviewer.trim(),
        reason: reason.trim(),
      });
      setToast({
        type: "success",
        msg: approved ? "Đã phê duyệt kịch bản!" : "Đã từ chối kịch bản.",
      });

      // Refresh list & detail
      await fetchScenarioList();
      const updated = await getScenarioById(scenario.scenario_id);
      setScenario(updated);
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Lỗi khi gửi quyết định.",
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

  const handleDownloadXml = () => {
    if (scenario?.xosc_content) {
      const blob = new Blob([scenario.xosc_content], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scenario.scenario_id}.xosc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Filtered List
  const displayList = filterPendingOnly
    ? list.filter((s) => s.status === "pending_review" || s.status === "pending_sim_review")
    : list;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500/90 text-white shadow-green-500/20"
              : "bg-red-500/90 text-white shadow-red-500/20"
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

      {/* ─── Top Header ─── */}
      <div className="glass-card p-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-100">
              Kiểm duyệt kịch bản (HITL Review)
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Xem xét, chọn kịch bản và phê duyệt vào Thư viện hoặc Mô phỏng
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <button
            onClick={() => setFilterPendingOnly(!filterPendingOnly)}
            className={`btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 border ${
              filterPendingOnly
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                : "btn-ghost border-slate-700/50"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {filterPendingOnly ? "Chỉ chờ duyệt" : "Tất cả kịch bản"}
          </button>
          <button
            onClick={fetchScenarioList}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 transition-colors"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ─── Split View Layout (2 Cột) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── CỘT BÊN TRÁI: Sidebar Danh sách ── */}
        <div className="lg:col-span-4 space-y-3 flex flex-col">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Danh sách kịch bản ({displayList.length})
            </span>
          </div>

          {listLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-card p-4 space-y-3">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="flex gap-2">
                    <div className="skeleton h-4 w-12 rounded-full" />
                    <div className="skeleton h-4 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayList.length === 0 ? (
            <div className="glass-card p-8 text-center text-slate-500 space-y-2">
              <Shield className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm font-medium text-slate-400">
                Không có kịch bản nào
              </p>
              <p className="text-xs">
                {filterPendingOnly
                  ? "Hiện tại không có kịch bản nào đang chờ duyệt"
                  : "Chưa có kịch bản trong hệ thống"}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {displayList.map((item) => {
                const isSelected = item.scenario_id === selectedId;
                const isPending =
                  item.status === "pending_review" ||
                  item.status === "pending_sim_review";

                return (
                  <div
                    key={item.scenario_id}
                    onClick={() => handleSelectScenario(item.scenario_id)}
                    className={`glass-card p-4 cursor-pointer transition-all duration-200 border relative ${
                      isSelected
                        ? "border-purple-500/60 bg-purple-500/10 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30"
                        : "border-slate-800 hover:border-slate-700/60 hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Status Dot */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3
                        className={`font-semibold text-sm truncate ${
                          isSelected ? "text-purple-200" : "text-slate-200"
                        }`}
                      >
                        {item.title}
                      </h3>
                      {isPending && (
                        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0 mt-1.5" />
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                      <Clock className="w-3 h-3" />
                      <span>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString("vi-VN")
                          : "Gần đây"}
                      </span>
                      <code className="text-[10px] bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-400 font-mono ml-auto">
                        {item.scenario_id}
                      </code>
                    </div>

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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CỘT BÊN PHẢI: Khung Review Chi Tiết ── */}
        <div className="lg:col-span-8 space-y-6">
          {detailLoading ? (
            <div className="glass-card p-6 space-y-6">
              <div className="skeleton h-8 w-1/3" />
              <div className="skeleton h-[280px] w-full" />
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-16 w-full" />
                ))}
              </div>
              <div className="skeleton h-32 w-full" />
            </div>
          ) : detailError || !scenario ? (
            <div className="glass-card p-12 text-center flex flex-col items-center justify-center space-y-3">
              <AlertTriangle className="w-12 h-12 text-slate-600 opacity-50" />
              <h3 className="text-lg font-semibold text-slate-300">
                Chưa chọn kịch bản
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Vui lòng chọn một kịch bản từ danh sách bên trái để xem sơ đồ 2D, thông tin ODD, mã XML và tiến hành duyệt.
              </p>
            </div>
          ) : (
            <>
              {/* Selected Scenario Banner */}
              <div className="glass-card p-6 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {scenario.scenario_id}
                      </span>
                      {gate && <span className={gateBadgeClass}>{gateLabel}</span>}
                    </div>
                    <h2 className="text-lg font-bold text-slate-100">
                      {scenario.title}
                    </h2>
                    {scenario.description_vi && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {scenario.description_vi}
                      </p>
                    )}
                  </div>

                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    Trạng thái:{" "}
                    <strong className="text-slate-300">{scenario.status}</strong>
                  </span>
                </div>
              </div>

              {/* 2D Diagram */}
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Map className="w-4 h-4 text-blue-400" />
                  Sơ đồ 2D Kịch bản
                </h3>
                <div className="rounded-xl overflow-hidden border border-slate-700/20 bg-slate-900/60">
                  {scenario.spec?.actors?.length ? (
                    <SVG2DRenderer
                      actors={scenario.spec.actors}
                      maneuvers={scenario.spec.maneuvers}
                      width="100%"
                      height={280}
                    />
                  ) : (
                    <div className="h-[280px] flex flex-col items-center justify-center text-slate-500">
                      <Map className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-xs">Chưa có dữ liệu sơ đồ 2D</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ODD Parameters Grid */}
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  Thông số ODD (Operational Design Domain)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/15 flex items-start gap-2.5">
                    <Map className="w-4 h-4 mt-0.5 text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Loại đường
                      </p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">
                        {renderSafeValue(scenario.odd?.road_type, ROAD_TYPE_LABELS)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/15 flex items-start gap-2.5">
                    <Cloud className="w-4 h-4 mt-0.5 text-cyan-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Thời tiết
                      </p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">
                        {renderSafeValue(scenario.odd?.weather, WEATHER_LABELS)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/15 flex items-start gap-2.5">
                    <Users className="w-4 h-4 mt-0.5 text-orange-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Tác nhân
                      </p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">
                        {renderSafeValue(scenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/15 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Hành vi
                      </p>
                      <p className="text-sm font-medium text-slate-200 mt-0.5">
                        {renderSafeValue(scenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Danh sách Tác nhân (Actors) - động theo spec.actors */}
              {scenario.spec?.actors && scenario.spec.actors.length > 0 && (
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-400" />
                    Danh sách Phương tiện ({scenario.spec.actors.length} tác nhân)
                  </h3>
                  <div className="space-y-2">
                    {scenario.spec.actors.map((actor: any, idx: number) => {
                      const isEgo = actor.is_ego === true;
                      const label = isEgo ? "Ego / Quan sát" : `Adversary ${idx}`;
                      const badgeStyle = isEgo
                        ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                        : "text-orange-400 bg-orange-500/10 border-orange-500/20";
                      const catLabel = ACTOR_TYPE_LABELS[actor.category as keyof typeof ACTOR_TYPE_LABELS] ?? actor.category ?? "unknown";
                      const specType = actor.specific_type && actor.specific_type !== "unknown"
                        ? formatSpecificText(actor.specific_type)
                        : null;
                      return (
                        <div
                          key={actor.name ?? idx}
                          className="bg-slate-800/40 px-4 py-3 rounded-xl border border-slate-700/20 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-400 text-xs font-bold flex-shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate">
                                {actor.name ?? `actor_${idx}`}
                                {specType && (
                                  <span className="text-slate-400 font-normal ml-1.5">
                                    ({specType})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">{catLabel}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${badgeStyle}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top 3 Kịch Bản Mẫu Tham Chiếu (Retrieval Results) */}

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  Top 3 Kịch Bản Mẫu Tham Chiếu (Retrieval Results)
                </h3>
                {scenario.retrieved_examples && scenario.retrieved_examples.length > 0 ? (
                  <div className="space-y-3">
                    {scenario.retrieved_examples.map((ex, idx) => (
                      <div
                        key={ex.id || idx}
                        className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                              {ex.id}
                            </span>
                            <h4 className="text-sm font-medium text-slate-200">
                              {ex.title}
                            </h4>
                          </div>
                          {ex.content && (
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {ex.content}
                            </p>
                          )}
                        </div>
                        {ex.similarity_score !== undefined && (
                          <div className="text-right flex-shrink-0">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">
                              Độ tương đồng
                            </span>
                            <span className={`text-xs font-semibold font-mono px-2.5 py-0.5 rounded-full border ${
                              ex.similarity_score >= 0.7 
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
                                : ex.similarity_score >= 0.4 
                                ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" 
                                : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                            }`}>
                              {Math.round(ex.similarity_score > 1 ? ex.similarity_score : ex.similarity_score * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-500 border border-dashed border-slate-700/30 rounded-xl">
                    <p className="text-xs">Chưa có dữ liệu kịch bản mẫu tham chiếu từ Vector Store.</p>
                  </div>
                )}
              </div>

              {/* OpenSCENARIO XML Viewer */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-purple-400" />
                    Mã OpenSCENARIO 1.0 (.xosc)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyXml}
                      disabled={!scenario.xosc_content}
                      className="btn-primary btn-ghost text-xs px-2.5 py-1"
                    >
                      <Copy className="w-3 h-3" />
                      {xmlCopied ? "Đã sao chép!" : "Sao chép"}
                    </button>
                    <button
                      onClick={handleDownloadXml}
                      disabled={!scenario.xosc_content}
                      className="btn-primary text-xs px-2.5 py-1"
                    >
                      <Download className="w-3 h-3" />
                      Tải .xosc
                    </button>
                  </div>
                </div>

                {scenario.xosc_content ? (
                  <pre className="xml-viewer max-h-[300px] overflow-auto text-xs font-mono text-slate-300 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
                    <code>{scenario.xosc_content}</code>
                  </pre>
                ) : (
                  <div className="py-8 text-center text-slate-500 border border-dashed border-slate-700/30 rounded-xl">
                    <FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Chưa có mã XML</p>
                  </div>
                )}
              </div>

              {/* Approve / Reject Review Form */}
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-400" />
                  Quyết định Phê duyệt HITL
                </h3>

                {gate === null ? (
                  <div className="text-center py-6 text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">
                      Kịch bản này hiện không thuộc cổng chờ duyệt (trạng thái:{" "}
                      <strong className="text-slate-300">{scenario.status}</strong>)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Reviewer Name */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5 font-medium">
                        <User className="w-3.5 h-3.5" />
                        Tên người chịu trách nhiệm duyệt *
                      </label>
                      <input
                        type="text"
                        className={`input-field ${formErrors.reviewer ? "!border-red-500/50" : ""}`}
                        placeholder="Nhập tên người duyệt (ví dụ: Kỹ sư Nguyễn Văn A)"
                        value={reviewer}
                        onChange={(e) => {
                          setReviewer(e.target.value);
                          if (formErrors.reviewer) {
                            setFormErrors((prev) => {
                              const copy = { ...prev };
                              delete copy.reviewer;
                              return copy;
                            });
                          }
                        }}
                        disabled={submitting}
                      />
                      {formErrors.reviewer && (
                        <p className="text-xs text-red-400 mt-1">{formErrors.reviewer}</p>
                      )}
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Lý do từ chối (Bắt buộc tối thiểu 10 ký tự khi Từ chối)
                      </label>
                      <textarea
                        className={`input-field min-h-[80px] resize-y ${formErrors.reason ? "!border-red-500/50" : ""}`}
                        placeholder="Ghi rõ lý do từ chối kịch bản..."
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          if (formErrors.reason) {
                            setFormErrors((prev) => {
                              const copy = { ...prev };
                              delete copy.reason;
                              return copy;
                            });
                          }
                        }}
                        disabled={submitting}
                      />
                      {formErrors.reason && (
                        <p className="text-xs text-red-400 mt-1">{formErrors.reason}</p>
                      )}
                    </div>

                    {/* Submit Actions */}
                    <div className="flex gap-3 pt-2">
                      <button
                        className="btn-primary btn-success flex-1 py-2.5 text-sm"
                        onClick={() => handleSubmitReview(true)}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Phê duyệt ({gateLabel})
                      </button>
                      <button
                        className="btn-primary btn-danger flex-1 py-2.5 text-sm"
                        onClick={() => handleSubmitReview(false)}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Từ chối ({gateLabel})
                      </button>
                    </div>
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

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      }
    >
      <ReviewPageContent />
    </Suspense>
  );
}
