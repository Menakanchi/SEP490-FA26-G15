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
  Users,
  Eye,
  Sliders,
  Layers,
  Sparkle,
} from "lucide-react";
import { postGenerate, getStatus, getScenarioById } from "@/services/api";
import SVG2DRenderer from "@/components/SVG2DRenderer";
import { useAuth } from "@/context/AuthContext";
import type { GenerationStatus, ValidationMode, ScenarioDetail } from "@/types";
import {
  ROAD_TYPE_LABELS,
  WEATHER_LABELS,
  ACTOR_TYPE_LABELS,
  MANEUVER_TYPE_LABELS,
  renderSafeValue,
  renderActorCategoryLabel,
} from "@/types";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function GeneratorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role } = useAuth();

  // Form state
  const [prompt, setPrompt] = useState("");
  const [validationMode, setValidationMode] = useState<ValidationMode>("static");
  const [retrieveLimit, setRetrieveLimit] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);

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
      startTimeRef.current = Date.now();
      setTimeoutError(false);
      setPolling(true);
      void doPoll(id);
      pollRef.current = setInterval(() => {
        void doPoll(id);
      }, POLL_INTERVAL_MS);
    },
    [doPoll, stopPolling],
  );

  // Read ?id= from URL on mount & start polling if present
  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    if (idFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- poll initial request from url
      startPolling(idFromUrl);
    } else {
      stopPolling();
      setStatus(null);
      setGeneratedScenario(null);
    }
    return () => {
      stopPolling();
    };
  }, [searchParams, startPolling, stopPolling]);

  // Form Submit
  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setClientValidationError("Vui lòng nhập mô tả kịch bản trước khi gửi.");
      return;
    }

    if (trimmed.length < 10) {
      setClientValidationError("Mô tả kịch bản quá ngắn (cần từ 10 ký tự trở lên).");
      return;
    }

    setClientValidationError(null);
    setSubmitting(true);
    setGeneratedScenario(null);

    try {
      const res = await postGenerate({
        prompt: trimmed,
        validation_mode: validationMode,
        limit: retrieveLimit,
      });

      setSubmitting(false);

      if (res.request_id) {
        router.push(`/?id=${res.request_id}`);
      }
    } catch (err) {
      setSubmitting(false);
      setClientValidationError(
        err instanceof Error ? err.message : "Gửi yêu cầu sinh kịch bản thất bại.",
      );
    }
  };

  const isDone = status?.step === "done";
  const isFailed = status?.step === "failed";

  return (
    <div className="min-h-screen p-6 pt-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative">
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  Sinh kịch bản mới (Creator Flow)
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Mô tả tình huống tiếng Việt → Tự động trích xuất ODD & tạo OpenSCENARIO 1.0
                </p>
              </div>
            </div>
            {user && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 shadow-sm">
                <span>Tác giả:</span>
                <span className="font-bold text-blue-600 dark:text-cyan-400">{user.name || user.username}</span>
                <span className="uppercase text-[10px] text-blue-600 font-mono">({role})</span>
              </span>
            )}
          </div>
        </div>

        {/* Form Box */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-sm">
          <label className="block text-sm font-bold text-slate-900 dark:text-slate-100">
            Mô tả tình huống giao thông (Tiếng Việt)
          </label>
          <textarea
            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition min-h-[120px] resize-y font-sans"
            placeholder="Ví dụ: ô tô đâm đít xe máy / Xe máy tạt đầu ô tô trên đường cao tốc..."
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (clientValidationError) setClientValidationError(null);
            }}
            disabled={polling || submitting}
          />

          {clientValidationError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>{clientValidationError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              {/* Validation Mode Toggle */}
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                onClick={() =>
                  setValidationMode((m) => (m === "static" ? "sim" : "static"))
                }
                disabled={polling || submitting}
              >
                {validationMode === "sim" ? (
                  <ToggleRight className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400" />
                )}
                <span>
                  {validationMode === "static"
                    ? "Chế độ: Validate XML (Fast)"
                    : "Chế độ: Mô phỏng thật (Sim)"}
                </span>
              </button>

              {/* Retrieval Limit Selector */}
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Số mẫu Retrieve (Limit Top-K):</span>
                <select
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:border-blue-500"
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
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl px-5 py-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 animate-spin" />
                Đang xử lý qua các Node: <code className="text-blue-600 dark:text-cyan-300 font-mono">{status?.step}</code>
              </span>
              <span>{status?.progress ?? 0}%</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.max(status?.progress ?? 5, 5)}%`,
                  background: "linear-gradient(90deg, #2563eb, #06b6d4)",
                }}
              />
            </div>
          </div>
        )}

        {/* Timeout error */}
        {timeoutError && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-3 flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Đã hết thời gian chờ (2 phút). Vui lòng thử lại.
          </div>
        )}

        {/* Error HTTP 400 / 422 Display */}
        {isFailed && status?.error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-3xl p-6">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-bold text-red-900 dark:text-red-300 text-sm">
                  Không thể xử lý yêu cầu (HTTP 400 / 422)
                </h3>
                <p className="text-xs text-red-950 dark:text-slate-300 leading-relaxed font-mono bg-white dark:bg-slate-900 p-3 rounded-xl border border-red-200 dark:border-red-900/60">
                  {status.error}
                </p>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1 font-medium">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  <span>Gợi ý: Hãy nhập câu đầy đủ về loại phương tiện và hành vi va chạm cụ thể.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result & Generated Scenario Details */}
        {isDone && status?.scenario_id && (
          <div className="space-y-5">
            <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-3xl p-6 relative overflow-hidden shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-extrabold text-base">
                    <CheckCircle2 className="w-5 h-5" />
                    Kịch bản đã sinh thành công!
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Scenario ID: <code className="text-blue-600 dark:text-cyan-300 font-mono font-bold">{status.scenario_id}</code>
                  </p>
                </div>
                <a
                  href={`/review?scenario_id=${status.scenario_id}`}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition"
                >
                  <Eye className="w-4 h-4" />
                  Chuyển sang bước Duyệt (Reviewer)
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Generated Details Preview */}
            {generatedScenario && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Chi tiết Kịch bản & Suy luận (ADR-010 Multi-Actor Preview)
                </h3>

                {/* ODD Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-bold">Loại đường</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {renderSafeValue(generatedScenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-bold">Thời tiết</span>
                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      {renderSafeValue(generatedScenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-bold">Tác nhân</span>
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                      {renderSafeValue(generatedScenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-bold">Hành vi</span>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">
                      {renderSafeValue(generatedScenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>

                {/* 2D Lane Preview */}
                {generatedScenario.spec?.actors?.length ? (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block flex items-center gap-2">
                      <Map className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Sơ đồ làn đường 2D (Render đầy đủ Hero & Adversaries):
                    </span>
                    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950">
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

                {/* All Actors Table */}
                {generatedScenario.spec?.actors?.length ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      Danh sách toàn bộ Tác nhân (`spec.actors` - {generatedScenario.spec.actors.length} xe):
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                      <table className="w-full text-xs text-left text-slate-800 dark:text-slate-200">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase font-bold text-[10px] border-b border-slate-200 dark:border-slate-700/60">
                          <tr>
                            <th className="p-3">Tên xe</th>
                            <th className="p-3">Loại phương tiện</th>
                            <th className="p-3">Vai trò</th>
                            <th className="p-3">Làn (`lane_offset`)</th>
                            <th className="p-3">Khoảng cách S (`s_offset_m`)</th>
                            <th className="p-3">Tốc độ ban đầu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {generatedScenario.spec.actors.map((actor, idx) => (
                            <tr key={actor.name || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="p-3 font-mono font-bold text-blue-600 dark:text-cyan-300">{actor.name}</td>
                              <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                                {renderActorCategoryLabel(actor, generatedScenario.odd)}
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
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Khối kịch bản mẫu tương đồng được Retrieve (`retrieved_examples`):
                  </h4>

                  {!generatedScenario.retrieved_examples || generatedScenario.retrieved_examples.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 flex items-center gap-3">
                      <Sparkle className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 text-xs font-bold mr-2 border border-purple-200 dark:border-purple-700">
                          Chế độ Zero-Shot
                        </span>
                        <span className="text-xs text-slate-700 dark:text-slate-300">
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
                            className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-2"
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
                            <div className="flex flex-wrap gap-1 pt-1">
                              {meta.road_type && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  {meta.road_type}
                                </span>
                              )}
                              {meta.weather && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                                  {meta.weather}
                                </span>
                              )}
                              {meta.actor_type && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                  {meta.actor_type}
                                </span>
                              )}
                              {meta.maneuver && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
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

import LandingPage from "@/app/landing/page";

export default function GeneratorPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-blue-600">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <GeneratorPageContent />
    </Suspense>
  );
}
