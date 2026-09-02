"use client";

/**
 * Preview kịch bản — hai chế độ theo hai cổng duyệt.
 *
 * Bản preview 2D trước đây bị bỏ vì nó **suy diễn**: dựng lại hình học đường và
 * làn từ `lane_offset` rồi vẽ ra một thế giới không ai kiểm chứng. Ngày
 * 22/08/2026 đo trên CARLA phát hiện ba lỗi ngữ nghĩa mà bản vẽ đó không thể
 * hiện được — tệ nhất là một kịch bản khai là `cut_in` nhưng thực tế adversary
 * tông vào đuôi ego. Sơ đồ suy diễn sẽ vẽ một cú tạt đầu đẹp đẽ cho đúng file đó.
 *
 * Nên component này chỉ hiện thứ biết chắc:
 *
 *   Cổng 1 (BEFORE_SIM)      — chưa chạy, chưa có gì để vẽ.
 *                              Hiện BẢN KHAI: đọc lại thẳng con số trong spec.
 *   Cổng 2 (BEFORE_LIBRARY)  — đã có quỹ đạo đo từ CARLA.
 *                              Hiện BẢN CHẠY THẬT: vẽ lại đúng dữ liệu đo.
 *
 * Không có chế độ nào đoán trước điều gì sẽ xảy ra.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Clock, Pause, Play, Route } from "lucide-react";
import type { ExecutionResult, ScenarioSpec } from "@/types";

const VIEW_W = 720;
const VIEW_H = 320;
const PAD = 28;

interface Props {
  spec?: ScenarioSpec;
  execution?: ExecutionResult | null;
}

export default function ScenarioPreview({ spec, execution }: Props) {
  const trajectory = execution?.trajectory ?? [];
  return trajectory.length > 1 ? (
    <MeasuredReplay execution={execution!} />
  ) : (
    <DeclaredSummary spec={spec} />
  );
}

/* ------------------------------------------------------------------ */
/* Cổng 1 — bản khai: đọc lại spec, không vẽ hình học                  */
/* ------------------------------------------------------------------ */

function DeclaredSummary({ spec }: { spec?: ScenarioSpec }) {
  if (!spec?.actors?.length) {
    return <Empty text="Chưa có spec để hiển thị." />;
  }

  const ego = spec.actors.find((a) => a.is_ego);
  const events = [
    { t: 0, text: `Đặt xe vào vị trí, ego chạy ${ego?.initial_speed_kmh ?? "?"} km/h` },
    ...(spec.maneuvers ?? []).map((m) => ({
      t: m.trigger?.type === "simulation_time" ? Number(m.trigger.value) : Number.NaN,
      text:
        m.trigger?.type === "simulation_time"
          ? `${m.actor_name}: ${m.maneuver}` +
            (m.target_speed_kmh != null ? ` → ${m.target_speed_kmh} km/h` : "")
          : `${m.actor_name}: ${m.maneuver} khi cách ego ${m.trigger?.value} m`,
    })),
    { t: Number(spec.duration_s), text: "Kết thúc kịch bản" },
  ];

  return (
    <div className="space-y-4">
      <Note>
        Kịch bản <strong>chưa chạy</strong>, nên đây là <strong>bản khai</strong> — đọc lại đúng
        những con số trong file, không dựng lại hình học. Sơ đồ dự đoán đã bị bỏ vì nó vẽ được cả
        những tình huống không hề xảy ra khi chạy thật.
      </Note>

      <ol className="relative border-l-2 border-sky-300 dark:border-slate-700 ml-3 space-y-3">
        {events.map((e, i) => (
          <li key={i} className="ml-4">
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-sky-500 dark:bg-sky-400" />
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                {Number.isNaN(e.t) ? "—" : `${e.t.toFixed(1)}s`}
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-200">{e.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cổng 2 — bản chạy thật: vẽ lại quỹ đạo đo được                      */
/* ------------------------------------------------------------------ */

function MeasuredReplay({ execution }: { execution: ExecutionResult }) {
  // useMemo để danh tính mảng ổn định giữa các lần render: `?? []` dựng mảng mới
  // mỗi lần, làm phép chiếu khung nhìn tính lại vô ích trong lúc kéo thanh thời gian.
  const metrics = execution.metrics ?? {};
  const allPoints = useMemo(() => execution.trajectory ?? [], [execution.trajectory]);
  const contactTime = metrics.contact_time_s;
  const points = useMemo(() => {
    if (contactTime == null) return allPoints;
    const firstAfterContact = allPoints.findIndex((point) => point.t > contactTime);
    return firstAfterContact > 0 ? allPoints.slice(0, firstAfterContact) : allPoints;
  }, [allPoints, contactTime]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setTimeout(() => {
      const next = Math.min(frame + 1, points.length - 1);
      setFrame(next);
      if (next >= points.length - 1) setPlaying(false);
    }, 60);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frame, playing, points.length]);

  // Phát lại trong HỆ QUY CHIẾU EGO, không phải hệ toạ độ thế giới.
  //
  // Ở hệ thế giới, khung nhìn phải phủ cả quãng đường ego chạy — đo trên sc_012
  // là 320 m, tức 2,08 px mỗi mét, nên bề rộng một làn (3,5 m) chỉ còn 7,3 px và
  // cả cú tạt đầu biến mất. Hơn nửa bản vẽ khi đó là ego chạy một mình sau khi
  // hai xe đã rời nhau 265 m.
  //
  // Đặt ego ở gốc thì khung chỉ cần phủ khoảng cách GIỮA hai xe, và cú tạt đầu
  // hiện ra đúng tỉ lệ. Nhưng hệ trục này quay theo ego ở TỪNG tick: mỗi điểm
  // riêng lẻ đúng, còn nối chúng thành một polyline sẽ tạo ra một đường giả mà
  // xe không hề chạy trên CARLA. Vì vậy chỉ vẽ trạng thái của frame hiện tại.
  const rels = useMemo(
    () => points.map((p) => p.rel ?? ([0, 0] as [number, number])),
    [points],
  );

  const view = useMemo(() => {
    const lons = rels.map((r) => r[0]);
    const lats = rels.map((r) => r[1]);
    // Giới hạn khung theo cửa sổ tương tác: quá 60 m thì hai xe không còn liên
    // quan tới nhau, kéo dài trục chỉ làm nhỏ phần đáng nhìn.
    const maxLon = Math.min(Math.max(...lons.map(Math.abs)) + 5, 60);
    const maxLat = Math.max(Math.max(...lats.map(Math.abs)) + 1.5, 5.25);
    const sx = (VIEW_W - 2 * PAD) / (2 * maxLon);
    const sy = (VIEW_H - 2 * PAD) / (2 * maxLat);
    const project = (lon: number, lat: number): [number, number] => [
      VIEW_W / 2 + lon * sx,
      VIEW_H / 2 + lat * sy,
    ];
    return { project, sx, sy, maxLon, maxLat };
  }, [rels]);

  const current = points[Math.min(frame, points.length - 1)];
  const [curLon, curLat] = rels[Math.min(frame, rels.length - 1)];
  const [advX, advY] = view.project(curLon, curLat);
  const [egoX, egoY] = view.project(0, 0);

  const contactIndex =
    contactTime == null
      ? -1
      : points.reduce(
          (best, p, i) =>
            Math.abs(p.t - contactTime) < Math.abs(points[best].t - contactTime) ? i : best,
          0,
        );
  const showContact = contactIndex >= 0 && frame >= contactIndex;

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (frame >= points.length - 1) setFrame(0);
    setPlaying(true);
  };

  return (
    <div className="space-y-4">
      <Note>
        Đây là <strong>bản phát lại từng thời điểm</strong> từ dữ liệu đo trên CARLA: ego đứng yên ở
        giữa, vị trí tác nhân được chiếu theo hướng ego ở frame đang xem. Các frame không được nối
        thành đường vì hệ trục quay theo ego; nối lại sẽ tạo cảm giác xe đi ngoằn ngoèo dù CARLA
        không hề chạy như vậy.
      </Note>

      <div className="rounded-2xl border border-sky-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-x-auto">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full min-w-[560px]" role="img"
             aria-label="Đường đi của tác nhân trong hệ quy chiếu ego">
          {/* Vạch làn: ±1,75 m và ±5,25 m quanh tim làn ego — bề rộng làn tiêu chuẩn.
              Đây là thứ DUY NHẤT trên bản vẽ không phải số đo, nên vẽ mờ, coi như lưới. */}
          {[-5.25, -1.75, 1.75, 5.25].map((lat) => {
            const [, y] = view.project(0, lat);
            return (
              <line key={lat} x1={0} x2={VIEW_W} y1={y} y2={y} stroke="currentColor"
                    className="text-slate-300 dark:text-slate-700" strokeWidth={1}
                    strokeDasharray={Math.abs(lat) > 3 ? undefined : "8 8"} />
            );
          })}

          <line x1={egoX} y1={egoY} x2={advX} y2={advY} stroke="currentColor"
                className="text-slate-300 dark:text-slate-700" strokeWidth={1.5}
                strokeDasharray="4 5" />

          {/* Ego đứng yên ở gốc — cả bản vẽ là "tác nhân đi thế nào so với ego". */}
          <rect x={egoX - 8} y={egoY - 5} width={16} height={10} rx={2}
                className="fill-sky-600 dark:fill-sky-400" />
          <text x={egoX} y={egoY + 22} textAnchor="middle"
                className="fill-sky-700 dark:fill-sky-300 text-[10px] font-bold">ego</text>

          <rect x={advX - 8} y={advY - 5} width={16} height={10} rx={2} className="fill-amber-500" />

          {/* Chỉ đánh dấu khi phát lại đã tới va chạm. Vòng đỏ bao quanh xe tác
              nhân ở frame đó; nó không giả vờ là điểm tiếp xúc trên thân xe. */}
          {showContact && (
            <>
              <rect x={advX - 13} y={advY - 10} width={26} height={20} rx={6}
                    fill="none" stroke="currentColor" className="text-red-500" strokeWidth={2} />
              <text x={advX + 17} y={advY + 4} className="fill-red-500 text-[11px] font-bold">
                va chạm {contactTime?.toFixed(1)}s
              </text>
            </>
          )}

          <text x={PAD} y={PAD - 8} className="fill-slate-500 dark:fill-slate-400 text-[10px] font-medium">
            {curLon >= 0 ? `tác nhân trước ego ${curLon.toFixed(1)} m` : `tác nhân sau ego ${Math.abs(curLon).toFixed(1)} m`}
            {` · lệch ngang ${curLat.toFixed(1)} m`}
          </text>

          <text x={PAD} y={VIEW_H - 8} className="fill-slate-400 text-[10px]">
            ← sau ego {view.maxLon.toFixed(0)}m
          </text>
          <text x={VIEW_W - PAD} y={VIEW_H - 8} textAnchor="end" className="fill-slate-400 text-[10px]">
            trước ego {view.maxLon.toFixed(0)}m →
          </text>
        </svg>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={togglePlayback}
                className="p-2 rounded-full bg-sky-600 text-white hover:bg-sky-700 transition"
                aria-label={playing ? "Tạm dừng" : "Chạy lại"}>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <input type="range" min={0} max={points.length - 1} value={frame}
               onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
               className="flex-1 accent-sky-600" aria-label="Thời điểm" />
        <span className="font-mono text-xs font-bold tabular-nums text-slate-600 dark:text-slate-300 w-14 text-right">
          {current.t.toFixed(1)}s
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metric icon={<Route className="w-3.5 h-3.5" />} label="Khe hở nhỏ nhất"
                value={fmt(metrics.min_distance_m, "m")}
                hint="Giữa hai thân xe. 0 = đã chạm." />
        {/* TTC là phép đo DỌC, chỉ tính khi hai xe cùng hành lang. Với xung đột
            cắt ngang — `run_red_light` — actor đi trên đường vuông góc nên lệch
            ngang tới hàng chục mét và TTC không bao giờ đo được. Thước đúng ở đó
            là PET, chênh thời gian giữa lúc xe này rời điểm xung đột và xe kia
            tới đúng điểm đó. Chọn theo phép đo NÀO ĐO ĐƯỢC chứ không theo
            maneuver: chính sự vắng mặt của TTC đã nói hai xe không cùng hành
            lang. Đo 03/09: cả 10 biến thể run_red_light có TTC rỗng, còn
            `sc_116_t1` có PET 0,24 s — rất sát, mà màn hình cũ chỉ hiện
            "không đo được". */}
        {metrics.ttc_min_s == null && metrics.pet_min_s != null ? (
          <Metric icon={<Clock className="w-3.5 h-3.5" />} label="PET nhỏ nhất"
                  value={fmt(metrics.pet_min_s, "s")}
                  hint="Chênh thời gian hai xe qua điểm cắt. Thước cho xung đột cắt ngang." />
        ) : (
          <Metric icon={<Clock className="w-3.5 h-3.5" />} label="TTC nhỏ nhất"
                  value={fmt(metrics.ttc_min_s, "s")} hint="Chỉ tính khi cùng làn và đang thu hẹp." />
        )}
        <Metric icon={<Activity className="w-3.5 h-3.5" />} label="Lệch làn của tác nhân"
                value={fmt(metrics.adversary_lane_deviation_m, "m")}
                hint="≈0 = không có hành vi ngang. Đúng cho lane_drift; với run_red_light thì ≈0 mới là đúng, vì xe đi thẳng qua nút giao." />
        <Metric icon={<Activity className="w-3.5 h-3.5" />} label="Ai va chạm"
                value={
                  metrics.contact_longitudinal_m == null
                    ? "không va chạm"
                    : metrics.contact_longitudinal_m < 0
                      ? "tác nhân tông đuôi ego"
                      : "ego đâm vào tác nhân"
                }
                hint="Dấu vị trí tác nhân lúc chạm — phân biệt tạt đầu với tông đuôi." />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function fmt(value: number | undefined, unit: string) {
  return value == null ? "không đo được" : `${value.toFixed(2)} ${unit}`;
}

function Metric({ icon, label, value, hint }: {
  icon: React.ReactNode; label: string; value: string; hint: string;
}) {
  return (
    <div title={hint}
         className="bg-sky-100/60 dark:bg-slate-800 border border-sky-300/70 dark:border-slate-700 rounded-xl p-3">
      <span className="text-[10px] uppercase font-bold text-blue-800/80 dark:text-slate-400 flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="text-xs font-bold text-[#0f2d59] dark:text-sky-100">{value}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{children}</p>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">{text}</p>;
}
