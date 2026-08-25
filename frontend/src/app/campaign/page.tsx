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
import { AlertTriangle, Layers, Loader2, Play, ShieldCheck, Square } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { PageHeader } from "@/components/PageHeader";
import { createCampaign, getCampaign, listCampaigns, reviewCampaign, stopCampaign } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { CampaignDetail, CampaignReviewResponse, CampaignSummary } from "@/types";

// Phạm vi converter hiện tại: chỉ `highway` có anchor đã smoke-test (ADR-016).
// Hard-code ở đây là có chủ đích — chọn ô ngoài phạm vi thì backend loại và
// người dùng nhận về một chiến dịch rỗng mà không hiểu vì sao.
const ROAD_TYPE = "highway";
const WEATHERS = ["clear", "rain", "heavy_rain", "fog"] as const;
const VEHICLE_MANEUVERS = ["cut_in", "sudden_brake", "lane_drift", "stop_in_lane", "run_red_light", "wrong_way"] as const;
const VEHICLES = ["car", "motorcycle", "truck"] as const;

const LABELS: Record<string, string> = {
  clear: "Trời quang", rain: "Mưa", heavy_rain: "Mưa lớn", fog: "Sương mù",
  car: "Ô tô con", motorcycle: "Xe máy", truck: "Xe tải", pedestrian: "Người đi bộ",
  cut_in: "Tạt đầu", sudden_brake: "Phanh gấp", lane_drift: "Lấn làn",
  stop_in_lane: "Dừng giữa làn", run_red_light: "Vượt đèn đỏ", wrong_way: "Đi ngược chiều",
  jaywalk: "Băng ngang đường",
};

export default function CampaignPage() {
  return (
    <AuthGate>
      <CampaignContent />
    </AuthGate>
  );
}

function CampaignContent() {
  const { user } = useAuth();
  const [weathers, setWeathers] = useState<string[]>(["clear"]);
  const [maneuvers, setManeuvers] = useState<string[]>(["cut_in"]);
  const [actors, setActors] = useState<string[]>(["car"]);
  const [maxScenarios, setMax] = useState(6);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [active, setActive] = useState<CampaignDetail | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [batchReview, setBatchReview] = useState<CampaignReviewResponse | null>(null);

  const cells = weathers.flatMap((weather) =>
    maneuvers.flatMap((maneuver) =>
      actors.map((actor_type) => ({
        road_type: ROAD_TYPE,
        weather,
        maneuver,
        actor_type,
      }))
    )
  );

  const refresh = useCallback(async () => {
    setCampaigns(await listCampaigns());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách lần đầu; setState nằm trong callback async của refresh
    refresh().catch(() => undefined);
  }, [refresh]);

  // Chiến dịch chạy nền ở backend nên trang phải hỏi lại; dừng hỏi khi nó xong
  // để không poll vô hạn một thứ đã kết thúc.
  useEffect(() => {
    if (!active || active.status !== "running") return;
    const timer = setInterval(() => {
      getCampaign(active.campaign_id).then(setActive).catch(() => undefined);
      refresh().catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { campaign_id } = await createCampaign({
        cells,
        per_cell: 1,
        max_scenarios: maxScenarios,
        created_by: (typeof user === "string" ? user : user?.username) ?? "creator",
      });
      setBatchReview(null);
      setActive(await getCampaign(campaign_id));
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
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
          subtitle="Khoanh vùng ODD, agent tự động viết câu tiếng Việt cho từng ô rồi nạp vào pipeline. Phạm vi hiện tại: highway."
          badge="Batch Generation"
        />
      </div>

      {/* Configuration Glass Card */}
      <section className="bg-white/75 dark:bg-slate-900/85 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-5">
        <Picker label="Thời tiết" options={[...WEATHERS]} value={weathers} onChange={setWeathers} />
        <Picker label="Tác nhân" options={[...VEHICLES]} value={actors} onChange={setActors} />
        <Picker label="Hành vi" options={[...VEHICLE_MANEUVERS]} value={maneuvers} onChange={setManeuvers} />

        <div className="flex flex-wrap items-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Trần số kịch bản</span>
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
            Đã khoanh <strong className="text-slate-800 dark:text-slate-200 font-bold">{cells.length}</strong> ô. Trần là điều kiện dừng chứ
            không phải tuỳ chọn — sinh tự động không có trần là hoá đơn không có trần.
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
          onReview={reviewActive}
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
                  getCampaign(c.campaign_id).then(setActive);
                }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-sm transition cursor-pointer"
              >
                <code className="text-indigo-600 dark:text-purple-300 font-mono font-bold">{c.campaign_id}</code>
                <span className="text-slate-500 dark:text-slate-400 text-xs">
                  {c.status} · sinh {c.generated}, hỏng {c.failed}
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
  onReview,
  onStop,
}: {
  campaign: CampaignDetail;
  reviewing: boolean;
  batchReview: CampaignReviewResponse | null;
  onReview: (forceSimulate?: boolean) => void;
  onStop: () => void;
}) {
  const done = campaign.generated + campaign.failed;
  const total = campaign.cells.length;
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            <code className="text-indigo-600 dark:text-purple-300 font-mono font-bold">{campaign.campaign_id}</code> · {campaign.status}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Sinh được {campaign.generated}, hỏng {campaign.failed} trên {total} ô đã khoanh
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
                {r.status}
              </span>
              {r.scenario_id && <code className="text-indigo-600 dark:text-sky-300 font-mono font-bold">{r.scenario_id}</code>}
              {r.maneuver && (
                <span className="text-slate-500 dark:text-slate-400">
                  {LABELS[r.weather ?? ""] ?? r.weather} · {LABELS[r.actor_type ?? ""] ?? r.actor_type} ·{" "}
                  {LABELS[r.maneuver] ?? r.maneuver}
                </span>
              )}
            </div>
            {/* Câu do agent viết — hiện nguyên văn để người duyệt đối chiếu được
                với kịch bản sinh ra, đúng như câu người dùng tự gõ ở chế độ cơ bản. */}
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{r.description_vi}</p>
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
    </section>
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
