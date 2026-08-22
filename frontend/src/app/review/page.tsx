"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
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
import { getScenarios, getScenarioById, postReview, downloadXosc } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import { RoleGate } from "@/components/RoleGate";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/context/AuthContext";
import type { ScenarioItem, ScenarioDetail, ReviewGate } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
  renderActorCategoryLabel,
} from "@/types";

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialScenarioId = searchParams.get("scenario_id");
  const { user, role } = useAuth();

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
  const [reviewer, setReviewer] = useState(user?.name || user?.username || user?.email || "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ reviewer?: string; reason?: string }>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);

  // Fetch List
  const fetchScenarioList = useCallback(async () => {
    try {
      const res = await getScenarios({ limit: 50 });
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
    setSelectedId(id);
    router.replace(`/review?scenario_id=${id}`, { scroll: false });
  };

  const gateToReview: ReviewGate =
    scenario?.status === "pending_sim_review" ? "before_sim" : "before_library";

  const gateLabel =
    gateToReview === "before_sim" ? "Cổng 2: Mô phỏng (BEFORE_SIM)" : "Cổng 1: Thư viện (BEFORE_LIBRARY)";

  const handleSubmitReview = async (approved: boolean) => {
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
      await postReview({
        scenario_id: scenario.scenario_id,
        gate: gateToReview,
        approved,
        reviewer: reviewer.trim(),
        reason: reason.trim() || "Chấp nhận kịch bản",
      });

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

  const displayList = filterPendingOnly
    ? list.filter((s) => s.status === "pending_review" || s.status === "pending_sim_review")
    : list;

  return (
    <div className="min-h-screen max-w-7xl mx-auto p-4 md:p-6 space-y-6 font-sans bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-600 text-white shadow-green-500/20"
              : "bg-red-600 text-white shadow-red-500/20"
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

      {/* Top Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
              Kiểm duyệt kịch bản (Reviewer Flow - HITL)
            </h1>
            <p className="text-xs md:text-sm text-blue-900/80 dark:text-slate-400 font-medium">
              Cổng duyệt hai tầng: Thư viện (BEFORE_LIBRARY) & Mô phỏng (BEFORE_SIM)
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2.5">
          <button
            onClick={() => setFilterPendingOnly(!filterPendingOnly)}
            className={`text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 border font-bold transition cursor-pointer ${
              filterPendingOnly
                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800"
                : "bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200/80 dark:border-slate-700 hover:bg-sky-100/80 dark:hover:bg-slate-700"
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            {filterPendingOnly ? "Chỉ kịch bản chờ duyệt" : "Tất cả kịch bản"}
          </button>
          <button
            onClick={() => {
              setListLoading(true);
              void fetchScenarioList();
            }}
            className="text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 border border-sky-200/80 dark:border-slate-700 bg-sky-50/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-100/80 dark:hover:bg-slate-700 font-bold transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ${listLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-4 shadow-sm">
            <h2 className="text-xs font-bold text-blue-900/80 dark:text-slate-400 uppercase tracking-wider mb-3">
              Danh sách kịch bản ({displayList.length})
            </h2>

            {listLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                Không tìm thấy kịch bản nào.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {displayList.map((item) => {
                  const isSelected = item.scenario_id === selectedId;
                  return (
                    <button
                      key={item.scenario_id}
                      onClick={() => handleSelectScenario(item.scenario_id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-sky-50/90 dark:bg-purple-950/60 border-blue-500 dark:border-purple-600 text-blue-950 dark:text-purple-100 shadow-sm font-bold"
                          : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-sky-50/50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-cyan-400 truncate">
                          {item.scenario_id}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            item.status === "approved_library"
                              ? "bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                              : item.status === "rejected"
                              ? "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                              : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 line-clamp-1 font-semibold">
                        {item.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-8 space-y-6">
          {detailLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-12 flex items-center justify-center shadow-sm">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : detailError || !scenario ? (
            <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-600 dark:text-slate-400 text-sm font-medium shadow-sm">
              Vui lòng chọn một kịch bản từ danh sách bên trái để kiểm duyệt.
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
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

                {/* ⚠️ Warning Banner */}
                <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block text-amber-950 dark:text-amber-200 mb-0.5">
                      Cảnh báo thông số tự suy luận (Inferred ODD Warning):
                    </strong>
                    <span>
                      Hệ thống tự điền giả định mặc định cho các trục ODD không được đề cập trong prompt. Kỹ sư duyệt cần kiểm tra sơ đồ 2D và mảng actors bên dưới trước khi phê duyệt.
                    </span>
                  </div>
                </div>

                {/* ODD Cell Parameters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-sky-50/80 dark:bg-slate-800 text-blue-950 dark:text-slate-200 border border-sky-200/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Đường</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {renderSafeValue(scenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 text-blue-950 dark:text-slate-200 border border-sky-200/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Thời tiết</span>
                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      {renderSafeValue(scenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 text-blue-950 dark:text-slate-200 border border-sky-200/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Tác nhân</span>
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                      {renderSafeValue(scenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 text-blue-950 dark:text-slate-200 border border-sky-200/70 dark:border-slate-700 p-3 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Hành vi</span>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">
                      {renderSafeValue(scenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2D SVG Lane Visualization */}
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Map className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Sơ đồ làn đường 2D (Render Hero & Adversaries - ADR-010)
                </h3>
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/80">
                  {scenario.spec?.actors?.length ? (
                    <SVG2DRenderer
                      actors={scenario.spec.actors}
                      odd={scenario.odd}
                      maneuvers={scenario.spec.maneuvers}
                      width="100%"
                      height={320}
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                      Không có thông tin vị trí các xe để vẽ 2D.
                    </div>
                  )}
                </div>
              </div>

              {/* All Actors Table */}
              {scenario.spec?.actors?.length ? (
                <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    Danh sách toàn bộ Tác nhân (`spec.actors` - {scenario.spec.actors.length} xe):
                  </h3>
                  <div className="overflow-x-auto border border-sky-100 dark:border-slate-800 rounded-2xl">
                    <table className="w-full text-xs text-left text-slate-800 dark:text-slate-200">
                      <thead className="bg-sky-50/60 dark:bg-slate-800/80 text-blue-900 dark:text-slate-400 uppercase font-bold text-[10px] border-b border-sky-100 dark:border-slate-700/60">
                        <tr>
                          <th className="p-3">Tên xe</th>
                          <th className="p-3">Loại phương tiện</th>
                          <th className="p-3">Vai trò</th>
                          <th className="p-3">Làn (`lane_offset`)</th>
                          <th className="p-3">Khoảng cách S (`s_offset_m`)</th>
                          <th className="p-3">Tốc độ ban đầu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100/60 dark:divide-slate-800">
                        {scenario.spec.actors.map((actor, idx) => (
                          <tr key={actor.name || idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-mono font-bold text-blue-600 dark:text-cyan-300">{actor.name}</td>
                            <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                              {renderActorCategoryLabel(actor, scenario.odd)}
                            </td>
                            <td className="p-3">
                              {actor.is_ego ? (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                                  Xe chính (Hero / Ego)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-bold border border-orange-200 dark:border-orange-800">
                                  Xe phụ (Adversary)
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono">Làn {actor.position?.lane_offset || 1}</td>
                            <td className="p-3 font-mono">{actor.position?.s_offset_m ?? 0} m</td>
                            <td className="p-3 font-mono">{actor.initial_speed_kmh ?? 50} km/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Retrieved Examples Block */}
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
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
                          className="bg-sky-50/50 dark:bg-slate-800/40 p-4 rounded-2xl border border-sky-100 dark:border-slate-700/60 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
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

              {/* Decision Form Box */}
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Form Phê duyệt / Từ chối (HITL Decision Form)
                </h3>

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
                    <label className="block text-xs font-bold text-blue-900 dark:text-slate-300 mb-1.5">
                      Tên kỹ sư / reviewer chịu trách nhiệm <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={`w-full px-3.5 py-2.5 bg-sky-50/50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white dark:focus:bg-slate-800 transition ${formErrors.reviewer ? "border-red-500" : ""}`}
                      placeholder="Ví dụ: Engineer QA Lead"
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-blue-900 dark:text-slate-300 mb-1.5">
                      Lý do đánh giá / ghi chú lý do từ chối (Ghi rõ nguyên nhân nếu Reject)
                    </label>
                    <textarea
                      className={`w-full px-3.5 py-2.5 bg-sky-50/50 dark:bg-slate-800 border border-sky-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white dark:focus:bg-slate-800 transition min-h-[80px] ${formErrors.reason ? "border-red-500" : ""}`}
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

              {/* OpenSCENARIO Code View & Download */}
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Mã OpenSCENARIO XML
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyXml}
                      disabled={!scenario.xosc_content}
                      className="px-3 py-1.5 bg-sky-50/80 dark:bg-slate-800 border border-sky-200/80 dark:border-slate-700 rounded-xl text-xs font-bold text-blue-950 dark:text-slate-300 hover:bg-sky-100/80 dark:hover:bg-slate-700 transition cursor-pointer"
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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-purple-600">
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
          <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-purple-600">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          </div>
        }
      >
        <ReviewPageContent />
      </Suspense>
    </ReviewRoleGuard>
  );
}
