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
} from "lucide-react";
import { getControllerRuns, getScenarioById, postControllerRun } from "@/services/api";
import ScenarioPreview from "@/components/ScenarioPreview";
import type { ControllerRunsResponse, ScenarioDetail } from "@/types";
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
        <div className="glass-card p-6">
          <div className="skeleton h-4 w-24 mb-4" />
          <div className="skeleton h-8 w-2/3 mb-3" />
          <div className="skeleton h-4 w-1/2 mb-4" />
          <div className="flex gap-3">
            <div className="skeleton h-7 w-28 rounded-full" />
            <div className="skeleton h-7 w-20 rounded" />
          </div>
        </div>
        <div className="glass-card p-6">
          <div className="skeleton h-[400px] w-full" />
        </div>
        <div className="glass-card p-6">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="glass-card p-6">
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
        <h2 className="text-2xl font-bold text-slate-200">
          Không tìm thấy kịch bản
        </h2>
        <p className="text-slate-500 mt-2">
          Kịch bản với ID <code className="text-slate-400">{id}</code> không tồn tại hoặc đã bị xoá.
        </p>
        <Link
          href="/library"
          className="mt-6 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6 pt-8">
      {/* ─── Header ─── */}
      <div className="glass-card p-6 relative overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <Link
          href="/library"
          className="relative inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại thư viện</span>
        </Link>

        <div className="relative">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">
            {scenario.title}
          </h1>
          {scenario.description_vi && (
            <p className="text-slate-400 mt-2 text-base leading-relaxed">
              {scenario.description_vi}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className={statusBadgeClass}>{statusLabel}</span>
            <code className="text-xs font-mono text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700/30">
              {scenario.scenario_id}
            </code>
            {scenario.created_at && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(scenario.created_at).toLocaleDateString("vi-VN")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Preview: quỹ đạo đo được, hoặc bản khai nếu chưa chạy ─── */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Map className="w-5 h-5 text-blue-400" />
          {scenario.latest_execution_result?.trajectory?.length
            ? "Quỹ đạo đo được trên CARLA"
            : "Bản khai kịch bản"}
        </h2>
        <ScenarioPreview spec={scenario.spec} execution={scenario.latest_execution_result} />
      </div>

      {/* ─── Closed-loop controller evaluation ─── */}
      {scenario.status === "approved_library" && scenario.verification === "adversarial" && (
        <div className="glass-card p-6 border border-cyan-500/20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />
                Đánh giá vòng kín với mô hình lái
              </h2>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl">
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
                  controllerRuns?.runs[0]?.status === "pending" ||
                  controllerRuns?.runs[0]?.status === "running"
                }
              >
                <Play className="w-3.5 h-3.5" />
                {controllerQueuing ? "Đang xếp hàng..." : "Chạy BehaviorAgent"}
              </button>
            </div>
          </div>

          {controllerError && (
            <p className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {controllerError}
            </p>
          )}

          {controllerLoading && !controllerRuns ? (
            <div className="skeleton h-24 w-full mt-5" />
          ) : controllerRuns?.runs[0] ? (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-800/40 border border-slate-700/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Baseline kịch bản</p>
                  <p className="mt-2 font-medium text-slate-200">
                    {controllerRuns.comparison.baseline_collision === true
                      ? "Có va chạm — tình huống nguy hiểm được tái hiện"
                      : controllerRuns.comparison.baseline_collision === false
                        ? "Không va chạm"
                        : "Chưa có kết quả hợp lệ"}
                  </p>
                </div>
                <div className="bg-slate-800/40 border border-cyan-500/20 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-wider text-cyan-500/70">BehaviorAgent closed-loop</p>
                  <p className="mt-2 font-medium text-slate-200">
                    {controllerRuns.runs[0].status === "pending"
                      ? "Đang chờ worker CARLA"
                      : controllerRuns.runs[0].status === "running"
                        ? "Đang chạy trong CARLA"
                        : controllerRuns.comparison.controller_collision === true
                          ? "Vẫn va chạm"
                          : controllerRuns.comparison.controller_collision === false
                            ? "Đã tránh va chạm"
                            : "Lượt chạy bị lỗi"}
                  </p>
                </div>
              </div>

              {controllerRuns.runs[0].result?.metrics && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                  {controllerRuns.runs[0].result.metrics.min_distance_m !== undefined && (
                    <span className="bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Khe hở nhỏ nhất: {controllerRuns.runs[0].result.metrics.min_distance_m.toFixed(2)} m
                    </span>
                  )}
                  {controllerRuns.runs[0].result.metrics.ego_max_brake !== undefined && (
                    <span className="bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Phanh cực đại: {controllerRuns.runs[0].result.metrics.ego_max_brake.toFixed(2)}
                    </span>
                  )}
                  {controllerRuns.runs[0].result.metrics.ego_post_peak_speed_drop_ms !== undefined && (
                    <span className="bg-slate-800/70 rounded-md px-2.5 py-1.5">
                      Giảm tốc sau đỉnh: {controllerRuns.runs[0].result.metrics.ego_post_peak_speed_drop_ms.toFixed(2)} m/s
                    </span>
                  )}
                </div>
              )}

              <p className="text-sm text-cyan-100 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3">
                {controllerRuns.comparison.recommendation_vi}
              </p>
            </div>
          ) : (
            <div className="mt-5 py-8 text-center text-slate-500 border border-dashed border-slate-700/30 rounded-xl">
              <Bot className="w-9 h-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa chạy mô hình lái trên kịch bản này.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── ODD Parameters ─── */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-400" />
          Thông số ODD
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-700/15">
            <Map className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Loại đường
              </p>
              <p className="text-base font-medium text-slate-200 mt-0.5">
                {renderSafeValue(odd.road_type, ROAD_TYPE_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-700/15">
            <Cloud className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Thời tiết
              </p>
              <p className="text-base font-medium text-slate-200 mt-0.5">
                {renderSafeValue(odd.weather, WEATHER_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-700/15">
            <Users className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Tác nhân
              </p>
              <p className="text-base font-medium text-slate-200 mt-0.5">
                {renderSafeValue(odd.actor_type, ACTOR_TYPE_LABELS)}
              </p>
            </div>
          </div>
          <div className="bg-slate-800/40 p-4 rounded-xl flex items-start gap-3 border border-slate-700/15">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Hành vi
              </p>
              <p className="text-base font-medium text-slate-200 mt-0.5">
                {renderSafeValue(odd.maneuver, MANEUVER_TYPE_LABELS)}
              </p>
            </div>
          </div>
        </div>

        {/* Time & Duration */}
        <div className="mt-4 flex flex-wrap gap-6 text-sm text-slate-400 bg-slate-800/30 p-3 rounded-xl border border-slate-700/15">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span>
              Thời điểm: <strong className="text-slate-300">{scenario.time_of_day ?? "day"}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-slate-500" />
            <span>
              Thời lượng: <strong className="text-slate-300">{scenario.spec?.duration_s ?? 30}s</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ─── OpenSCENARIO XML Viewer ─── */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-400" />
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
          <div className="py-12 text-center text-slate-500 border border-dashed border-slate-700/30 rounded-xl">
            <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có mã XML</p>
          </div>
        )}
      </div>

      {/* ─── HITL Review Logs ─── */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Lịch sử duyệt
        </h2>

        {!scenario.review_logs || scenario.review_logs.length === 0 ? (
          <div className="py-10 text-center text-slate-500 border border-dashed border-slate-700/30 rounded-xl">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Chưa có lịch sử duyệt</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenario.review_logs.map((log, index) => (
              <div
                key={`${log.gate}-${log.decided_at}-${index}`}
                className="bg-slate-800/40 border border-slate-700/15 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={getGateBadgeClass(log.gate)}>
                      {getGateLabel(log.gate)}
                    </span>
                    {log.approved ? (
                      <span className="inline-flex items-center gap-1 text-green-400 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" /> Phê duyệt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 text-sm font-medium">
                        <XCircle className="w-4 h-4" /> Từ chối
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 font-medium text-sm">
                    {log.reviewer}
                  </p>
                  {log.reason && (
                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">
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
