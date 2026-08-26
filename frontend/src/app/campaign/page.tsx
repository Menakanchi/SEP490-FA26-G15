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

const STATUS_LABELS: Record<CampaignSummary["status"], string> = {
  running: "Đang chạy",
  done: "Hoàn tất",
  stopped: "Đã dừng",
};

function campaignLabel(campaign: CampaignSummary): string {
  const actors = [...new Set(campaign.cells.map((cell) => LABELS[cell.actor_type] ?? cell.actor_type))];
  const maneuvers = [...new Set(campaign.cells.map((cell) => LABELS[cell.maneuver] ?? cell.maneuver))];
  const weatherCount = new Set(campaign.cells.map((cell) => cell.weather)).size;
  return `${actors.join(", ")} · ${maneuvers.join(", ")} · ${weatherCount} thời tiết`;
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
      actors.map((actor_type) => ({ road_type: ROAD_TYPE, weather, actor_type, maneuver })),
    ),
  );
  const selectedValueCount = weathers.length + maneuvers.length + actors.length;

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
        reviewer: (typeof user === "string" ? user : user?.username) ?? "creator",
        approved: true,
        reason: forceSimulate
          ? `Vẫn chạy các bản gần trùng trong chiến dịch ${active.campaign_id}`
          : `Duyệt theo lô chiến dịch ${active.campaign_id}`,
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
    <div className="space-y-6 p-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Layers className="w-6 h-6 text-purple-600 dark:text-purple-400" /> Chiến dịch ODD
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Khoanh vùng ODD, agent viết câu tiếng Việt cho từng ô rồi nạp vào đúng pipeline của chế độ cơ bản.
          Phạm vi hiện tại: <code className="text-purple-700 dark:text-purple-300">highway</code> — ô khác chưa có anchor đã kiểm chứng.
        </p>
      </header>

      <section className="theme-card p-6 space-y-5">
        <Picker label="Thời tiết" options={[...WEATHERS]} value={weathers} onChange={setWeathers} />
        <Picker label="Tác nhân" options={[...VEHICLES]} value={actors} onChange={setActors} />
        <Picker label="Hành vi" options={[...VEHICLE_MANEUVERS]} value={maneuvers} onChange={setManeuvers} />

        <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-200 dark:border-slate-700/50">
          <label className="text-sm text-slate-700 dark:text-slate-300">
            <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Trần số kịch bản</span>
            <input type="number" min={1} max={200} value={maxScenarios}
                   onChange={(e) => setMax(Number(e.target.value))}
                   className="w-28 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100" />
          </label>
          <p className="text-xs text-slate-600 dark:text-slate-400 flex-1 min-w-[220px]">
            Đã chọn <strong className="text-slate-900 dark:text-slate-200">{selectedValueCount}</strong> giá trị
            {" · "}<strong className="text-slate-900 dark:text-slate-200">{cells.length}</strong> tổ hợp ODD tiềm năng.
            {" "}Trần <strong className="text-slate-900 dark:text-slate-200">{maxScenarios}</strong> là điều kiện dừng
            của chiến dịch.
          </p>
          <button type="button" onClick={start} disabled={starting || !cells.length}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Chạy chiến dịch
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
        <section className="theme-card p-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-200 mb-3">Các chiến dịch đã chạy</h2>
          <div className="space-y-1">
            {campaigns.map((c) => (
              <button key={c.campaign_id} type="button"
                      onClick={() => {
                        setBatchReview(null);
                        getCampaign(c.campaign_id).then(setActive);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-4 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-200 truncate">{campaignLabel(c)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {campaignTime(c.created_at)} · <code>{c.campaign_id}</code>
                  </span>
                </span>
                <span className="text-slate-600 dark:text-slate-400 text-xs shrink-0 text-right">
                  <span className="block">{STATUS_LABELS[c.status]}</span>
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
  const total = Math.min(campaign.cells.length * campaign.per_cell, campaign.max_scenarios);
  return (
    <section className="theme-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-200">
            {campaignLabel(campaign)} · {STATUS_LABELS[campaign.status]}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Tạo được {campaign.generated} bản nháp hợp lệ, {campaign.failed} lượt bị loại khi sinh hoặc kiểm tra
            {" "}trên {total} lượt theo trần
            {" · "}<code>{campaign.campaign_id}</code>
          </p>
        </div>
        {campaign.status === "running" && (
          <button type="button" onClick={onStop}
                  className="px-3 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs flex items-center gap-2">
            <Square className="w-3 h-3" /> Dừng
          </button>
        )}
      </div>

      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-purple-500 transition-all"
             style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <div className="space-y-2">
        {campaign.requests.map((r) => (
          <div key={r.request_id} className="text-xs border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={
                r.status === "done" ? "text-emerald-600 dark:text-emerald-400 font-bold"
                : r.status === "failed" ? "text-red-600 dark:text-red-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"
              }>
                {r.status === "done" ? "Đã tạo bản nháp" : r.status === "failed" ? "Bị loại" : "Đang xử lý"}
              </span>
              {r.scenario_id && <code className="text-sky-700 dark:text-sky-300">{r.scenario_id}</code>}
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
            {r.status === "failed" && r.error && (
              <p className="mt-2 text-red-700 dark:text-red-300 leading-relaxed">
                <strong>Nguyên nhân:</strong> {r.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {campaign.status !== "running" && campaign.generated > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700/60 pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl">
              Một quyết định áp dụng cho các kịch bản của đúng chiến dịch này đang chờ chạy CARLA.
              Bản gần trùng sẽ được giữ lại để bạn xem trước, không âm thầm tạo job GPU.
            </p>
            <button
              type="button"
              onClick={() => onReview(false)}
              disabled={reviewing}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
            >
              {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Duyệt cả lô để chạy CARLA
            </button>
          </div>

          {batchReview && batchReview.near_duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Đã tạo job cho {batchReview.count} kịch bản. Còn {batchReview.near_duplicates.length} bản gần
                  trùng đang dừng trước GPU: {batchReview.near_duplicates.map((item) => item.scenario_id).join(", ")}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReview(true)}
                disabled={reviewing}
                className="px-3 py-2 rounded-lg border border-amber-500/60 hover:bg-amber-500/20 disabled:opacity-50 text-amber-800 dark:text-amber-100 text-xs font-semibold"
              >
                Vẫn chạy các bản gần trùng
              </button>
            </div>
          )}

          {batchReview?.ok && batchReview.count > 0 && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Đã tạo {batchReview.count} job CARLA từ quyết định duyệt theo lô.</p>
          )}
          {batchReview?.ok && batchReview.count === 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-400">Chiến dịch này không còn kịch bản nào chờ duyệt để chạy CARLA.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Picker({ label, options, value, onChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (option: string) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <div>
      <span className="block text-xs text-slate-500 dark:text-slate-400 mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" onClick={() => toggle(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    value.includes(option)
                      ? "bg-purple-100 border-purple-500 text-purple-800 dark:bg-purple-600/20 dark:text-purple-200"
                      : "bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}>
            {LABELS[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}
