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
  PlayCircle,
} from "lucide-react";
import {
  getScenarios,
  getScenarioById,
  postReview,
  downloadXosc,
  requestSimulation,
} from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
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
  const [formErrors, setFormErrors] = useState<{ reviewer?: string; reason?: string }>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);
  const [requestingSim, setRequestingSim] = useState(false);

  // Fetch List
  // Cố ý KHÔNG `setListLoading(true)` ở đây. `listLoading` khởi tạo đã là true
  // cho lần nạp đầu, nên đặt lại là một lần render thừa ngay khi mount. Chỗ cần
  // bật lại cờ là các lần nạp DO NGƯỜI DÙNG kích hoạt — và chúng bật ở đúng
  // handler của mình bên dưới.
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
  // `react-hooks` 7 chặn mọi setState mà effect với tới được, kể cả khi nó nằm
  // sau `await`. Cách sửa thật là chuyển việc nạp lên server component / `use()`
  // + Suspense, tức bỏ hẳn effect này — một refactor riêng, không nhét vào PR
  // tính năng được. Tắt có phạm vi ở đúng ba chỗ để lỗi khác vẫn nhìn thấy.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp dữ liệu lúc mount
    void fetchScenarioList();
  }, [fetchScenarioList]);

  // Fetch Selected Detail
  //
  // Cờ `cancelled` không phải để làm vừa lòng linter: reviewer bấm lướt qua
  // danh sách thì nhiều request chồng nhau, và không có nó thì phản hồi của
  // kịch bản bấm TRƯỚC có thể về SAU và ghi đè lên kịch bản đang xem. Người
  // duyệt sẽ nhìn một kịch bản mà tưởng là kịch bản khác — rồi bấm duyệt.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const load = async () => {
      setDetailLoading(true);
      setDetailError(false);
      try {
        const data = await getScenarioById(selectedId);
        if (!cancelled) setScenario(data);
      } catch (err) {
        console.error("Failed to load scenario detail", err);
        if (!cancelled) {
          setDetailError(true);
          setScenario(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
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
  const gate: ReviewGate = (() => {
    if (!scenario) return "before_library";
    if (scenario.status === "pending_sim_review") return "before_sim";
    return "before_library";
  })();

  const gateLabel = gate === "before_library" ? "Cổng Thư viện (BEFORE_LIBRARY)" : "Cổng Mô phỏng (BEFORE_SIM)";

  // Form Submit Handler
  const handleSubmitReview = async (approved: boolean) => {
    const errors: { reviewer?: string; reason?: string } = {};
    if (!reviewer.trim()) {
      errors.reviewer = "Vui lòng nhập tên/email người duyệt (Reviewer ID).";
    }
    if (!approved && reason.trim().length < 10) {
      errors.reason = "Lý do từ chối bắt buộc có nhất 10 ký tự để lưu vết audit trail.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!scenario) return;

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

  /**
   * Mở cổng duyệt thứ hai. Không chạy CARLA — chỉ chuyển sang chờ duyệt
   * BEFORE_SIM. Nạp lại chi tiết sau khi xong để form duyệt đổi sang cổng 2.
   */
  const handleRequestSim = async () => {
    if (!scenario) return;
    setRequestingSim(true);
    try {
      await requestSimulation(scenario.scenario_id);
      const fresh = await getScenarioById(scenario.scenario_id);
      setScenario(fresh);
      setToast({
        type: "success",
        msg: "Đã mở cổng BEFORE_SIM. Duyệt tiếp thì job mới vào hàng đợi worker.",
      });
      await fetchScenarioList();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Không mở được cổng mô phỏng",
      });
    } finally {
      setRequestingSim(false);
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

      {/* Top Header */}
      <div className="glass-card p-6 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-100">
              Kiểm duyệt kịch bản (Reviewer Flow - HITL)
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              Cổng duyệt hai tầng: Thư viện (BEFORE_LIBRARY) & Mô phỏng (BEFORE_SIM)
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
            {filterPendingOnly ? "Chỉ kịch bản chờ duyệt" : "Tất cả kịch bản"}
          </button>
          <button
            onClick={() => {
              setListLoading(true);
              void fetchScenarioList();
            }}
            className="btn-primary btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 border border-slate-700/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="glass-card p-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Danh sách kịch bản ({displayList.length})
            </h2>

            {listLoading ? (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
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
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "bg-purple-500/15 border-purple-500/50 text-white shadow-lg shadow-purple-500/10"
                          : "bg-slate-800/30 border-slate-700/20 text-slate-300 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-cyan-400 truncate">
                          {item.scenario_id}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            item.status === "approved_library"
                              ? "bg-green-500/20 text-green-300"
                              : item.status === "rejected"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 line-clamp-1 font-medium">
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
            <div className="glass-card p-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : detailError || !scenario ? (
            <div className="glass-card p-12 text-center text-slate-400">
              Vui lòng chọn một kịch bản từ danh sách bên trái để kiểm duyệt.
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="glass-card p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/30 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100">
                      {scenario.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      ID: {scenario.scenario_id} | Trạng thái hiện tại:{" "}
                      <strong className="text-purple-300">{scenario.status}</strong>
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Cổng áp dụng: {gateLabel}
                  </span>
                </div>

                {/* ⚠️ Warning Banner (Informational - Amber) */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block text-amber-200 mb-0.5">
                      Cảnh báo thông số tự suy luận (Inferred ODD Warning):
                    </strong>
                    <span>
                      Hệ thống tự điền giả định mặc định cho các trục ODD không được đề cập trong prompt. Kỹ sư duyệt cần kiểm tra sơ đồ 2D và mảng actors bên dưới trước khi phê duyệt.
                    </span>
                  </div>
                </div>

                {/* ODD Cell Parameters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[10px] text-slate-500 block uppercase">Đường</span>
                    <span className="text-xs font-semibold text-blue-400">
                      {renderSafeValue(scenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[10px] text-slate-500 block uppercase">Thời tiết</span>
                    <span className="text-xs font-semibold text-cyan-400">
                      {renderSafeValue(scenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[10px] text-slate-500 block uppercase">Tác nhân</span>
                    <span className="text-xs font-semibold text-orange-400">
                      {renderSafeValue(scenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[10px] text-slate-500 block uppercase">Hành vi</span>
                    <span className="text-xs font-semibold text-red-400">
                      {renderSafeValue(scenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2D SVG Lane Visualization */}
              <div className="glass-card p-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Map className="w-4 h-4 text-blue-400" />
                  Sơ đồ làn đường 2D (Render Hero & Adversaries - ADR-010)
                </h3>
                <div className="rounded-xl overflow-hidden border border-slate-700/20">
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

              {/* All Actors Table (ADR-010) */}
              {scenario.spec?.actors?.length ? (
                <div className="glass-card p-6 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-400" />
                    Danh sách toàn bộ Tác nhân (`spec.actors` - {scenario.spec.actors.length} xe):
                  </h3>
                  <div className="overflow-x-auto border border-slate-700/30 rounded-xl">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="bg-slate-800/80 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-700/40">
                        <tr>
                          <th className="p-3">Tên xe</th>
                          <th className="p-3">Loại phương tiện</th>
                          <th className="p-3">Vai trò</th>
                          <th className="p-3">Làn (`lane_offset`)</th>
                          <th className="p-3">Khoảng cách S (`s_offset_m`)</th>
                          <th className="p-3">Tốc độ ban đầu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {scenario.spec.actors.map((actor, idx) => (
                          <tr key={actor.name || idx} className="hover:bg-slate-800/30">
                            <td className="p-3 font-mono font-semibold text-cyan-300">{actor.name}</td>
                            <td className="p-3 font-semibold text-slate-200">
                              {renderActorCategoryLabel(actor, scenario.odd)}
                            </td>
                            <td className="p-3">
                              {actor.is_ego ? (
                                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold">
                                  Xe chính (Hero / Ego)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-semibold">
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
              <div className="glass-card p-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Kịch bản mẫu được Retrieve (`retrieved_examples`):
                </h3>

                {!scenario.retrieved_examples || scenario.retrieved_examples.length === 0 ? (
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center gap-3">
                    <Sparkle className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <div>
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-xs font-bold mr-2">
                        Chế độ Zero-Shot
                      </span>
                      <span className="text-xs text-slate-300">
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
                          className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-slate-200 truncate">
                              {item.title || item.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold">
                              {scorePct}% Tương đồng
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {item.content || item.description_vi}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Decision Form Box */}
              <div className="glass-card p-6 space-y-4 border-purple-500/30">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-400" />
                  Form Phê duyệt / Từ chối (HITL Decision Form)
                </h3>

                {/* ❌ Critical Error Banner */}
                {(formErrors.reviewer || formErrors.reason) && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-red-200">
                      <XCircle className="w-4 h-4 text-red-400" />
                      Lỗi kiểm tra dữ liệu đầu vào (Validation Error):
                    </div>
                    {formErrors.reviewer && <p>• {formErrors.reviewer}</p>}
                    {formErrors.reason && <p>• {formErrors.reason}</p>}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tên kỹ sư / reviewer chịu trách nhiệm <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      className={`input-field text-sm ${formErrors.reviewer ? "border-red-500/60" : ""}`}
                      placeholder="Ví dụ: Engineer QA Lead"
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Lý do đánh giá / ghi chú lý do từ chối (Ghi rõ nguyên nhân nếu Reject)
                    </label>
                    <textarea
                      className={`input-field text-sm min-h-[80px] ${formErrors.reason ? "border-red-500/60" : ""}`}
                      placeholder="Bắt buộc có từ 10 ký tự trở lên khi từ chối (Reject)..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSubmitReview(false)}
                    disabled={submitting}
                    className="btn-primary bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-sm px-4 py-2 flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Từ chối (Reject)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubmitReview(true)}
                    disabled={submitting}
                    className="btn-primary btn-success text-sm px-5 py-2 flex items-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Phê duyệt (Approve)
                  </button>
                </div>
              </div>

              {/* OpenSCENARIO Code View & Download */}
              <div className="glass-card p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-400" />
                    Mã OpenSCENARIO XML
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyXml}
                      disabled={!scenario.xosc_content}
                      className="btn-primary btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 border border-slate-700/40"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {xmlCopied ? "Đã chép!" : "Sao chép"}
                    </button>
                    <button
                      onClick={handleRequestSim}
                      disabled={scenario.status !== "approved_library" || requestingSim}
                      title={
                        scenario.status === "approved_library"
                          ? "Mở cổng duyệt thứ hai để xin chạy trên CARLA"
                          : "Chỉ kịch bản đã vào thư viện mới xin chạy mô phỏng được"
                      }
                      className={`btn-primary btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 border border-slate-700/40 ${
                        scenario.status !== "approved_library" ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      {requestingSim ? "Đang gửi..." : "Yêu cầu chạy mô phỏng"}
                    </button>
                    <button
                      onClick={handleDownloadXml}
                      disabled={scenario.status !== "approved_library"}
                      title={
                        scenario.status === "approved_library"
                          ? "Tải file .xosc"
                          : "Chỉ kịch bản đã qua duyệt BEFORE_LIBRARY mới được phép tải file .xosc"
                      }
                      className={`btn-primary text-xs px-3 py-1.5 flex items-center gap-1 ${
                        scenario.status !== "approved_library" ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Tải .xosc
                    </button>
                  </div>
                </div>

                {scenario.xosc_content ? (
                  <pre className="xml-viewer max-h-[300px] overflow-auto">
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
