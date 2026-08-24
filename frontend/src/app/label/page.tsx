"use client";

/**
 * Chấm tay: "kịch bản này có tái hiện đúng ý định không?"
 *
 * Vì sao trang này tồn tại
 * ------------------------
 * Mức L4 do máy chấm bằng luật ta tự viết, với ngưỡng ta tự đo. Không có nhãn
 * người thì câu trả lời cho "ai nói kịch bản này đúng" là **máy tự chấm máy**,
 * và một hệ đo tự chấm không thấy được điểm mù của chính nó.
 *
 * Bằng chứng: ngày 23/08 có kịch bản jaywalk cho người đi bộ đứng GIỮA LÀN XE
 * CHẠY rồi đi dọc cao tốc. Nó qua sạch L1-L4. Không chỉ số nào kêu; một người
 * nhìn 5 giây thì kêu ngay.
 *
 * Hai quyết định thiết kế không được đổi
 * --------------------------------------
 * 1. **Không hiện phán quyết của máy trước khi người bấm.** Hiện sẵn thì người
 *    chấm gật theo, và mức khớp thu được là con số vô nghĩa. Đây là chỗ dễ tự
 *    lừa nhất trong cả phép đo. Backend cũng không gửi nó xuống.
 * 2. **Vẽ rõ lề đường.** Bản phát lại cũ chỉ vẽ vạch làn chung chung, nên người
 *    đi bộ đứng giữa làn xe chạy trông y hệt người đứng ở lề — đúng lý do lỗi
 *    kia ẩn được lâu như vậy.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { getLabelQueue, submitIntentLabel } from "@/services/api";
import type { LabelQueueItem } from "@/types";
import { useAuth } from "@/context/AuthContext";

export default function LabelPage() {
  return (
    <AuthGate>
      <LabelContent />
    </AuthGate>
  );
}

function LabelContent() {
  const { user } = useAuth();
  const labeller = (typeof user === "string" ? user : user?.username) ?? "unknown";
  const [items, setItems] = useState<LabelQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLabelQueue(labeller)
      .then((r) => setItems(r.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [labeller]);

  const current = items[index];

  const send = useCallback(
    async (label: "correct" | "wrong" | "unsure") => {
      if (!current || saving) return;
      setSaving(true);
      try {
        await submitIntentLabel(current.scenario_id, { label, reason, labeller });
        setItems((prev) => prev.map((it, i) => (i === index ? { ...it, labelled: true } : it)));
        setReason("");
        setIndex((i) => Math.min(i + 1, items.length - 1));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [current, index, items.length, labeller, reason, saving],
  );

  if (error) return <Shell><p className="text-red-500 text-sm">{error}</p></Shell>;
  if (!items.length) return <Shell><p className="text-slate-400 text-sm">Đang tải…</p></Shell>;

  const done = items.filter((i) => i.labelled).length;

  return (
    <Shell>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          Kịch bản {index + 1}/{items.length} · đã chấm {done}
        </span>
        <div className="flex gap-1">
          {items.map((it, i) => (
            <button
              key={it.scenario_id}
              type="button"
              onClick={() => setIndex(i)}
              title={it.scenario_id}
              className={`w-2.5 h-2.5 rounded-full transition ${
                i === index ? "bg-sky-400" : it.labelled ? "bg-emerald-600" : "bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>

      <section className="glass-card p-6 space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
            Câu mô tả gốc — đây là thứ bạn chấm kịch bản dựa vào
          </p>
          <p className="text-slate-100 leading-relaxed">{current.description_vi}</p>
          <p className="text-xs text-slate-500 mt-2 font-mono">
            {current.scenario_id} · {current.maneuver} · {current.road_type}
          </p>
        </div>

        {/* `key` để React dựng lại hẳn component khi đổi kịch bản: reset khung
            hình bằng setState trong effect là cascading render, và eslint chặn. */}
        <Replay key={current.scenario_id} item={current} />

        <div className="space-y-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do (không bắt buộc) — nếu sai thì sai ở chỗ nào?"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100
                       placeholder:text-slate-600 focus:outline-none focus:border-sky-600"
          />
          <div className="grid grid-cols-3 gap-3">
            <Choice icon={<CheckCircle2 className="w-4 h-4" />} tone="ok"
                    onClick={() => send("correct")} disabled={saving} label="Đúng ý định" />
            <Choice icon={<XCircle className="w-4 h-4" />} tone="bad"
                    onClick={() => send("wrong")} disabled={saving} label="Sai" />
            <Choice icon={<HelpCircle className="w-4 h-4" />} tone="meh"
                    onClick={() => send("unsure")} disabled={saving} label="Không chắc" />
          </div>
          <p className="text-[11px] text-slate-500">
            &ldquo;Không chắc&rdquo; <strong>không</strong> bị tính vào mẫu số. Ép người đang lưỡng lự
            chọn bên là tự tạo ra dữ liệu mà chính họ không tin.
          </p>
        </div>
      </section>
    </Shell>
  );
}

const VIEW_W = 720;
const VIEW_H = 260;
const LANE = 3.5;

/** Ngoài ngần này mét thì tác nhân không còn ở trên đường. Mặt cắt rộng 14 m
 *  (hai lề + hai làn), cộng biên cho người đi bộ bước qua khỏi lề. */
const OFF_ROAD_M = 15;

/** Mặt cắt ngang đo trên anchor Town04 (road 23, lane -3), 23/08/2026.
 *  Toạ độ ngang cùng dấu với `lane_offset`, xác nhận trên sc_011. */
const CROSS_SECTION = [
  { from: 1.75, to: 5.25, kind: "shoulder", label: "lề (offset +1)" },
  { from: -1.75, to: 1.75, kind: "ego", label: "làn ego" },
  { from: -5.25, to: -1.75, kind: "driving", label: "làn xe chạy (offset −1)" },
  { from: -8.75, to: -5.25, kind: "shoulder", label: "lề (offset −2)" },
] as const;

function Replay({ item }: { item: LabelQueueItem }) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Cắt tại va chạm đầu tiên. Sau cú đâm, xe bị hất khỏi làn và mọi thứ vẽ ra
  // đều là rác: đo trên sc_011, lệch ngang nhảy từ 3,8 m lên 153,5 m và xe kết
  // thúc ở 208 m sau lưng ego — nên tác nhân trông như đi giật lùi, và trục ngang
  // phải phủ hàng trăm mét khiến cả mặt cắt đường bị ép thành một dải mỏng.
  //
  // Cùng phép cắt mà `trajectory.summarise` áp cho số liệu; bản phát lại không
  // cắt là hai nơi kể hai câu chuyện khác nhau về cùng một lượt chạy.
  const shown = useMemo(() => {
    const contact = item.contact_time_s;
    const byContact = contact == null ? -1 : item.trajectory.findIndex((p) => p.t > contact);
    // Chốt chặn thứ hai, đọc thẳng từ dữ liệu: mặt cắt chỉ rộng 14 m, nên lệch
    // ngang quá OFF_ROAD_M nghĩa là tác nhân không còn ở trên đường — bị hất bay
    // sau va chạm, hoặc bị xoá. Có nó thì bản phát lại vẫn đúng cả với lượt chạy
    // cũ không kèm `contact_time_s`, thay vì phụ thuộc vào một trường có thể vắng.
    const byOffRoad = item.trajectory.findIndex((p) => Math.abs(p.rel?.[1] ?? 0) > OFF_ROAD_M);
    const cuts = [byContact, byOffRoad].filter((i) => i > 0);
    const end = cuts.length ? Math.min(...cuts) : -1;
    return end > 0 ? item.trajectory.slice(0, end) : item.trajectory;
  }, [item.trajectory, item.contact_time_s]);

  const rels = useMemo(
    () => shown.map((p) => p.rel ?? ([0, 0] as [number, number])),
    [shown],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setFrame((f) => (f + 1 >= rels.length ? 0 : f + 1)), 60);
    return () => clearInterval(id);
  }, [playing, rels.length]);

  const view = useMemo(() => {
    const maxLon = Math.min(Math.max(...rels.map((r) => Math.abs(r[0]))) + 5, 60);
    // Trục ngang luôn phủ trọn mặt cắt: co lại theo dữ liệu thì lề biến mất khỏi
    // hình, mà lề chính là thứ cần nhìn.
    // Chặn trên 12 m: mặt cắt chỉ rộng 14 m, nên khung rộng hơn thế chỉ làm
    // đường mỏng đi mà không thêm thông tin. Chặn dưới 9 m để lề luôn nằm trong
    // khung — lề chính là thứ cần nhìn.
    const lat = Math.min(12, Math.max(9.0, Math.max(...rels.map((r) => Math.abs(r[1]))) + 1));
    const sx = (VIEW_W - 40) / (2 * maxLon);
    const sy = (VIEW_H - 30) / (2 * lat);
    return {
      maxLon,
      x: (lon: number) => VIEW_W / 2 + lon * sx,
      y: (l: number) => VIEW_H / 2 + l * sy,
    };
  }, [rels]);

  // Tốc độ THẬT của hai xe, tính từ vị trí thế giới ở hai tick liền nhau.
  //
  // Không có nó thì hệ quy chiếu ego đánh lừa người xem: một xe bò 10 km/h phía
  // trước trông y hệt một xe đang lao ngược chiều về phía bạn, vì ego đuổi tới
  // với 85 km/h nên khoảng cách co lại rất nhanh. Đo trên sc_023 đúng như vậy —
  // và nhầm chỗ này thì mọi nhãn `stop_in_lane`, `sudden_brake` và `wrong_way`
  // đều sai.
  const speeds = useMemo(() => {
    const kmh = (a: [number, number, number], b: [number, number, number], dt: number) =>
      dt > 0 ? (Math.hypot(b[0] - a[0], b[1] - a[1]) / dt) * 3.6 : 0;
    return shown.map((p, i) => {
      const next = shown[i + 1];
      if (!next) return { adv: 0, ego: 0 };
      const dt = next.t - p.t;
      return { adv: kmh(p.adv, next.adv, dt), ego: kmh(p.ego, next.ego, dt) };
    });
  }, [shown]);

  const [curLon, curLat] = rels[Math.min(frame, rels.length - 1)];
  const speed = speeds[Math.min(frame, speeds.length - 1)] ?? { adv: 0, ego: 0 };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-x-auto">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full min-w-[600px]"
             role="img" aria-label="Đường đi đo được của tác nhân so với ego">
          {CROSS_SECTION.map((band) => {
            const top = view.y(band.to);
            const height = view.y(band.from) - top;
            const fill =
              band.kind === "shoulder" ? "#78350f" : band.kind === "ego" ? "#1e293b" : "#0f172a";
            return (
              <g key={band.label}>
                <rect x={0} y={top} width={VIEW_W} height={height} fill={fill}
                      opacity={band.kind === "shoulder" ? 0.45 : 1} />
                <text x={VIEW_W - 8} y={top + height / 2 + 3} textAnchor="end"
                      className="fill-slate-500 text-[9px]">{band.label}</text>
              </g>
            );
          })}
          {[5.25, 1.75, -1.75, -5.25].map((l) => (
            <line key={l} x1={0} x2={VIEW_W} y1={view.y(l)} y2={view.y(l)}
                  stroke="#475569" strokeWidth={1} strokeDasharray={Math.abs(l) > 3 ? undefined : "8 8"} />
          ))}

          <rect x={view.x(0) - 9} y={view.y(0) - 5} width={18} height={10} rx={2} fill="#0ea5e9" />
          <text x={view.x(0)} y={view.y(0) + 22} textAnchor="middle"
                className="fill-sky-300 text-[10px] font-bold">ego</text>

          <line x1={view.x(0)} y1={view.y(0)} x2={view.x(curLon)} y2={view.y(curLat)}
                stroke="#475569" strokeWidth={1.5} strokeDasharray="4 5" />
          <circle cx={view.x(curLon)} cy={view.y(curLat)} r={6} fill="#f59e0b" />

          <text x={12} y={VIEW_H - 6} className="fill-slate-500 text-[10px]">
            ← sau ego {view.maxLon.toFixed(0)}m
          </text>
          <text x={VIEW_W - 12} y={VIEW_H - 6} textAnchor="end" className="fill-slate-500 text-[10px]">
            trước ego {view.maxLon.toFixed(0)}m →
          </text>
        </svg>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setPlaying((p) => !p)}
                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs hover:bg-sky-700">
          {playing ? "Dừng" : "Chạy"}
        </button>
        <input type="range" min={0} max={Math.max(rels.length - 1, 0)} value={frame}
               onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
               className="flex-1 accent-sky-500" />
        <span className="text-xs text-slate-500 tabular-nums w-14 text-right">
          {shown[Math.min(frame, shown.length - 1)]?.t.toFixed(1)}s
        </span>
      </div>

      <div className="flex gap-4 text-xs tabular-nums">
        <span className="text-amber-400">tác nhân {speed.adv.toFixed(0)} km/h</span>
        <span className="text-sky-400">ego {speed.ego.toFixed(0)} km/h</span>
        <span className="text-slate-500">
          {curLon >= 0 ? `trước ego ${curLon.toFixed(0)} m` : `sau ego ${Math.abs(curLon).toFixed(0)} m`}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Ego đứng yên ở giữa; mỗi frame là vị trí tương đối <strong>đo được</strong>, không phải dựng
        lại. Không nối các frame thành đường vì hệ trục quay theo ego ở từng thời điểm — nối chúng
        sẽ tạo ra một quỹ đạo giả. Vùng nâu là <strong>lề đường</strong>; {LANE} m là bề rộng một làn.
        Vì ego đứng yên trên hình, một xe <strong>chạy chậm cùng chiều</strong> trông như đang lùi về
        phía bạn — đọc cột <strong>km/h</strong> để phân biệt với xe đi ngược chiều thật.
        {item.contact_time_s != null && (
          <> Bản phát lại <strong>dừng ở giây {item.contact_time_s.toFixed(1)}</strong> khi xảy ra va
          chạm: sau cú đâm xe bị hất khỏi làn nên mọi số đo thành vô nghĩa.</>
        )}
      </p>
    </div>
  );
}

function Choice({ icon, label, tone, onClick, disabled }: {
  icon: React.ReactNode; label: string; tone: "ok" | "bad" | "meh";
  onClick: () => void; disabled: boolean;
}) {
  const styles = {
    ok: "border-emerald-700 text-emerald-300 hover:bg-emerald-950",
    bad: "border-red-800 text-red-300 hover:bg-red-950",
    meh: "border-slate-700 text-slate-300 hover:bg-slate-800",
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm
                        font-medium transition disabled:opacity-50 ${styles}`}>
      {icon}{label}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 p-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Chấm ý định</h1>
        <p className="text-sm text-slate-400 mt-1 leading-relaxed">
          Kịch bản có tái hiện đúng thứ câu mô tả nói không? Phán quyết của máy được{" "}
          <strong>giấu đi</strong> cho tới khi bạn bấm — thấy trước thì sẽ gật theo, và con số khớp
          thu được là con số vô nghĩa.
        </p>
      </header>
      {children}
    </div>
  );
}
