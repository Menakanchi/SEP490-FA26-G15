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
} from "lucide-react";
import { postGenerate, getStatus } from "@/services/api";
import type { GenerationStep, GenerationStatus, ValidationMode } from "@/types";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function GeneratorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [prompt, setPrompt] = useState("");
  const [validationMode, setValidationMode] = useState<ValidationMode>("static");
  const [submitting, setSubmitting] = useState(false);

  // Polling state
  const [requestId, setRequestId] = useState<string | null>(
    searchParams.get("id"),
  );
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // ------ Cleanup ------
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  // ------ Poll function ------
  const doPoll = useCallback(
    async (id: string) => {
      try {
        const data = await getStatus(id);
        setStatus(data);

        if (data.step === "done" || data.step === "failed") {
          stopPolling();
        }

        // Timeout guard
        if (Date.now() - startTimeRef.current > POLL_TIMEOUT_MS) {
          setTimeoutError(true);
          stopPolling();
        }
      } catch {
        // Network error — keep trying until timeout
        if (Date.now() - startTimeRef.current > POLL_TIMEOUT_MS) {
          setTimeoutError(true);
          stopPolling();
        }
      }
    },
    [stopPolling],
  );

  // ------ Start polling ------
  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      setTimeoutError(false);
      startTimeRef.current = Date.now();
      setPolling(true);

      // immediate first poll
      doPoll(id);

      pollRef.current = setInterval(() => doPoll(id), POLL_INTERVAL_MS);
    },
    [doPoll, stopPolling],
  );

  // ------ Resume polling on mount if ?id= exists ------
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam && !polling && !status) {
      setRequestId(idParam);
      startPolling(idParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------ Cleanup on unmount ------
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ------ Submit ------
  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setSubmitting(true);
    setStatus(null);
    setTimeoutError(false);

    try {
      const res = await postGenerate({
        prompt: prompt.trim(),
        validation_mode: validationMode,
      });
      setRequestId(res.request_id);

      // Push request_id to URL
      const url = new URL(window.location.href);
      url.searchParams.set("id", res.request_id);
      router.replace(url.pathname + url.search);

      startPolling(res.request_id);
    } catch (err) {
      setStatus({
        request_id: "",
        step: "failed",
        error: err instanceof Error ? err.message : "Lỗi không xác định",
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ─── Header ─── */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">
                  Sinh kịch bản mới
                </h1>
                <p className="text-sm text-slate-500">
                  Mô tả bằng tiếng Việt → OpenSCENARIO 1.0
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Form ─── */}
        <div className="glass-card p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Mô tả tình huống
          </label>
          <textarea
            className="input-field min-h-[120px] resize-y"
            placeholder="Mô tả tình huống giao thông nguy hiểm bằng tiếng Việt...&#10;&#10;Ví dụ: Xe máy tạt đầu ô tô trên đường cao tốc lúc trời mưa"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={polling || submitting}
          />

          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Toggle */}
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
                  ? "Chỉ validate XML"
                  : "Chạy mô phỏng"}
              </span>
            </button>

            {/* Submit */}
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
              {submitting ? "Đang gửi..." : "Bắt đầu sinh"}
            </button>
          </div>
        </div>

        {/* ─── Processing indicator (slim) ─── */}
        {polling && !isDone && !isFailed && (
          <div className="glass-card px-5 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${status?.progress ?? 5}%`,
                    background: "linear-gradient(90deg, #3b82f6, #22d3ee)",
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">
              {status?.progress ?? 0}%
            </span>
          </div>
        )}

        {/* ─── Timeout error ─── */}
        {timeoutError && (
          <div className="glass-card px-5 py-3 border-amber-500/20 flex items-center gap-2 text-sm text-amber-400">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Đã hết thời gian chờ (2 phút). Vui lòng thử lại.
          </div>
        )}

        {/* ─── Result ─── */}
        {isDone && status?.scenario_id && (
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-cyan-500/5 pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">
                  Kịch bản đã được tạo!
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  ID:{" "}
                  <code className="text-cyan-400 font-mono">
                    {status.scenario_id}
                  </code>
                </p>
              </div>
              <a
                href={`/review?scenario_id=${status.scenario_id}`}
                className="btn-primary btn-success"
              >
                Duyệt ngay
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* ─── Error ─── */}
        {isFailed && status?.error && (
          <div className="glass-card p-6 border-red-500/20">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-400">Sinh thất bại</h3>
                <p className="text-sm text-slate-400 mt-1">{status.error}</p>
              </div>
            </div>
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
