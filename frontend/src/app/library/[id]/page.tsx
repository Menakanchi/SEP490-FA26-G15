"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Map,
  Cloud,
  Users,
  AlertTriangle,
  FileCode,
  Copy,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  Timer,
  Bot,
  Play,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  getControllerRuns,
  getScenarioById,
  getTuningSummary,
  postControllerRun,
  postTuneStep,
} from "@/services/api";
import ScenarioPreview from "@/components/ScenarioPreview";
import type { ControllerRunsResponse, ScenarioDetail, TuningSummary } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
} from "@/types";

export default function ScenarioDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [controllerRuns, setControllerRuns] = useState<ControllerRunsResponse | null>(null);
  const [controllerLoading, setControllerLoading] = useState(true);
  const [controllerError, setControllerError] = useState("");
  const [controllerQueuing, setControllerQueuing] = useState(false);
  const [tuning, setTuning] = useState<TuningSummary | null>(null);
  const [tuningError, setTuningError] = useState("");
  const [tuningBusy, setTuningBusy] = useState(false);
  const [tuningNote, setTuningNote] = useState("");

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      try {
        const data = await getScenarioById(id);
        setScenario(data);
      } catch (err) {
        console.error("Failed to load scenario", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const fetchRuns = async () => {
      try {
        setControllerRuns(await getControllerRuns(id));
        setControllerError("");
      } catch (err) {
        setControllerError(err instanceof Error ? err.message : "Không tải được kết quả vòng kín");
      } finally {
        setControllerLoading(false);
      }
    };
    fetchRuns();
  }, [id]);

  useEffect(() => {
    const status = controllerRuns?.runs[0]?.status;
    if (status !== "pending" && status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        setControllerRuns(await getControllerRuns(id));
      } catch {
        // Giữ kết quả gần nhất; nút làm mới bên dưới cho phép thử lại có chủ đích.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [controllerRuns?.runs, id]);

  useEffect(() => {
    if (!id) return;
    getTuningSummary(id)
      .then(setTuning)
      .catch(() => setTuning(null));
  }, [id]);

  const handleTuneStep = async () => {
    setTuningBusy(true);
    setTuningError("");
    setTuningNote("");
    try {
      const res = await postTuneStep(id);
      setTuningNote(
        res.variants.length
          ? `Đã sinh ${res.variants.join(", ")} — biến thể chờ duyệt như mọi kịch bản khác.`
          : `Phép dò đã dừng: ${res.stopped ?? "không còn bước nào"}.`,
      );
      setTuning(await getTuningSummary(id));
    } catch (err) {
      setTuningError(err instanceof Error ? err.message : "Không sinh được biến thể");
    } finally {
      setTuningBusy(false);
    }
  };

  const handleControllerRun = async () => {
    setControllerQueuing(true);
    setControllerError("");
    try {
      await postControllerRun(id);
      setControllerRuns(await getControllerRuns(id));
    } catch (err) {
      setControllerError(err instanceof Error ? err.message : "Không tạo được lượt đánh giá");
    } finally {
      setControllerQueuing(false);
    }
  };

  const refreshControllerRuns = async () => {
    setControllerLoading(true);
    try {
      setControllerRuns(await getControllerRuns(id));
      setControllerError("");
    } catch (err) {
      setControllerError(err instanceof Error ? err.message : "Không tải được kết quả vòng kín");
    } finally {
      setControllerLoading(false);
    }
  };

  const handleCopy = () => {
    if (scenario?.xosc_content) {
      navigator.clipboard.writeText(scenario.xosc_content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
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

  // --------------- Loading state ---------------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 p-6 pt-8">
        <div className="scenario-detail-card p-6">
          <div className="skeleton h-4 w-24 mb-4" />
          <div className="skeleton h-8 w-2/3 mb-3" />
          <div className="skeleton h-4 w-1/2 mb-4" />
          <div className="flex gap-3">
            <div className="skeleton h-7 w-28 rounded-full" />
            <div className="skeleton h-7 w-20 rounded" />
          </div>
        </div>
        <div className="scenario-detail-card p-6">
          <div className="skeleton h-[400px] w-full" />
        </div>
        <div className="scenario-detail-card p-6">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="scenario-detail-card p-6">
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    );
  }

  // --------------- Error state ---------------
  if (error || !scenario) {
    return (
      <div className="max-w-5xl mx-auto flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500/60 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-200">
          Không tìm thấy kịch bản
        </h2>
        <p className="text-slate-500 mt-2">
          Kịch bản với ID <code className="text-slate-600 dark:text-slate-400">{id}</code> không tồn tại hoặc đã bị xoá.
        </p>
        <Link
          href="/library"
          className="mt-6 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại thư viện
        </Link>
      </div>
    );
  }

  // --------------- Helpers ---------------
  const statusBadgeClass = (() => {
    switch (scenario.status) {
      case "approved_library":
        return "badge badge--approved";
      case "rejected":
        return "badge badge--rejected";
      case "pending_review":
      case "pending_sim_review":
        return "badge badge--pending";
      default:
        return "badge";
    }
  })();

  const statusLabel = (() => {
    switch (scenario.status) {
      case "approved_library":
        return "Đã duyệt";
      case "rejected":
        return "Từ chối";
      case "pending_review":
        return "Chờ duyệt";
      case "pending_sim_review":
        return "Chờ duyệt sim";
      default:
        return scenario.status;
    }
  })();

  const getGateLabel = (gate: string) => {
    if (gate === "before_library") return "Cổng Thư viện";
    if (gate === "before_sim") return "Cổng Mô phỏng";
    return gate;
  };

  const getGateBadgeClass = (gate: string) => {
    if (gate === "before_library") return "badge badge--before-library";
    if (gate === "before_sim") return "badge badge--before-sim";
    return "badge";
  };

  const odd = scenario.odd;
  const behaviorRun = controllerRuns?.runs.find((run) => run.ego_controller === "behavior_agent");
  const controllerPairPending = controllerRuns?.runs.some(
    (run) => run.status === "pending" || run.status === "running",
  );
  const controllerPairRunning = controllerRuns?.runs.some((run) => run.status === "running") ?? false;
  const controllerPairQueued = controllerPairPending && !controllerPairRunning;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6 pt-8">
      {/* ─── Header ─── */}
      <div className="scenario-detail-card p-6 relative overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <Link
          href="/library"
          className="relative inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-colors mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại thư viện</span>
        </Link>

        <div className="relative">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 dark:text-slate-100">
            {scenario.title}
          </h1>
          {scenario.description_vi && (
            <p className="text-slate-600 dark:text-slate-400 mt-2 text-base leading-relaxed">
              {scenario.description_vi}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={statusBadgeClass}>{statusLabel}</span>
            <code className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/30">
              {scenario.scenario_id}
            </code>
            {scenario.created_at && (
              <span className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(scenario.created_at).toLocaleDateString("vi-VN")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Preview: quỹ đạo đo được, hoặc bản khai nếu chưa chạy ─── */}
      <div className="scenario-detail-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Map className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          {scenario.latest_execution_result?.trajectory?.length
            ? "Phát lại dữ liệu đo trên CARLA"
            : "Bản khai kịch bản"}
        </h2>
        <ScenarioPreview
          spec={scenario.spec}
          execution={scenario.latest_execution_result}
          verification={scenario.verification}
        />
      </div>

      {/* ─── Closed-loop controller evaluation ─── */}
      {scenario.status === "approved_library" && scenario.verification === "adversarial" && (
        <div className="scenario-detail-card p-6 border border-cyan-200 dark:border-cyan-500/20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                Đánh giá vòng kín với mô hình lái
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
                Chạy lại artifact đã xác minh bằng CARLA BehaviorAgent. Kết quả này đánh giá phản ứng của
                ego, không thay đổi trạng thái duyệt hay bằng chứng nguy hiểm của kịch bản.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={refreshControllerRuns}
                className="btn-primary btn-ghost text-xs px-3 py-2"
                disabled={controllerLoading}
                title="Làm mới kết quả"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${controllerLoading ? "animate-spin" : ""}`} />
                Làm mới
              </button>
              <button
                onClick={handleControllerRun}
                className="btn-primary text-xs px-3 py-2"
                disabled={
                  controllerQueuing ||
                  controllerPairPending
                }
              >
                <Play className="w-3.5 h-3.5" />
                {controllerQueuing
                  ? "Đang xếp hàng..."
                  : controllerPairRunning
                    ? "Đang chạy trong CARLA"
                    : controllerPairQueued
                      ? "Đang chờ worker CARLA"
                      : "Chạy BehaviorAgent"}
              </button>
            </div>
          </div>

          {controllerError && (
            <p className="mt-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
              {controllerError}
            </p>
          )}

          {controllerLoading && !controllerRuns ? (
            <div className="skeleton h-24 w-full mt-5" />
          ) : behaviorRun && controllerRuns ? (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Baseline kịch bản</p>
                  <p className="mt-2 font-medium text-slate-800 dark:text-slate-200">
                    {controllerRuns.comparison.baseline_collision === true
                      ? "Có va chạm — tình huống nguy hiểm được tái hiện"
                      : controllerRuns.comparison.baseline_collision === false
                        ? "Không va chạm"
                        : "Chưa có kết quả hợp lệ"}
                  </p>
                </div>
                <div className="bg-cyan-50/60 dark:bg-slate-800/40 border border-cyan-200 dark:border-cyan-500/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-cyan-700 dark:text-cyan-500/70">BehaviorAgent closed-loop</p>
                  <p className="mt-2 font-medium text-slate-800 dark:text-slate-200">
                    {controllerPairRunning
                      ? "Đang chạy cặp A/B trong CARLA"
                      : controllerPairQueued
                        ? "Đã xếp hàng — đang chờ worker CARLA"
                      : behaviorRun.status === "pending"
                      ? "Đang chờ worker CARLA"
                      : behaviorRun.status === "running"
                        ? "Đang chạy trong CARLA"
                        : controllerRuns.comparison.controller_collision === true
                          ? "Vẫn va chạm"
                          : controllerRuns.comparison.controller_collision === false
                            ? "Đã tránh va chạm"
                            : "Lượt chạy bị lỗi"}
                  </p>
                </div>
              </div>

              {behaviorRun.result?.metrics && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-700 dark:text-slate-300">
                  {controllerRuns.comparison.initial_speed_delta_ms !== null && (
                    <span
                      className={`rounded-md px-2.5 py-1.5 ${
                        controllerRuns.comparison.comparable_initial_conditions
                          ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300"
                          : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                      }`}
                    >
                      Lệch tốc độ đầu: {controllerRuns.comparison.initial_speed_delta_ms.toFixed(2)} m/s
                    </span>
                  )}
                  {behaviorRun.result.metrics.min_distance_m !== undefined && (
                    <span className="bg-slate-100 dark:bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Khe hở nhỏ nhất: {behaviorRun.result.metrics.min_distance_m.toFixed(2)} m
                    </span>
                  )}
                  {behaviorRun.result.metrics.ego_max_brake !== undefined && (
                    <span className="bg-slate-100 dark:bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Phanh cực đại: {behaviorRun.result.metrics.ego_max_brake.toFixed(2)}
                    </span>
                  )}
                  {behaviorRun.result.metrics.ego_post_peak_speed_drop_ms !== undefined && (
                    <span className="bg-slate-100 dark:bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Giảm tốc sau đỉnh: {behaviorRun.result.metrics.ego_post_peak_speed_drop_ms.toFixed(2)} m/s
                    </span>
                  )}
                </div>
              )}

              <p className="text-sm text-cyan-900 dark:text-cyan-100 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-lg p-3">
                {controllerRuns.comparison.recommendation_vi}
              </p>
            </div>
          ) : (
            <div className="mt-5 py-8 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700/30 rounded-xl">
              <Bot className="w-9 h-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa chạy mô hình lái trên kịch bản này.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Dò biến thể tới hạn ───
          Cổng là "đã chạy CARLA ít nhất một lần", KHÔNG phải "đã vào thư viện":
          ca đáng dò nhất là kịch bản chạy xong mà vô hại (ran_no_hazard) — mà
          đúng những kịch bản đó thì không bao giờ được duyệt vào thư viện. */}
      {scenario.latest_execution_result && (
        <div className="scenario-detail-card p-6 border border-orange-200 dark:border-orange-500/20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                Dò biến thể khó hơn
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
                Mỗi lần bấm sinh một biến thể dịch thời điểm kích hoạt quanh mốc vật lý đã đo, tối đa 4
                bước và tự dừng khi khe hở xuống dưới 1 m. Biến thể đi qua đúng cổng duyệt như mọi kịch
                bản khác, không tự vào thư viện.
              </p>
            </div>
            <button
              onClick={handleTuneStep}
              className="btn-primary text-xs px-3 py-2 shrink-0"
              disabled={tuningBusy}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              {tuningBusy ? "Đang sinh..." : "Sinh biến thể khó hơn"}
            </button>
          </div>

          {tuningError && (
            <p className="mt-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
              {tuningError}
            </p>
          )}
          {tuningNote && (
            <p className="mt-4 text-sm text-orange-900 dark:text-orange-100 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg p-3">
              {tuningNote}
            </p>
          )}

          {tuning && tuning.ranked.length > 0 ? (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Khe hở bản gốc</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-200">
                    {tuning.baseline_min_distance_m?.toFixed(2) ?? "—"} m
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Biến thể tới hạn nhất</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-200">
                    {tuning.best_min_distance_m?.toFixed(2) ?? "—"} m
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Kết luận</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-200">
                    {tuning.reached_critical
                      ? "Đã tới hạn"
                      : tuning.improved
                        ? "Có cải thiện"
                        : "Chưa cải thiện"}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {tuning.ranked.map((item) => (
                  <div
                    key={item.scenario_id}
                    className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/20 rounded-lg px-3 py-2"
                  >
                    <Link
                      href={`/library/${item.scenario_id}`}
                      className="font-mono text-slate-700 dark:text-slate-300 hover:underline"
                    >
                      {item.scenario_id}
                    </Link>
                    <span className="text-slate-500">
                      khe hở {item.metrics.min_distance_m?.toFixed(2) ?? "—"} m
                    </span>
                  </div>
                ))}
              </div>
              {!tuning.improved && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Thời điểm kích hoạt không phải thứ khiến kịch bản này vô hại — nên nhìn sang vị trí
                  hoặc tốc độ ban đầu.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 py-8 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700/30 rounded-xl">
              <TrendingUp className="w-9 h-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa dò biến thể nào cho kịch bản này.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── ODD Parameters ─── */}
      <div className="scenario-detail-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          Thông số ODD
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-200 dark:border-slate-700/15">
            <Map className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Loại đường
              </p>
              <p className="text-base font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {renderSafeValue(odd.road_type, ROAD_TYPE_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-200 dark:border-slate-700/15">
            <Cloud className="w-5 h-5 text-cyan-600 dark:text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Thời tiết
              </p>
              <p className="text-base font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {renderSafeValue(odd.weather, WEATHER_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-200 dark:border-slate-700/15">
            <Users className="w-5 h-5 text-orange-500 dark:text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Tác nhân
              </p>
              <p className="text-base font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {renderSafeValue(odd.actor_type, ACTOR_TYPE_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-200 dark:border-slate-700/15">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Hành vi
              </p>
              <p className="text-base font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {renderSafeValue(odd.maneuver, MANEUVER_TYPE_LABELS)}
              </p>
            </div>
          </div>
        </div>

        {/* Time & Duration */}
        <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200 dark:border-slate-700/15">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>
              Thời điểm: <strong className="text-slate-800 dark:text-slate-300">{scenario.time_of_day ?? "day"}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-slate-500" />
            <span>
              Thời lượng: <strong className="text-slate-800 dark:text-slate-300">{scenario.spec?.duration_s ?? 30}s</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ─── OpenSCENARIO XML Viewer ─── */}
      <div className="scenario-detail-card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Mã OpenSCENARIO 1.0
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="btn-primary btn-ghost text-xs px-3 py-1.5"
              disabled={!scenario.xosc_content}
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Đã chép!" : "Sao chép"}
            </button>
            <button
              onClick={handleDownload}
              className="btn-primary text-xs px-3 py-1.5"
              disabled={!scenario.xosc_content}
            >
              <Download className="w-3.5 h-3.5" />
              Tải .xosc
            </button>
          </div>
        </div>

        {scenario.xosc_content ? (
          <pre className="xml-viewer max-h-[500px] overflow-auto">
            <code>{scenario.xosc_content}</code>
          </pre>
        ) : (
          <div className="py-12 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700/30 rounded-xl">
            <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có mã XML</p>
          </div>
        )}
      </div>

      {/* ─── HITL Review Logs ─── */}
      <div className="scenario-detail-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          Lịch sử duyệt
        </h2>

        {!scenario.review_logs || scenario.review_logs.length === 0 ? (
          <div className="py-10 text-center text-slate-500 border border-dashed border-slate-300 dark:border-slate-700/30 rounded-xl">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Chưa có lịch sử duyệt</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenario.review_logs.map((log, index) => (
              <div
                key={`${log.gate}-${log.decided_at}-${index}`}
                className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/15 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={getGateBadgeClass(log.gate)}>
                      {getGateLabel(log.gate)}
                    </span>
                    {log.approved ? (
                      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" /> Phê duyệt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 text-sm font-medium">
                        <XCircle className="w-4 h-4" /> Từ chối
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-medium text-sm">
                    {log.reviewer}
                  </p>
                  {log.reason && (
                    <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 leading-relaxed">
                      Lý do: {log.reason}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-600 whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(log.decided_at).toLocaleString("vi-VN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
