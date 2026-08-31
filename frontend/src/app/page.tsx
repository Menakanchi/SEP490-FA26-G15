"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  Sparkles,
  AlertTriangle,
  Info,
  Users,
  Eye,
  Sliders,
  Layers,
  Sparkle,
  Bookmark,
} from "lucide-react";
import {
  postGenerate,
  getStatus,
  getScenarioById,
  postDraftScenario,
  type GenerateDuplicateMatch,
} from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { GenerationStatus, ScenarioDetail } from "@/types";
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

  // Admin Route Guard: Redirect Admin to /admin
  useEffect(() => {
    if (user?.role === "admin" || role === "admin") {
      router.push("/admin");
    }
  }, [user?.role, role, router]);

  // Form state
  const [prompt, setPrompt] = useState("");
  const [retrieveLimit, setRetrieveLimit] = useState<number>(3);
  const [submitting, setSubmitting] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<GenerateDuplicateMatch | null>(null);

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

  const [drafting, setDrafting] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);

  const handleSaveDraft = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setClientValidationError("Vui lòng nhập mô tả kịch bản trước khi lưu nháp.");
      return;
    }
    setClientValidationError(null);
    setDrafting(true);
    setDraftSuccess(null);

    try {
      const res = await postDraftScenario({
        description_vi: trimmed,
        created_by: user?.username || user?.name || "creator",
      });
      setDrafting(false);
      setDraftSuccess(`Đã lưu bản nháp mã '${res.scenario_id}' thành công!`);
    } catch (err) {
      setDrafting(false);
      setClientValidationError(
        err instanceof Error ? err.message : "Lưu bản nháp thất bại.",
      );
    }
  };

  // Form Submit
  const handleSubmit = async (forceGenerate = false) => {
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
    setDuplicateMatch(null);
    setSubmitting(true);
    setGeneratedScenario(null);

    try {
      const res = await postGenerate({
        prompt: trimmed,
        limit: retrieveLimit,
        created_by: user?.username || user?.name || "creator",
        force_generate: forceGenerate,
      });

      setSubmitting(false);

      if (res.duplicate && !forceGenerate) {
        setDuplicateMatch(res.duplicate);
        if (res.request_id && !res.duplicate.scenario_id) {
          router.push(`/?id=${res.request_id}`);
        }
        return;
      }

      if (res.request_id) {
        router.push(`/?id=${res.request_id}`);
      } else {
        setClientValidationError("Backend không trả về mã yêu cầu hoặc kịch bản đã tồn tại.");
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
    <div className="min-h-screen p-6 pt-8 font-sans bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
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
                <p className="text-sm text-blue-900/80 dark:text-slate-400 font-medium">
                  Mô tả tình huống tiếng Việt → Tự động trích xuất ODD & tạo OpenSCENARIO 1.0
                </p>
              </div>
            </div>
            {user && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-sky-50/80 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-sky-100 dark:border-slate-800 shadow-sm">
                <span>Tác giả:</span>
                <span className="font-bold text-blue-600 dark:text-cyan-400">{user.name || user.username}</span>
                <span className="uppercase text-[10px] text-blue-600 dark:text-blue-400 font-mono">({role})</span>
              </span>
            )}
          </div>
        </div>

        {/* Form Box */}
        <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 shadow-sm rounded-3xl p-6 space-y-4">
          <label className="block text-sm font-bold text-slate-900 dark:text-slate-100">
            Mô tả tình huống giao thông (Tiếng Việt)
          </label>
          <textarea
            className="w-full px-4 py-3 bg-sky-50/40 dark:bg-slate-950 border border-sky-200 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition min-h-[120px] resize-y font-sans"
            placeholder="Ví dụ: ô tô đâm đít xe máy / Xe máy tạt đầu ô tô trên đường cao tốc..."
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              if (clientValidationError) setClientValidationError(null);
              if (duplicateMatch) setDuplicateMatch(null);
            }}
            disabled={polling || submitting}
          />

          {clientValidationError && (
            <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>{clientValidationError}</span>
            </div>
          )}

          {draftSuccess && (
            <div className="p-3.5 rounded-2xl bg-green-50/90 dark:bg-green-950/40 border border-green-200 dark:border-green-800/80 flex items-center justify-between gap-2 text-xs text-green-900 dark:text-green-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span>{draftSuccess}</span>
              </div>
              <Link
                href="/library?tab=me"
                className="font-bold text-blue-600 dark:text-cyan-400 underline hover:text-blue-700"
              >
                Xem trong Thư viện cá nhân &rarr;
              </Link>
            </div>
          )}

          {duplicateMatch && (
            <div className="p-4 rounded-2xl bg-blue-50/90 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 flex items-start gap-3 text-xs text-blue-950 dark:text-blue-200">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="font-bold">
                  Mô tả này đã tồn tại
                  {duplicateMatch.scenario_id ? ` dưới mã ${duplicateMatch.scenario_id}` : " trong một lượt sinh đang chạy"}.
                </p>
                {duplicateMatch.title && <p>{duplicateMatch.title}</p>}
                {duplicateMatch.reason && (
                  <p className="text-amber-800 dark:text-amber-300">
                    <strong>Lý do từng bị từ chối:</strong> {duplicateMatch.reason}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {duplicateMatch.scenario_id && (
                    <Link
                      href={
                        duplicateMatch.scenario_status === "approved_library"
                          ? `/library/${duplicateMatch.scenario_id}`
                          : role === "reviewer" || role === "admin"
                            ? `/review?scenario_id=${duplicateMatch.scenario_id}`
                            : `/library/${duplicateMatch.scenario_id}`
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 font-bold transition"
                    >
                      Mở kịch bản cũ <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSubmit(true)}
                    disabled={submitting}
                    className="rounded-lg border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-2 font-bold transition disabled:opacity-50"
                  >
                    Vẫn sinh bản mới
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              {/* Retrieval Limit Selector */}
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-sky-50/70 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-sky-200 dark:border-slate-700">
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Số mẫu Retrieve (Limit Top-K):</span>
                <select
                  className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold px-2 py-0.5 rounded border border-sky-200 dark:border-slate-700 text-xs focus:outline-none focus:border-blue-500"
                  value={retrieveLimit}
                  onChange={(e) => setRetrieveLimit(Number(e.target.value))}
                  disabled={polling || submitting || drafting}
                >
                  <option value={1} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">1 kịch bản</option>
                  <option value={2} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">2 kịch bản</option>
                  <option value={3} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">3 kịch bản (mặc định)</option>
                  <option value={5} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">5 kịch bản</option>
                  <option value={10} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">10 kịch bản</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-4 py-3 bg-sky-50/80 hover:bg-sky-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-xl border border-sky-200 dark:border-slate-700 shadow-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                onClick={handleSaveDraft}
                disabled={!prompt.trim() || polling || submitting || drafting}
              >
                {drafting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bookmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
                {drafting ? "Đang lưu..." : "Lưu nháp"}
              </button>

              <button
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                onClick={() => void handleSubmit(false)}
                disabled={!prompt.trim() || polling || submitting || drafting}
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
        </div>

        {/* Processing indicator */}
        {polling && !isDone && !isFailed && (
          <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl px-5 py-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-cyan-400 animate-spin" />
                Đang xử lý qua các Node: <code className="text-blue-600 dark:text-cyan-300 font-mono">{status?.step}</code>
              </span>
              <span>{status?.progress ?? 0}%</span>
            </div>
            <div className="h-2 bg-sky-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out bg-blue-600"
                style={{
                  width: `${Math.max(status?.progress ?? 5, 5)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Timeout error */}
        {timeoutError && (
          <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 rounded-2xl px-5 py-3 flex items-center gap-2 text-xs font-bold shadow-sm">
            <Clock className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
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
                    {role === "creator" && (
                      <span className="block mt-1">Kịch bản đã được đưa vào hàng chờ; Reviewer cần đăng nhập để duyệt.</span>
                    )}
                  </p>
                </div>
                <Link
                  href={role === "reviewer" || role === "admin" ? `/review?scenario_id=${status.scenario_id}` : "/library?tab=me"}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition"
                >
                  <Eye className="w-4 h-4" />
                  {role === "reviewer" || role === "admin" ? "Mở bước Duyệt" : "Xem trong Thư viện cá nhân"}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Generated Details Preview */}
            {generatedScenario && (
              <div className="bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-3xl p-6 space-y-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-sky-100 dark:border-slate-800 pb-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Chi tiết Kịch bản & Suy luận (ADR-010 Multi-Actor Preview)
                </h3>

                {/* ODD Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-sky-50/80 dark:bg-slate-800 p-3 rounded-xl border border-sky-200/70 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Loại đường</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                      {renderSafeValue(generatedScenario.odd?.road_type, ROAD_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 p-3 rounded-xl border border-sky-200/70 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Thời tiết</span>
                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      {renderSafeValue(generatedScenario.odd?.weather, WEATHER_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 p-3 rounded-xl border border-sky-200/70 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Tác nhân</span>
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                      {renderSafeValue(generatedScenario.odd?.actor_type, ACTOR_TYPE_LABELS)}
                    </span>
                  </div>
                  <div className="bg-sky-50/80 dark:bg-slate-800 p-3 rounded-xl border border-sky-200/70 dark:border-slate-700/60 text-center">
                    <span className="text-[10px] text-blue-800/80 dark:text-slate-400 block uppercase font-bold">Hành vi</span>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">
                      {renderSafeValue(generatedScenario.odd?.maneuver, MANEUVER_TYPE_LABELS)}
                    </span>
                  </div>
                </div>

                {/* All Actors Table */}
                {generatedScenario.spec?.actors?.length ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      Danh sách toàn bộ Tác nhân (`spec.actors` - {generatedScenario.spec.actors.length} xe):
                    </h4>
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
                          {generatedScenario.spec.actors.map((actor, idx) => (
                            <tr key={actor.name || idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-800/40">
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
                <div className="space-y-3 pt-2 border-t border-sky-100 dark:border-slate-800">
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
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 text-blue-600">
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
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      }
    >
      <GeneratorPageContent />
    </Suspense>
  );
}
