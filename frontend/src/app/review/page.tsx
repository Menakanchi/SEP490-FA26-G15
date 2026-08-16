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
  Tag,
} from "lucide-react";
import { VERIFICATION_LABELS, type VerificationLevel } from "@/types";

/** Màu theo mức kiểm chứng. `adversarial` là mức TỐT — kịch bản dựng được nguy
 *  hiểm, đúng thứ Forge tồn tại để làm — nên nó xanh, không đỏ. */
const verificationStyle: Record<VerificationLevel, string> = {
  adversarial: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  ran_no_hazard: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  execution_failed: "bg-red-500/15 text-red-300 border-red-500/30",
  unverified: "bg-slate-500/15 text-slate-400 border-slate-600/30",
};
import {
  getScenarios,
  getScenarioById,
  postReview,
  downloadXosc,
  requestSimulation,
  updateTags,
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

  // Chỉ hai trạng thái pending mới có một quyết định hợp lệ trong state machine.
  // Bản cũ mặc định mọi trạng thái khác về BEFORE_LIBRARY, nên scenario đã
  // `approved_library` vẫn hiện form duyệt lần nữa. Backend từ chối đúng, nhưng
  // UI lại mời người dùng bấm một hành động chắc chắn thất bại.
  const pendingGate: ReviewGate | null = (() => {
    if (scenario?.status === "pending_review") return "before_library";
    if (scenario?.status === "pending_sim_review") return "before_sim";
    return null;
  })();

  const gateLabel =
    pendingGate === "before_library"
      ? "Cổng Thư viện (BEFORE_LIBRARY)"
      : pendingGate === "before_sim"
        ? "Cổng Mô phỏng (BEFORE_SIM)"
        : "Không có quyết định đang chờ";

  // Hai cổng phải KHÁC MÀU và KHÁC CHỮ rõ ràng ngay trong form quyết định —
  // không chỉ ở cái badge nhỏ phía trên. Lý do rất cụ thể: reviewer từng duyệt
  // nhầm cổng 2 (BEFORE_SIM, tốn GPU thật) ngay sau khi vừa duyệt xong cổng 1,
  // vì hai form trông giống hệt nhau và không có gì báo đã sang cổng khác.
  const gateAccent =
    pendingGate === "before_sim"
      ? { border: "border-orange-500/40", text: "text-orange-300", icon: "text-orange-400" }
      : { border: "border-purple-500/30", text: "text-slate-100", icon: "text-purple-400" };

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
    if (!scenario || !pendingGate) return;

    setSubmitting(true);
    try {
      const result = await postReview({
        scenario_id: scenario.scenario_id,
        gate: pendingGate,
        approved,
        reviewer: reviewer.trim(),
        reason: reason.trim(),
      });
      setToast({
        type: "success",
        msg: approved
          ? result.sim_gate_opened
            ? `Đã phê duyệt kịch bản ${scenario.scenario_id} tại ${gateLabel}! Cổng Mô phỏng (BEFORE_SIM) đã mở sẵn — static không phải điểm dừng cuối.`
            : `Đã phê duyệt kịch bản ${scenario.scenario_id} tại ${gateLabel}!`
          : `Đã từ chối kịch bản ${scenario.scenario_id}.`,
      });
      // Xoá lý do sau mỗi lần gửi: nếu cổng kế tự mở ra ngay (sim_gate_opened),
      // chữ cũ còn nằm trong ô rất dễ khiến người duyệt tưởng chưa gửi gì và
      // bấm lại — đúng cái đã xảy ra trong demo (duyệt nhầm cổng 2 liền sau
      // cổng 1 vì form trông y hệt, chữ trong ô còn y nguyên).
      setReason("");

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
   * Mở lại vòng sim thứ hai (`request-sim`) rồi quyết định luôn (`review`) —
   * hai lệnh API riêng vì state machine ADR-011 đòi đi qua `pending_sim_review`
   * trước khi quyết, nhưng gộp thành MỘT hành động ở UI. Bản cũ tách hai nút
   * ("Yêu cầu" rồi mới "Duyệt") không có tác dụng gì thêm khi cùng một người
   * bấm cả hai — chỉ tạo thêm một chỗ dễ bấm nhầm giống bug đã gặp lúc demo,
   * và bản cũ còn không ghi reviewer/reason ở bước "yêu cầu" nên mất luôn dấu
   * vết ai mở cổng.
   */
  const handleRunSimNow = async (approved: boolean) => {
    const errors: { reviewer?: string; reason?: string } = {};
    if (!reviewer.trim()) {
      errors.reviewer = "Vui lòng nhập tên/email người duyệt (Reviewer ID).";
    }
    if (!approved && reason.trim().length < 10) {
      errors.reason = "Lý do từ chối bắt buộc có nhất 10 ký tự để lưu vết audit trail.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0 || !scenario) return;

    setRequestingSim(true);
    try {
      await requestSimulation(scenario.scenario_id);
      await postReview({
        scenario_id: scenario.scenario_id,
        gate: "before_sim",
        approved,
        reviewer: reviewer.trim(),
        reason: reason.trim(),
      });
      setToast({
        type: "success",
        msg: approved
          ? `Đã tạo job mô phỏng cho ${scenario.scenario_id} — vào hàng đợi GPU worker.`
          : `Đã từ chối chạy mô phỏng cho ${scenario.scenario_id} lần này.`,
      });
      setReason("");
      const fresh = await getScenarioById(scenario.scenario_id);
      setScenario(fresh);
      await fetchScenarioList();
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Không chạy được mô phỏng.",
      });
    } finally {
      setRequestingSim(false);
    }
  };

  /** Sửa tag. Prompt thô nhưng đủ dùng — chỗ này không đáng một modal riêng. */
  const handleEditTags = async () => {
    if (!scenario) return;
    const current = (scenario.tags ?? []).join(", ");
    const next = window.prompt("Tag, cách nhau bằng dấu phẩy:", current);
    if (next === null) return;
    try {
      await updateTags(
        scenario.scenario_id,
        next.split(",").map((t) => t.trim()).filter(Boolean),
      );
      setScenario(await getScenarioById(scenario.scenario_id));
      setToast({ type: "success", msg: "Đã cập nhật tag." });
    } catch (err) {
      setToast({
        type: "error",
        msg: err instanceof Error ? err.message : "Không cập nhật được tag",
      });
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
                    {/* Mức kiểm chứng là trục RIÊNG, không phải trạng thái duyệt
                        (ADR-017). Không hiện nó thì người duyệt chỉ thấy "đã duyệt"
                        và hiểu nhầm rằng kịch bản đã được chứng minh là đúng. */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                          verificationStyle[scenario.verification ?? "unverified"]
                        }`}
                        title="Kết quả chạy thật trên CARLA — khác với trạng thái duyệt của con người"
                      >
                        {VERIFICATION_LABELS[scenario.verification ?? "unverified"]}
                      </span>
                      <span className="text-[11px] text-slate-400 px-2.5 py-1 rounded-full border border-slate-700/40 bg-slate-800/40">
                        Người tạo: <strong className="text-slate-300">{scenario.created_by || "unknown"}</strong>
                      </span>
                    </div>

                    {/* Đề bài đòi hai vai trò tạo/duyệt. Tự duyệt bài của mình
                        không vi phạm ràng buộc HITL — vẫn là người kiểm AI —
                        nhưng nó làm cổng duyệt mất tác dụng bắt điểm mù. Nhắc,
                        không chặn: đội một người thì tự duyệt là bắt buộc, và
                        chặn cứng chỉ khiến người ta gõ tên giả. */}
                    {pendingGate &&
                      reviewer.trim() !== "" &&
                      scenario.created_by &&
                      reviewer.trim().toLowerCase() === scenario.created_by.toLowerCase() && (
                        <p className="mt-2 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Bạn đang duyệt kịch bản do chính mình tạo — vẫn hợp lệ, nhưng
                          người khác duyệt thì dễ bắt được điểm mù hơn.
                        </p>
                      )}
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {pendingGate ? `Cổng áp dụng: ${gateLabel}` : gateLabel}
                  </span>
                </div>

                {/* Tag — đề bài đòi "thư viện lưu trữ có gắn tag". Bốn trục ODD
                    được gắn sẵn lúc lưu; người dùng sửa thêm được ở đây. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  {(scenario.tags ?? []).length === 0 && (
                    <span className="text-xs text-slate-500">chưa có tag</span>
                  )}
                  {(scenario.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/50"
                    >
                      {t}
                    </span>
                  ))}
                  <button
                    onClick={handleEditTags}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-dotted"
                  >
                    sửa
                  </button>
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

              {/* Chỉ hiện form khi state machine có transition hợp lệ. */}
              {pendingGate ? (
                <div className={`glass-card p-6 space-y-4 ${gateAccent.border}`}>
                  <h3 className={`text-base font-bold flex items-center gap-2 ${gateAccent.text}`}>
                    <User className={`w-4 h-4 ${gateAccent.icon}`} />
                    Đang duyệt: {gateLabel}
                  </h3>
                  {pendingGate === "before_sim" && (
                    <p className="text-xs text-orange-300/90 -mt-2">
                      Đây là cổng thứ hai — Phê duyệt ở đây sẽ tạo job và đẩy vào hàng đợi GPU worker thật.
                    </p>
                  )}

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
              ) : scenario.status === "approved_library" ? (
                <div className="glass-card p-6 space-y-4 border-emerald-500/30">
                  <h3 className="text-base font-bold text-emerald-200 flex items-center gap-2">
                    <PlayCircle className="w-4 h-4 text-emerald-400" />
                    Kịch bản đã ở Thư viện — chạy (lại) mô phỏng?
                  </h3>
                  <p className="text-xs text-slate-400 -mt-2">
                    Một hành động duy nhất: mở cổng BEFORE_SIM và quyết luôn, không cần bấm hai lần.
                  </p>

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
                        disabled={requestingSim}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Ghi chú / lý do nếu không chạy mô phỏng lần này
                      </label>
                      <textarea
                        className={`input-field text-sm min-h-[60px] ${formErrors.reason ? "border-red-500/60" : ""}`}
                        placeholder="Bắt buộc có từ 10 ký tự trở lên khi chọn “Không cần mô phỏng”..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={requestingSim}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleRunSimNow(false)}
                      disabled={requestingSim}
                      className="btn-primary bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 border border-slate-500/40 text-sm px-4 py-2 flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Không cần mô phỏng
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunSimNow(true)}
                      disabled={requestingSim}
                      className="btn-primary btn-success text-sm px-5 py-2 flex items-center gap-2"
                    >
                      {requestingSim ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                      Chạy mô phỏng
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-6 border-emerald-500/30">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-emerald-200">
                        Không có quyết định HITL đang chờ
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Kịch bản đã bị từ chối ở cổng Thư viện. Không còn hành động phê duyệt hợp lệ cho trạng thái này.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
