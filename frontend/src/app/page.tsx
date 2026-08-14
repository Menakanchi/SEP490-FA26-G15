"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  AlertTriangle,
  Info,
  Map,
  Cloud,
  Users,
  Eye,
  Sliders,
  Layers,
  Sparkle,
} from "lucide-react";
import { postGenerate, getStatus, getScenarioById } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import type { GenerationStatus, ValidationMode, ScenarioDetail } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  VEHICLE_CATEGORY_LABELS,
  renderSafeValue,
  renderActorCategoryLabel,
} from "@/types";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function GeneratorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [prompt, setPrompt] = useState("");
  const [validationMode, setValidationMode] = useState<ValidationMode>("static");
  const [retrieveLimit, setRetrieveLimit] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);

  // Polling state
  const [requestId, setRequestId] = useState<string | null>(
    searchParams.get("id"),
  );
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [generatedScenario, setGeneratedScenario] = useState<ScenarioDetail | null>(null);
  const [polling, setPolling] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Cleanup
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  // Poll function
  const doPoll = useCallback(
    async (id: string) => {
      try {
        const data = await getStatus(id);
        setStatus(data);

        if (data.step === "done" && data.scenario_id) {
          stopPolling();
          try {
            const sc = await getScenarioById(data.scenario_id);
            setGeneratedScenario(sc);
          } catch (e) {
            console.error("Lỗi khi tải chi tiết kịch bản", e);
          }
        } else if (data.step === "failed") {
          stopPolling();
        }

        if (Date.now() - startTimeRef.current > POLL_TIMEOUT_MS) {
          setTimeoutError(true);
          stopPolling();
        }
      } catch {
        if (Date.now() - startTimeRef.current > POLL_TIMEOUT_MS) {
          setTimeoutError(true);
          stopPolling();
        }
      }
    },
    [stopPolling],
  );

  // Start polling
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      setTimeoutError(false);
      startTimeRef.current = Date.now();
      setPolling(true);
      setGeneratedScenario(null);

      doPoll(id);
      pollRef.current = setInterval(() => doPoll(id), POLL_INTERVAL_MS);
    },
    [doPoll, stopPolling],
  );

  // Resume on mount
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam && !polling && !status) {
      setRequestId(idParam);
      startPolling(idParam);
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Submit
  const handleSubmit = async () => {
    setClientValidationError(null);
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setClientValidationError("Vui lòng nhập câu mô tả kịch bản.");
      return;
    }
    if (trimmedPrompt.length < 10) {
      setClientValidationError("Mô tả kịch bản quá ngắn (tối thiểu 10 ký tự). Vui lòng mô tả chi tiết hơn.");
      return;
    }

    setSubmitting(true);
    setStatus(null);
    setGeneratedScenario(null);
    setTimeoutError(false);

    try {
      const res = await postGenerate({
        prompt: trimmedPrompt,
        validation_mode: validationMode,
        limit: retrieveLimit,
      });
      setRequestId(res.request_id);

      const url = new URL(window.location.href);
      url.searchParams.set("id", res.request_id);
      router.replace(url.pathname + url.search);

      startPolling(res.request_id);
    } catch (err) {
      setStatus({
        request_id: "",
        step: "failed",
        error: err instanceof Error ? err.message : "Lỗi không xác định khi gọi API.",
        progress: 0,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isDone = status?.step === "done";
  const isFailed = status?.step === "failed";

  return (
    <div className="min-h-screen p-6 pt-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">
                Sinh kịch bản mới (Creator Flow)
              </h1>
              <p className="text-sm text-slate-400">
                Mô tả tình huống tiếng Việt → Tự động trích xuất ODD & tạo OpenSCENARIO 1.0
              </p>
            </div>
          </div>
        </div>

        {/* Form Box */}
        <div className="glass-card p-6 space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            Mô tả tình huống giao thông (Tiếng Việt)
          </label>
          <textarea
            className="input-field min-h-[120px] resize-y"
            placeholder="Ví dụ: ô tô đâm đít xe máy / Xe máy tạt đầu ô tô trên đường cao tốc..."
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (clientValidationError) setClientValidationError(null);
            }}
            disabled={polling || submitting}
          />

          {clientValidationError && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{clientValidationError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              {/* Validation Mode Toggle */}
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                onClick={() =>
                  setValidationMode((m) => (m === "static" ? "sim" : "static"))
                }
                disabled={polling || submitting}
              >
                {validationMode === "sim" ? (
                  <ToggleRight className="w-6 h-6 text-cyan-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-500" />
                )}
                <span>
                  {validationMode === "static"
                    ? "Chế độ: Validate XML (Fast)"
                    : "Chế độ: Mô phỏng thật (Sim)"}
                </span>
              </button>

              {/* Retrieval Limit Selector */}
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/40">
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>Số mẫu Retrieve (Limit Top-K):</span>
                <select
                  className="bg-slate-900 text-slate-200 font-semibold px-2 py-0.5 rounded border border-slate-700 text-xs focus:outline-none focus:border-blue-400"
                  value={retrieveLimit}
                  onChange={(e) => setRetrieveLimit(Number(e.target.value))}
                  disabled={polling || submitting}
                >
                  <option value={1}>1 kịch bản</option>
                  <option value={2}>2 kịch bản</option>
                  <option value={3}>3 kịch bản (mặc định)</option>
                  <option value={5}>5 kịch bản</option>
                  <option value={10}>10 kịch bản</option>
                </select>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!prompt.trim() || polling || submitting}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {submitting ? "Đang gửi..." : "Bắt đầu sinh kịch bản"}
            </button>
          </div>
        </div>

        {/* Processing indicator */}
        {polling && !isDone && !isFailed && (
          <div className="glass-card px-5 py-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                Đang xử lý qua các Node: <code className="text-cyan-300 font-mono">{status?.step}</code>
              </span>
              <span>{status?.progress ?? 0}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.max(status?.progress ?? 5, 5)}%`,
                  background: "linear-gradient(90deg, #3b82f6, #22d3ee)",
                }}
              />
            </div>
          </div>
        )}

        {/* Timeout error */}
        {timeoutError && (
          <div className="glass-card px-5 py-3 border-amber-500/20 flex items-center gap-2 text-sm text-amber-400">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Đã hết thời gian chờ (2 phút). Vui lòng thử lại.
          </div>
        )}

        {/* Error HTTP 400 / 422 Display */}
        {isFailed && status?.error && (
          <div className="glass-card p-6 border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold text-red-400 text-base">
                  Không thể xử lý yêu cầu (HTTP 400 / 422)
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed font-mono bg-slate-900/60 p-3 rounded-lg border border-red-500/20">
                  {status.error}
                </p>
                <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>Gợi ý: Hãy nhập câu đầy đủ về loại phương tiện và hành vi va chạm cụ thể.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result & Generated Scenario Details */}
        {isDone && status?.scenario_id && (
          <div className="space-y-5">
            <div className="glass-card p-6 border-green-500/30 bg-green-500/5 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-green-400 font-semibold text-lg">
                    <CheckCircle2 className="w-5 h-5" />
                    Kịch bản đã sinh thành công!
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Scenario ID: <code className="text-cyan-300 font-mono">{status.scenario_id}</code>
                  </p>
                </div>
                <a
                  href={`/review?scenario_id=${status.scenario_id}`}
                  className="btn-primary btn-success flex items-center gap-2 text-sm"
                >
                  <Eye className="w-4 h-4" />
                  Chuyển sang bước Duyệt (Reviewer)
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Generated Details Preview */}
            {generatedScenario && (
              <div className="glass-card p-6 space-y-6">
                <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2 border-b border-slate-700/30 pb-3">
                  <Info className="w-5 h-5 text-blue-400" />
                  Chi tiết Kịch bản & Suy luận (ADR-010 Multi-Actor Preview)
                </h3>

                {/* ODD Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[11px] text-slate-400 block uppercase">Loại đường</span>
                    <span className="text-xs font-semibold text-blue-400">
                      {renderSafeValue(generatedScenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[11px] text-slate-400 block uppercase">Thời tiết</span>
                    <span className="text-xs font-semibold text-cyan-400">
                      {renderSafeValue(generatedScenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[11px] text-slate-400 block uppercase">Tác nhân</span>
                    <span className="text-xs font-semibold text-orange-400">
                      {renderSafeValue(generatedScenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/20 text-center">
                    <span className="text-[11px] text-slate-400 block uppercase">Hành vi</span>
                    <span className="text-xs font-semibold text-red-400">
                      {renderSafeValue(generatedScenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>

                {/* 2D Lane Preview */}
                {generatedScenario.spec?.actors?.length ? (
                  <div className="space-y-3">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block flex items-center gap-2">
                      <Map className="w-4 h-4 text-blue-400" />
                      Sơ đồ làn đường 2D (Render đầy đủ Hero & Adversaries):
                    </span>
                    <div className="rounded-xl overflow-hidden border border-slate-700/20">
                      <SVG2DRenderer
                        actors={generatedScenario.spec.actors}
                        odd={generatedScenario.odd}
                        maneuvers={generatedScenario.spec.maneuvers}
                        width="100%"
                        height={280}
                      />
                    </div>
                  </div>
                ) : null}

                {/* 1. All Actors Table (ADR-010) */}
                {generatedScenario.spec?.actors?.length ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4 text-orange-400" />
                      Danh sách toàn bộ Tác nhân (`spec.actors` - {generatedScenario.spec.actors.length} xe):
                    </h4>
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
                          {generatedScenario.spec.actors.map((actor, idx) => (
                            <tr key={actor.name || idx} className="hover:bg-slate-800/30">
                              <td className="p-3 font-mono font-semibold text-cyan-300">{actor.name}</td>
                              <td className="p-3 font-semibold text-slate-200">
                                {renderActorCategoryLabel(actor, generatedScenario.odd)}
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

                {/* 2. Retrieved Examples Block */}
                <div className="space-y-3 pt-2 border-t border-slate-700/30">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Khối kịch bản mẫu tương đồng được Retrieve (`retrieved_examples`):
                  </h4>

                  {!generatedScenario.retrieved_examples || generatedScenario.retrieved_examples.length === 0 ? (
                    <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center gap-3">
                      <Sparkle className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      <div>
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-xs font-bold mr-2">
                          Chế độ Zero-Shot
                        </span>
                        <span className="text-xs text-slate-300">
                          Không tìm thấy kịch bản mẫu tương đồng trong cơ sở dữ liệu. Workflow hoạt động ở chế độ Zero-Shot.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generatedScenario.retrieved_examples.map((item, idx) => {
                        const scorePct = item.similarity_score
                          ? Math.round(item.similarity_score * 100)
                          : 85;
                        const meta = item.metadata || {};
                        return (
                          <div
                            key={item.id || idx}
                            className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 space-y-2 hover:border-purple-500/40 transition-colors"
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
                            <div className="flex flex-wrap gap-1 pt-1">
                              {meta.road_type && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {meta.road_type}
                                </span>
                              )}
                              {meta.weather && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  {meta.weather}
                                </span>
                              )}
                              {meta.actor_type && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                  {meta.actor_type}
                                </span>
                              )}
                              {meta.maneuver && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                  {meta.maneuver}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      }
    >
      <GeneratorPageContent />
    </Suspense>
  );
}
