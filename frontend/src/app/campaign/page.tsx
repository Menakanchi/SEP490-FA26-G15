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
import { Layers, Loader2, Play, Square } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { createCampaign, getCampaign, listCampaigns, stopCampaign } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import type { CampaignDetail, CampaignSummary } from "@/types";

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

  const cells = weathers.flatMap((weather) =>
    maneuvers.flatMap((maneuver) =>
      actors.map((actor_type) => ({ road_type: ROAD_TYPE, weather, actor_type, maneuver })),
    ),
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
      setActive(await getCampaign(campaign_id));
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Layers className="w-6 h-6 text-purple-400" /> Chiến dịch ODD
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Khoanh vùng ODD, agent viết câu tiếng Việt cho từng ô rồi nạp vào đúng pipeline của chế độ cơ bản.
          Phạm vi hiện tại: <code className="text-purple-300">highway</code> — ô khác chưa có anchor đã kiểm chứng.
        </p>
      </header>

      <section className="glass-card p-6 space-y-5">
        <Picker label="Thời tiết" options={[...WEATHERS]} value={weathers} onChange={setWeathers} />
        <Picker label="Tác nhân" options={[...VEHICLES]} value={actors} onChange={setActors} />
        <Picker label="Hành vi" options={[...VEHICLE_MANEUVERS]} value={maneuvers} onChange={setManeuvers} />

        <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-700/50">
          <label className="text-sm text-slate-300">
            <span className="block text-xs text-slate-400 mb-1">Trần số kịch bản</span>
            <input type="number" min={1} max={200} value={maxScenarios}
                   onChange={(e) => setMax(Number(e.target.value))}
                   className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100" />
          </label>
          <p className="text-xs text-slate-400 flex-1 min-w-[220px]">
            Đã khoanh <strong className="text-slate-200">{cells.length}</strong> ô. Trần là điều kiện dừng chứ
            không phải tuỳ chọn — sinh tự động không có trần là hoá đơn không có trần.
          </p>
          <button type="button" onClick={start} disabled={starting || !cells.length}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2">
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Chạy chiến dịch
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>

      {active && <ActiveCampaign campaign={active} onStop={async () => {
        await stopCampaign(active.campaign_id);
        setActive(await getCampaign(active.campaign_id));
      }} />}

      {campaigns.length > 0 && (
        <section className="glass-card p-6">
          <h2 className="text-sm font-bold text-slate-200 mb-3">Các chiến dịch đã chạy</h2>
          <div className="space-y-1">
            {campaigns.map((c) => (
              <button key={c.campaign_id} type="button"
                      onClick={() => getCampaign(c.campaign_id).then(setActive)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 flex items-center justify-between text-sm">
                <code className="text-purple-300">{c.campaign_id}</code>
                <span className="text-slate-400 text-xs">
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

function ActiveCampaign({ campaign, onStop }: { campaign: CampaignDetail; onStop: () => void }) {
  const done = campaign.generated + campaign.failed;
  const total = campaign.cells.length;
  return (
    <section className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-200">
            <code className="text-purple-300">{campaign.campaign_id}</code> · {campaign.status}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Sinh được {campaign.generated}, hỏng {campaign.failed} trên {total} ô đã khoanh
          </p>
        </div>
        {campaign.status === "running" && (
          <button type="button" onClick={onStop}
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs flex items-center gap-2">
            <Square className="w-3 h-3" /> Dừng
          </button>
        )}
      </div>

      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full bg-purple-500 transition-all"
             style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <div className="space-y-2">
        {campaign.requests.map((r) => (
          <div key={r.request_id} className="text-xs border border-slate-700/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={
                r.status === "done" ? "text-emerald-400 font-bold"
                : r.status === "failed" ? "text-red-400 font-bold" : "text-amber-400 font-bold"
              }>
                {r.status}
              </span>
              {r.scenario_id && <code className="text-sky-300">{r.scenario_id}</code>}
              {r.maneuver && (
                <span className="text-slate-500">
                  {LABELS[r.weather ?? ""] ?? r.weather} · {LABELS[r.actor_type ?? ""] ?? r.actor_type} ·{" "}
                  {LABELS[r.maneuver] ?? r.maneuver}
                </span>
              )}
            </div>
            {/* Câu do agent viết — hiện nguyên văn để người duyệt đối chiếu được
                với kịch bản sinh ra, đúng như câu người dùng tự gõ ở chế độ cơ bản. */}
            <p className="text-slate-300 leading-relaxed">{r.description_vi}</p>
          </div>
        ))}
      </div>
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
      <span className="block text-xs text-slate-400 mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} type="button" onClick={() => toggle(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    value.includes(option)
                      ? "bg-purple-600/20 border-purple-500 text-purple-200"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}>
            {LABELS[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  );
}
