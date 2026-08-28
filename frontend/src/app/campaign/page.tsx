"use client";

/**
 * Chiến dịch ODD — chế độ nâng cao.
 *
 * Người dùng ở đây **không gõ câu tiếng Việt**; họ khoanh vùng trên ma trận ODD
 * còn agent viết câu. Đó là khác biệt duy nhất so với trang Generator: câu do
 * agent viết vẫn đi qua đúng graph 7 node, đúng validate, đúng hai cổng duyệt.
 *
 * Trang riêng chứ không phải toggle trong form Generator, vì chế độ này đẻ ra
 * một thứ có vòng đời: đang chạy, sinh được bao nhiêu, hỏng bao nhiêu, dừng
 * giữa chừng. Một ô nhập không chứa nổi những thứ đó.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Layers, Loader2, Play, ShieldCheck, Square } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { PageHeader } from "@/components/PageHeader";
import {
  createCampaign,
  createCampaignControllerRuns,
  getCampaign,
  getCampaignControllerRuns,
  listCampaigns,
  reviewCampaign,
  stopCampaign,
} from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type {
  CampaignControllerBatchResponse,
  CampaignControllerSummary,
  CampaignDetail,
  CampaignReviewResponse,
  CampaignSummary,
  ManeuverType,
} from "@/types";

const ROAD_MANEUVERS: Record<"highway" | "urban_straight", readonly ManeuverType[]> = {
  highway: ["cut_in", "sudden_brake", "lane_drift", "stop_in_lane", "wrong_way"],
  urban_straight: ["run_red_light"],
};
const ROAD_TYPES = Object.keys(ROAD_MANEUVERS) as Array<keyof typeof ROAD_MANEUVERS>;
const WEATHERS = ["clear", "rain", "heavy_rain", "fog"] as const;
const VEHICLES = ["car", "motorcycle", "truck"] as const;

const LABELS: Record<string, string> = {
  clear: "Trời quang", rain: "Mưa", heavy_rain: "Mưa lớn", fog: "Sương mù",
  car: "Ô tô con", motorcycle: "Xe máy", truck: "Xe tải", pedestrian: "Người đi bộ",
  cut_in: "Tạt đầu", sudden_brake: "Phanh gấp", lane_drift: "Lấn làn",
  stop_in_lane: "Dừng giữa làn", run_red_light: "Vượt đèn đỏ", wrong_way: "Đi ngược chiều",
  jaywalk: "Băng ngang đường",
  highway: "Cao tốc", urban_straight: "Đường đô thị có đèn",
};

const STATUS_LABELS: Record<CampaignSummary["status"], string> = {
  running: "Đang chạy",
  done: "Hoàn tất",
  stopped: "Đã dừng",
};

function campaignLabel(campaign: CampaignSummary): string {
  const roads = [...new Set(campaign.cells.map((cell) => LABELS[cell.road_type] ?? cell.road_type))];
  const actors = [...new Set(campaign.cells.map((cell) => LABELS[cell.actor_type] ?? cell.actor_type))];
  const maneuvers = [...new Set(campaign.cells.map((cell) => LABELS[cell.maneuver] ?? cell.maneuver))];
  const weatherCount = new Set(campaign.cells.map((cell) => cell.weather)).size;
  return `${roads.join(", ")} · ${actors.join(", ")} · ${maneuvers.join(", ")} · ${weatherCount} thời tiết`;
}

function campaignTime(createdAt: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export default function CampaignPage() {
  return (
    <AuthGate>
      <CampaignContent />
    </AuthGate>
  );
}

function CampaignContent() {
  const { user } = useAuth();
  const [roadType, setRoadType] = useState<keyof typeof ROAD_MANEUVERS>("highway");
  const [weathers, setWeathers] = useState<string[]>(["clear"]);
  const [maneuvers, setManeuvers] = useState<string[]>(["cut_in"]);
  const [actors, setActors] = useState<string[]>(["car"]);
  const [perCell, setPerCell] = useState(1);
  const [maxScenarios, setMax] = useState(6);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [active, setActive] = useState<CampaignDetail | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [batchReview, setBatchReview] = useState<CampaignReviewResponse | null>(null);
  const [controllerStarting, setControllerStarting] = useState(false);
  const [controllerBatch, setControllerBatch] = useState<CampaignControllerBatchResponse | null>(null);
  const [controllerSummary, setControllerSummary] = useState<CampaignControllerSummary | null>(null);

  const cells = weathers.flatMap((weather) =>
    maneuvers.flatMap((maneuver) =>
      actors.map((actor_type) => ({ road_type: roadType, weather, actor_type, maneuver })),
    ),
  );
  const selectedValueCount = 1 + weathers.length + maneuvers.length + actors.length;
  const plannedCount = Math.min(cells.length * perCell, maxScenarios);

  const refresh = useCallback(async () => {
    setCampaigns(await listCampaigns());
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!active || active.status !== "running") return;
    const timer = setInterval(() => {
      getCampaign(active.campaign_id).then(setActive).catch(() => undefined);
      refresh().catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getCampaignControllerRuns(active.campaign_id)
      .then((value) => {
        if (!cancelled) setControllerSummary(value);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (!active || !controllerSummary?.pending) return;
    const timer = window.setInterval(() => {
      getCampaignControllerRuns(active.campaign_id).then(setControllerSummary).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active, controllerSummary?.pending]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { campaign_id } = await createCampaign({
        cells,
        per_cell: perCell,
        max_scenarios: maxScenarios,
        created_by: (typeof user === "string" ? user : user?.username) ?? "creator",
      });
      setBatchReview(null);
      setControllerBatch(null);
      setControllerSummary(null);
      setActive(await getCampaign(campaign_id));
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const runControllers = async () => {
    if (!active) return;
    setControllerStarting(true);
    setError(null);
    try {
      setControllerBatch(await createCampaignControllerRuns(active.campaign_id));
      setControllerSummary(await getCampaignControllerRuns(active.campaign_id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setControllerStarting(false);
    }
  };

  const reviewActive = async (forceSimulate = false) => {
    if (!active) return;
    setReviewing(true);
    setError(null);
    try {
      const result = await reviewCampaign(active.campaign_id, {
        reviewer: (typeof user === "string" ? user : user?.username) ?? "reviewer",
        approved: true,
        reason: "Duyệt theo lô từ trang chiến dịch ODD",
        force_simulate: forceSimulate,
      });
      setBatchReview(result);
      setActive(await getCampaign(active.campaign_id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* Header Glass Box */}
      <div className="bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-2xl rounded-[32px] p-6 sm:p-7 transition-all">
        <PageHeader
          icon={Layers}
          title="Chiến dịch ODD — Sinh lô ma trận"
          subtitle="Khoanh vùng ODD, agent tự động viết câu tiếng Việt cho từng ô rồi nạp vào pipeline."
          badge="Batch Generation"
        />
      </div>

      {/* Configuration Glass Card */}
      <section className="bg-white/75 dark:bg-slate-900/85 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-5">
        <SinglePicker
          label="Loại đường"
          options={ROAD_TYPES}
          value={roadType}
          onChange={(value) => {
            setRoadType(value);
            setManeuvers([...ROAD_MANEUVERS[value]]);
          }}
        />
        <Picker label="Thời tiết" options={[...WEATHERS]} value={weathers} onChange={setWeathers} />
        <Picker label="Tác nhân" options={[...VEHICLES]} value={actors} onChange={setActors} />
        <Picker label="Hành vi" options={[...ROAD_MANEUVERS[roadType]]} value={maneuvers} onChange={setManeuvers} />

        <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Biến thể mỗi tổ hợp</span>
            <input
              type="number"
              min={1}
              max={20}
              value={perCell}
              onChange={(e) => setPerCell(Math.max(1, Number(e.target.value)))}
              className="w-28 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Số kịch bản tối đa</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxScenarios}
              onChange={(e) => setMax(Number(e.target.value))}
              className="w-28 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-[220px] leading-relaxed">
            Đã chọn <strong className="text-slate-800 dark:text-slate-200 font-bold">{selectedValueCount}</strong> giá trị
            {" · "}<strong className="text-slate-800 dark:text-slate-200 font-bold">{cells.length}</strong> tổ hợp.
            {" "}Kế hoạch thực tế: <strong className="text-slate-800 dark:text-slate-200 font-bold">{plannedCount}</strong> lượt
            {" "}({perCell} biến thể/tổ hợp, dừng ở trần {maxScenarios}).
          </p>
          <button
            type="button"
            onClick={start}
            disabled={starting || !cells.length}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white text-sm font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 transition cursor-pointer"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Chạy chiến dịch
          </button>
        </div>
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </section>

      {active && (
        <ActiveCampaign
          campaign={active}
          reviewing={reviewing}
          batchReview={batchReview}
          controllerStarting={controllerStarting}
          controllerBatch={controllerBatch}
          controllerSummary={controllerSummary}
          onReview={reviewActive}
          onRunControllers={runControllers}
          onStop={async () => {
            await stopCampaign(active.campaign_id);
            setActive(await getCampaign(active.campaign_id));
          }}
        />
      )}

      {campaigns.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Các chiến dịch đã chạy</h2>
          <div className="space-y-1">
            {campaigns.map((c) => (
              <button
                key={c.campaign_id}
                type="button"
                onClick={() => {
                  setBatchReview(null);
                  setControllerBatch(null);
                  setControllerSummary(null);
                  getCampaign(c.campaign_id).then(setActive);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-sm transition cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-200 truncate">{campaignLabel(c)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {campaignTime(c.created_at)} · <code className="font-mono text-indigo-600 dark:text-purple-300">{c.campaign_id}</code>
                  </span>
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-xs shrink-0 text-right">
                  <span className="block font-bold">{STATUS_LABELS[c.status]}</span>
                  <span className="block">Bản nháp hợp lệ {c.generated}/{c.generated + c.failed} · bị loại {c.failed}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActiveCampaign({
  campaign,
  reviewing,
  batchReview,
  controllerStarting,
  controllerBatch,
  controllerSummary,
  onReview,
  onRunControllers,
  onStop,
}: {
  campaign: CampaignDetail;
  reviewing: boolean;
  batchReview: CampaignReviewResponse | null;
  controllerStarting: boolean;
  controllerBatch: CampaignControllerBatchResponse | null;
  controllerSummary: CampaignControllerSummary | null;
  onReview: (forceSimulate?: boolean) => void;
  onRunControllers: () => void;
  onStop: () => void;
}) {
  const done = campaign.generated + campaign.failed;
  const total = Math.min(campaign.cells.length * campaign.per_cell, campaign.max_scenarios);
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {campaignLabel(campaign)} · {STATUS_LABELS[campaign.status]}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Tạo được {campaign.generated} bản nháp hợp lệ, {campaign.failed} lượt bị loại khi sinh hoặc kiểm tra trên tối đa {total} lượt
            {" · "}<code className="font-mono text-indigo-600 dark:text-purple-300">{campaign.campaign_id}</code>
          </p>
        </div>
        {campaign.status === "running" && (
          <button
            type="button"
            onClick={onStop}
            className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-2 cursor-pointer transition"
          >
            <Square className="w-3.5 h-3.5" /> Dừng
          </button>
        )}
      </div>

      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-indigo-600 dark:bg-purple-500 transition-all"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-2">
        {campaign.requests.map((r) => (
          <div key={r.request_id} className="text-xs border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-950/50">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={
                  r.status === "done"
                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                    : r.status === "failed"
                    ? "text-red-600 dark:text-red-400 font-bold"
                    : "text-amber-600 dark:text-amber-400 font-bold"
                }
              >
                {r.status === "done" ? "Đã tạo bản nháp" : r.status === "failed" ? "Bị loại" : "Đang xử lý"}
              </span>
              {r.scenario_id && <code className="text-indigo-600 dark:text-sky-300 font-mono font-bold">{r.scenario_id}</code>}
              {r.maneuver && (
                <span className="text-slate-500 dark:text-slate-400">
                  {LABELS[r.weather ?? ""] ?? r.weather} · {LABELS[r.actor_type ?? ""] ?? r.actor_type} ·{" "}
                  {LABELS[r.maneuver] ?? r.maneuver}
                </span>
              )}
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{r.description_vi}</p>
            {r.status === "failed" && r.error && (
              <p className="mt-2 text-red-700 dark:text-red-300 leading-relaxed">
                <strong>Nguyên nhân:</strong> {r.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {campaign.status !== "running" && campaign.generated > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
              Một quyết định áp dụng cho các kịch bản của đúng chiến dịch này đang chờ chạy CARLA.
              Bản gần trùng sẽ được giữ lại để bạn xem trước, không âm thầm tạo job GPU.
            </p>
            <button
              type="button"
              onClick={() => onReview(false)}
              disabled={reviewing}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition"
            >
              {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Duyệt cả lô để chạy CARLA
            </button>
          </div>

          {batchReview && batchReview.near_duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs leading-relaxed">
                  Đã tạo job cho {batchReview.count} kịch bản. Còn {batchReview.near_duplicates.length} bản gần
                  trùng đang dừng trước GPU: {batchReview.near_duplicates.map((item) => item.scenario_id).join(", ")}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReview(true)}
                disabled={reviewing}
                className="px-3 py-2 rounded-lg border border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-50 text-amber-900 dark:text-amber-100 text-xs font-bold cursor-pointer transition"
              >
                Vẫn chạy các bản gần trùng
              </button>
            </div>
          )}

          {batchReview?.ok && batchReview.count > 0 && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Đã tạo {batchReview.count} job CARLA từ quyết định duyệt theo lô.</p>
          )}
          {batchReview?.ok && batchReview.count === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Chiến dịch này không còn kịch bản nào chờ duyệt để chạy CARLA.</p>
          )}
        </div>
      )}

      {campaign.status !== "running" && campaign.generated > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700/60 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-2xl">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /> Closed-loop BehaviorAgent theo lô
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Chỉ xếp cặp A/B cho các kịch bản đã vào thư viện và đã tái hiện nguy hiểm. Kịch bản đã chạy hoặc đang chờ sẽ không bị tạo job trùng.
              </p>
            </div>
            <button
              type="button"
              onClick={onRunControllers}
              disabled={controllerStarting || controllerSummary?.pending}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition"
            >
              {controllerStarting || controllerSummary?.pending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />}
              {controllerSummary?.pending ? "Đang chạy BehaviorAgent" : "Đánh giá BehaviorAgent cả lô"}
            </button>
          </div>

          {controllerBatch && (
            <p className={`text-xs ${controllerBatch.count > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}`}>
              {controllerBatch.count > 0
                ? `Đã xếp ${controllerBatch.count} kịch bản (${controllerBatch.job_count} job A/B).`
                : "Không có kịch bản mới đủ điều kiện; hãy hoàn tất Cổng 2 hoặc xem các kết quả đã chạy."}
              {controllerBatch.skipped.length > 0 && ` Bỏ qua ${controllerBatch.skipped.length} kịch bản chưa đủ điều kiện hoặc đã được đánh giá.`}
            </p>
          )}

          {controllerSummary && controllerSummary.evaluations.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ["controller_collision", "Mô hình va chạm", "text-red-700 dark:text-red-300"],
                ["near_failure", "Suýt thất bại", "text-amber-700 dark:text-amber-300"],
                ["avoided_hazard", "Đã tránh", "text-emerald-700 dark:text-emerald-300"],
                ["pending", "Đang chạy", "text-blue-700 dark:text-blue-300"],
              ].map(([key, label, tone]) => (
                <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3 text-center">
                  <span className="block text-[10px] uppercase text-slate-500 dark:text-slate-400">{label}</span>
                  <strong className={`text-lg ${tone}`}>{controllerSummary.counts[key] ?? 0}</strong>
                </div>
              ))}
            </div>
          )}

          {controllerSummary?.evaluations.map((evaluation) => (
            <div key={evaluation.scenario_id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs flex flex-wrap gap-2 justify-between">
              <code className="text-cyan-700 dark:text-cyan-300">{evaluation.scenario_id}</code>
              <span className="text-slate-700 dark:text-slate-300">{evaluation.comparison.recommendation_vi}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SinglePicker<T extends string>({ label, options, value, onChange }: {
  label: string; options: T[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer font-medium ${
              value === option
                ? "bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-500/20 border border-indigo-600"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {LABELS[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <div>
      <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer font-medium ${
                isSelected
                  ? "bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-500/20 border border-indigo-600"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {LABELS[option] ?? option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
